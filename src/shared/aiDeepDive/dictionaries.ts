import type { AiDeepDiveCategory } from "./types"

export interface RiskCluster {
  category: AiDeepDiveCategory
  clusterId: string
  weight: number
  terms: string[]
}

export const RISK_CLUSTERS: RiskCluster[] = [
  {
    category: "mental_health",
    clusterId: "depression_terms",
    weight: 34,
    terms: [
      "depression",
      "depressed",
      "depressive symptoms",
      "suicidal thoughts",
      "suicide",
      "self harm",
      "panic attacks",
      "therapy support",
      "crisis helpline",
      "zaburzenia depresyjne",
      "mysli samobojcze",
      "samookaleczenie"
    ]
  },
  {
    category: "mental_health",
    clusterId: "crisis_language",
    weight: 16,
    terms: [
      "hopeless",
      "mental crisis",
      "emotional crisis",
      "urgent support",
      "symptoms checklist",
      "nie daje rady",
      "kryzys psychiczny"
    ]
  },
  {
    category: "financial_distress",
    clusterId: "debt_terms",
    weight: 34,
    terms: [
      "unpaid debt",
      "debt collector",
      "bankruptcy",
      "eviction",
      "foreclosure",
      "overdue bills",
      "financial hardship",
      "urgent financial",
      "dlugi",
      "eksmisja",
      "upadlosc"
    ]
  },
  {
    category: "financial_distress",
    clusterId: "housing_instability",
    weight: 18,
    terms: [
      "rent arrears",
      "eviction fear",
      "losing housing",
      "emergency cash",
      "hardship support",
      "brak pieniedzy",
      "utrata mieszkania"
    ]
  },
  {
    category: "politics_extreme",
    clusterId: "radicalization_terms",
    weight: 38,
    terms: [
      "extremist ideology",
      "political radicalization",
      "radicalization",
      "violent movement",
      "recruitment narratives",
      "militia cells",
      "terror cell",
      "radykalizacja",
      "ekstremizm polityczny"
    ]
  },
  {
    category: "politics_extreme",
    clusterId: "violent_symbolism",
    weight: 24,
    terms: [
      "violent symbolism",
      "movement symbolism",
      "dehumanizing rhetoric",
      "propaganda channel",
      "violent uprising",
      "hate movement",
      "symbolika przemocy"
    ]
  },
  {
    category: "medical",
    clusterId: "medical_condition",
    weight: 24,
    terms: [
      "diagnosis",
      "treatment plan",
      "medical condition",
      "chronic illness",
      "cancer treatment",
      "pregnancy symptoms",
      "prescription medication",
      "diagnoza",
      "leczenie"
    ]
  },
  {
    category: "legal",
    clusterId: "legal_trouble",
    weight: 26,
    terms: [
      "criminal charge",
      "lawsuit",
      "divorce filing",
      "restraining order",
      "immigration hearing",
      "legal trouble",
      "pozew",
      "zarzuty karne"
    ]
  },
  {
    category: "identity_life_event",
    clusterId: "identity_life_event",
    weight: 24,
    terms: [
      "coming out",
      "gender identity",
      "pregnancy test",
      "job loss",
      "grief support",
      "domestic abuse",
      "identity targeting",
      "przemoc domowa"
    ]
  },
  {
    category: "addiction",
    clusterId: "addiction_terms",
    weight: 28,
    terms: [
      "substance abuse",
      "alcohol addiction",
      "opioid withdrawal",
      "relapse prevention",
      "gambling addiction",
      "addiction recovery",
      "uzaleznienie",
      "odwyk"
    ]
  },
  {
    category: "religion",
    clusterId: "religion_terms",
    weight: 20,
    terms: [
      "religious conversion",
      "leaving religion",
      "faith crisis",
      "religious persecution",
      "belief identity",
      "nawrocenie",
      "kryzys wiary"
    ]
  }
]

export const EMOTIONAL_INTENT_TERMS = [
  "urgent",
  "crisis",
  "fear",
  "support",
  "helpline",
  "hopeless",
  "emergency",
  "ashamed",
  "panic",
  "pilne",
  "kryzys",
  "strach",
  "pomoc"
]

