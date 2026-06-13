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
      "depresja",
      "depresji",
      "depresje",
      "objawy depresji",
      "stany depresyjne",
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
      "kryzys psychiczny",
      "rozpacz",
      "bezradnosc",
      "bol psychiczny",
      "uciec przed sama soba",
      "poczucie wlasnej wartosci"
    ]
  },
  {
    category: "mental_health",
    clusterId: "psychological_profile_terms",
    weight: 28,
    terms: [
      "psychologia",
      "samoocena",
      "emocje",
      "zlosc",
      "wkurzenie",
      "rozpacz",
      "bezradnosc",
      "poczucie wlasnej wartosci",
      "uciec przed sama soba"
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
      "dlug",
      "zadluzenie",
      "komornik",
      "windykacja",
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
      "trudna sytuacja finansowa",
      "problemy finansowe",
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
      "ekstremizm polityczny",
      "radykalne poglady",
      "skrajna prawica",
      "skrajna lewica"
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
      "symbolika przemocy",
      "mowa nienawisci",
      "propaganda"
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
      "leczenie",
      "choroba",
      "objawy",
      "recepta",
      "terapia"
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
      "zarzuty karne",
      "zarzuty",
      "oskarzenie",
      "rozwod",
      "prokuratura"
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
      "przemoc domowa",
      "zaloba",
      "utrata pracy",
      "coming out",
      "tozsamosc plciowa"
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
      "uzaleznienie od alkoholu",
      "narkotyki",
      "hazard",
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
      "kryzys wiary",
      "religia",
      "wiara",
      "kosciol",
      "ksiadz",
      "ksieza",
      "duchowny"
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
  "pomoc",
  "zlosc",
  "wkurzenie",
  "rozpacz",
  "bezradnosc",
  "bol"
]
