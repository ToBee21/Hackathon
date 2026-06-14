// src/shared/dataFootprint/piiFieldHeuristics.ts
// Pure, dependency-free heuristics for the Data Footprint feature. They classify
// a form field's METADATA (type / name / id / autocomplete / placeholder / label
// — NEVER its value) into a personal-data category, and summarize how data-hungry
// a page is. Zero network, zero DOM access here → fully unit-testable.
//
// Privacy contract: this module only ever sees field metadata, never user input
// values. The content scanner that builds FormFieldMeta must uphold that.

export type PiiCategory =
  | "payment"
  | "gov_id"
  | "dob"
  | "postal"
  | "phone"
  | "email"
  | "name"
  | "password"

export interface FormFieldMeta {
  /** input type attribute (or tag name), lowercased. */
  type: string
  name: string
  id: string
  /** autocomplete attribute — the strongest, least ambiguous signal. */
  autocomplete: string
  placeholder: string
  /** aria-label or associated <label> text. NEVER the field's value. */
  label: string
}

export type DataFootprintLevel = "low" | "medium" | "high" | "critical"

export interface DataFootprintSummary {
  /** Distinct sensitive categories the page asks for, most-sensitive first. */
  categories: PiiCategory[]
  /** How many fields matched a sensitive category. */
  sensitiveFieldCount: number
  /** Total scanned form fields (bounded). */
  totalFieldCount: number
  /** 0-100: how data-hungry this page is. */
  score: number
  level: DataFootprintLevel
}

// Sensitivity weight per category (higher = more invasive to hand over).
const CATEGORY_WEIGHT: Record<PiiCategory, number> = {
  payment: 30,
  gov_id: 30,
  dob: 18,
  postal: 16,
  phone: 12,
  email: 10,
  name: 8,
  password: 6
}

// Display / ranking order: most sensitive first.
const CATEGORY_ORDER: PiiCategory[] = [
  "payment",
  "gov_id",
  "dob",
  "postal",
  "phone",
  "email",
  "name",
  "password"
]

// autocomplete tokens (WHATWG) → category. Strongest signal when present.
const AUTOCOMPLETE_MAP: Record<string, PiiCategory> = {
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "tel-local": "phone",
  name: "name",
  "given-name": "name",
  "additional-name": "name",
  "family-name": "name",
  "honorific-prefix": "name",
  "street-address": "postal",
  "address-line1": "postal",
  "address-line2": "postal",
  "postal-code": "postal",
  "address-level1": "postal",
  "address-level2": "postal",
  country: "postal",
  "country-name": "postal",
  bday: "dob",
  "bday-day": "dob",
  "bday-month": "dob",
  "bday-year": "dob",
  "cc-number": "payment",
  "cc-name": "payment",
  "cc-exp": "payment",
  "cc-exp-month": "payment",
  "cc-exp-year": "payment",
  "cc-csc": "payment",
  "current-password": "password",
  "new-password": "password"
}

// input type → category (only when unambiguous).
const TYPE_MAP: Record<string, PiiCategory> = {
  email: "email",
  tel: "phone",
  password: "password"
}

// Keyword signals (PL + EN) over name/id/placeholder/label, most specific first.
const KEYWORD_RULES: Array<{ category: PiiCategory; terms: RegExp }> = [
  {
    category: "payment",
    terms: /(card[\s_-]?number|cardnumber|credit[\s_-]?card|cc[\s_-]?num|cvv|cvc|security[\s_-]?code|numer[\s_-]?karty|kod[\s_-]?cvv)/i
  },
  {
    category: "gov_id",
    terms: /(pesel|nip|regon|dowod|dowód|paszport|passport|ssn|social[\s_-]?security|national[\s_-]?id|tax[\s_-]?id|nr[\s_-]?dowodu)/i
  },
  {
    category: "dob",
    terms: /(date[\s_-]?of[\s_-]?birth|birthday|birthdate|\bdob\b|urodzen|data[\s_-]?urodzenia)/i
  },
  {
    category: "postal",
    terms: /(street|address|adres|ulica|postal|post[\s_-]?code|postcode|\bzip\b|kod[\s_-]?pocztowy|miasto|\bcity\b|wojewodztwo)/i
  },
  {
    category: "phone",
    terms: /(phone|telefon|mobile|komork|\bgsm\b|msisdn|nr[\s_-]?tel|\btel\b)/i
  },
  { category: "email", terms: /(e[\s_-]?mail|email|poczta)/i },
  {
    category: "name",
    terms: /(first[\s_-]?name|last[\s_-]?name|full[\s_-]?name|fullname|surname|given[\s_-]?name|family[\s_-]?name|imie|imię|nazwisko)/i
  }
]

function haystack(field: FormFieldMeta): string {
  return `${field.name} ${field.id} ${field.placeholder} ${field.label}`.toLowerCase()
}

/** Classify ONE field's metadata into a PII category, or null if not sensitive. */
export function classifyField(field: FormFieldMeta): PiiCategory | null {
  const ac = field.autocomplete.trim().toLowerCase()
  if (ac) {
    // autocomplete may be "section-x shipping email" → the last token is the field.
    const token = ac.split(/\s+/).pop() as string
    if (AUTOCOMPLETE_MAP[token]) return AUTOCOMPLETE_MAP[token]
  }

  const type = field.type.trim().toLowerCase()
  if (TYPE_MAP[type]) return TYPE_MAP[type]

  const hay = haystack(field)
  for (const rule of KEYWORD_RULES) {
    if (rule.terms.test(hay)) return rule.category
  }
  return null
}

function levelForScore(score: number): DataFootprintLevel {
  if (score >= 75) return "critical"
  if (score >= 45) return "high"
  if (score >= 20) return "medium"
  return "low"
}

/** Summarize a page's collected field metadata into a data-footprint verdict. */
export function summarizeFields(fields: FormFieldMeta[]): DataFootprintSummary {
  const present = new Set<PiiCategory>()
  let sensitiveFieldCount = 0

  for (const field of fields) {
    const category = classifyField(field)
    if (category) {
      present.add(category)
      sensitiveFieldCount += 1
    }
  }

  const categories = CATEGORY_ORDER.filter((c) => present.has(c))
  const base = categories.reduce((sum, c) => sum + CATEGORY_WEIGHT[c], 0)
  // Breadth bump: many sensitive fields beyond the distinct categories = hungrier.
  const breadth = Math.min(
    12,
    Math.max(0, sensitiveFieldCount - categories.length) * 3
  )
  const score = Math.round(clamp(base + breadth, 0, 100))

  return {
    categories,
    sensitiveFieldCount,
    totalFieldCount: fields.length,
    score,
    level: levelForScore(score)
  }
}

export function emptyDataFootprint(): DataFootprintSummary {
  return {
    categories: [],
    sensitiveFieldCount: 0,
    totalFieldCount: 0,
    score: 0,
    level: "low"
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
