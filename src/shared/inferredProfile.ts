// src/shared/inferredProfile.ts
// "Co o Tobie wiadomo" — profil wywnioskowany z REALNEJ historii przeglądania.
//
// W odróżnieniu od losowych/poglądowych danych, ten moduł czyta faktyczną
// historię (chrome.history, lokalnie, bez żadnej sieci), kategoryzuje odwiedzane
// domeny i pokazuje:
//   • realne zainteresowania (udział kategorii + dowody = konkretne domeny),
//   • UCZCIWIE oznaczoną "zgadywankę branży reklamowej" dla płci/wieku —
//     to stereotypowe wnioskowanie, jakie robią profilerzy reklamowi (często
//     błędne). Pokazujemy je, by uświadomić użytkownikowi skalę profilowania,
//     a nie jako fakt o nim.
//
// Wszystko liczone lokalnie. Nic nie opuszcza przeglądarki.

export interface InterestCategory {
  id: string
  label: string
  weight: number
  share: number // 0..1
  evidence: string[]
}

export interface DemographicGuess {
  label: string
  /** 0..1 — celowo zachowawcza; to zgadywanka, nie pomiar. */
  confidence: number
  basis: string
}

export interface InferredProfile {
  available: boolean
  reason?: string
  sampleSize: number
  domainsMatched: number
  interests: InterestCategory[]
  gender: DemographicGuess | null
  age: DemographicGuess | null
}

// ---------------------------------------------------------------------------
// Słownik domena → kategoria
// ---------------------------------------------------------------------------

interface CatMeta {
  label: string
  /** Stereotypowe przechylenie płci wg branży: -1 (męskie) … +1 (kobiece). */
  genderLean: number
  /** Stereotypowy przedział wiekowy targetu. */
  ageBucket: "18-24" | "25-34" | "35-44" | "45+"
}

const CATEGORY_META: Record<string, CatMeta> = {
  technology: { label: "Technologia / IT", genderLean: -0.4, ageBucket: "25-34" },
  gaming: { label: "Gry", genderLean: -0.5, ageBucket: "18-24" },
  finance: { label: "Finanse / inwestycje", genderLean: -0.3, ageBucket: "35-44" },
  shopping: { label: "Zakupy", genderLean: 0.2, ageBucket: "25-34" },
  fashion_beauty: { label: "Moda / uroda", genderLean: 0.7, ageBucket: "18-24" },
  health_fitness: { label: "Zdrowie / fitness", genderLean: 0.1, ageBucket: "25-34" },
  parenting: { label: "Rodzicielstwo", genderLean: 0.5, ageBucket: "25-34" },
  sports: { label: "Sport", genderLean: -0.4, ageBucket: "25-34" },
  news: { label: "Wiadomości", genderLean: 0, ageBucket: "35-44" },
  entertainment: { label: "Rozrywka / film", genderLean: 0, ageBucket: "18-24" },
  travel: { label: "Podróże", genderLean: 0.1, ageBucket: "25-34" },
  food: { label: "Kuchnia / jedzenie", genderLean: 0.3, ageBucket: "25-34" },
  automotive: { label: "Motoryzacja", genderLean: -0.6, ageBucket: "35-44" },
  education: { label: "Nauka / edukacja", genderLean: 0, ageBucket: "18-24" },
  career: { label: "Praca / kariera", genderLean: 0, ageBucket: "25-34" },
  social: { label: "Social media", genderLean: 0.1, ageBucket: "18-24" },
  music: { label: "Muzyka", genderLean: 0, ageBucket: "18-24" },
  adult: { label: "Treści dla dorosłych", genderLean: -0.3, ageBucket: "25-34" },
}

// Domeny rejestrowalne → kategoria. Dopasowanie po sufiksie hosta.
const DOMAIN_CATEGORY: Array<[string, string]> = [
  // technology
  ["github.com", "technology"], ["stackoverflow.com", "technology"], ["dev.to", "technology"],
  ["theverge.com", "technology"], ["arstechnica.com", "technology"], ["techcrunch.com", "technology"],
  ["news.ycombinator.com", "technology"], ["dobreprogramy.pl", "technology"], ["benchmark.pl", "technology"],
  ["xda-developers.com", "technology"], ["gsmarena.com", "technology"],
  // gaming
  ["steampowered.com", "gaming"], ["steamcommunity.com", "gaming"], ["twitch.tv", "gaming"],
  ["ign.com", "gaming"], ["gamespot.com", "gaming"], ["epicgames.com", "gaming"],
  ["gry-online.pl", "gaming"], ["polygon.com", "gaming"], ["nexusmods.com", "gaming"],
  // finance
  ["bankier.pl", "finance"], ["money.pl", "finance"], ["investing.com", "finance"],
  ["coinbase.com", "finance"], ["binance.com", "finance"], ["tradingview.com", "finance"],
  ["xtb.com", "finance"], ["mbank.pl", "finance"], ["revolut.com", "finance"], ["paypal.com", "finance"],
  // shopping
  ["allegro.pl", "shopping"], ["amazon.com", "shopping"], ["amazon.pl", "shopping"], ["ebay.com", "shopping"],
  ["aliexpress.com", "shopping"], ["olx.pl", "shopping"], ["ceneo.pl", "shopping"], ["temu.com", "shopping"],
  // fashion / beauty
  ["zalando.pl", "fashion_beauty"], ["zalando.com", "fashion_beauty"], ["sephora.com", "fashion_beauty"],
  ["asos.com", "fashion_beauty"], ["zara.com", "fashion_beauty"], ["hm.com", "fashion_beauty"],
  ["douglas.pl", "fashion_beauty"], ["rossmann.pl", "fashion_beauty"], ["vogue.com", "fashion_beauty"],
  // health / fitness
  ["myfitnesspal.com", "health_fitness"], ["strava.com", "health_fitness"], ["fitbit.com", "health_fitness"],
  ["healthline.com", "health_fitness"], ["medonet.pl", "health_fitness"], ["doz.pl", "health_fitness"],
  ["abczdrowie.pl", "health_fitness"],
  // parenting
  ["babycenter.com", "parenting"], ["pampers.com", "parenting"], ["smyk.com", "parenting"],
  ["czasdzieci.pl", "parenting"],
  // sports
  ["espn.com", "sports"], ["sport.pl", "sports"], ["przegladsportowy.pl", "sports"],
  ["transfermarkt.com", "sports"], ["flashscore.com", "sports"], ["nba.com", "sports"], ["uefa.com", "sports"],
  // news
  ["onet.pl", "news"], ["wp.pl", "news"], ["interia.pl", "news"], ["tvn24.pl", "news"],
  ["bbc.com", "news"], ["cnn.com", "news"], ["gazeta.pl", "news"], ["rmf24.pl", "news"],
  // entertainment
  ["netflix.com", "entertainment"], ["hbomax.com", "entertainment"], ["max.com", "entertainment"],
  ["disneyplus.com", "entertainment"], ["filmweb.pl", "entertainment"], ["imdb.com", "entertainment"],
  // travel
  ["booking.com", "travel"], ["airbnb.com", "travel"], ["tripadvisor.com", "travel"],
  ["skyscanner.net", "travel"], ["ryanair.com", "travel"], ["wizzair.com", "travel"],
  // food
  ["przepisy.pl", "food"], ["kwestiasmaku.com", "food"], ["allrecipes.com", "food"],
  ["pyszne.pl", "food"], ["ubereats.com", "food"],
  // automotive
  ["otomoto.pl", "automotive"], ["autotrader.com", "automotive"], ["mobile.de", "automotive"],
  ["motor1.com", "automotive"],
  // education
  ["coursera.org", "education"], ["udemy.com", "education"], ["khanacademy.org", "education"],
  ["duolingo.com", "education"], ["brainly.com", "education"], ["brainly.pl", "education"],
  // career
  ["linkedin.com", "career"], ["pracuj.pl", "career"], ["indeed.com", "career"],
  ["glassdoor.com", "career"], ["nofluffjobs.com", "career"],
  // social
  ["facebook.com", "social"], ["instagram.com", "social"], ["twitter.com", "social"], ["x.com", "social"],
  ["tiktok.com", "social"], ["reddit.com", "social"], ["snapchat.com", "social"],
  // music
  ["spotify.com", "music"], ["soundcloud.com", "music"], ["tidal.com", "music"], ["genius.com", "music"],
]

const AGE_BUCKETS = ["18-24", "25-34", "35-44", "45+"] as const

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

function categorize(host: string): string | null {
  for (const [domain, cat] of DOMAIN_CATEGORY) {
    if (host === domain || host.endsWith("." + domain)) return cat
  }
  return null
}

// ---------------------------------------------------------------------------
// Wnioskowanie
// ---------------------------------------------------------------------------

export async function collectInferredProfile(
  days = 60,
  maxResults = 3000
): Promise<InferredProfile> {
  const empty = (reason: string): InferredProfile => ({
    available: false,
    reason,
    sampleSize: 0,
    domainsMatched: 0,
    interests: [],
    gender: null,
    age: null,
  })

  if (typeof chrome === "undefined" || !chrome.history?.search) {
    return empty("Brak uprawnienia „history” lub kontekst bez API.")
  }

  let items: chrome.history.HistoryItem[]
  try {
    items = await chrome.history.search({
      text: "",
      startTime: Date.now() - days * 86_400_000,
      maxResults,
    })
  } catch {
    return empty("Nie udało się odczytać historii przeglądania.")
  }

  const weights = new Map<string, number>()
  const evidence = new Map<string, Set<string>>()
  let matched = 0

  for (const item of items) {
    const url = item.url
    if (!url) continue
    const host = hostOf(url)
    if (!host) continue
    const cat = categorize(host)
    if (!cat) continue

    const w = Math.max(1, item.visitCount ?? 1)
    weights.set(cat, (weights.get(cat) ?? 0) + w)
    const ev = evidence.get(cat) ?? new Set<string>()
    if (ev.size < 3) ev.add(host)
    evidence.set(cat, ev)
    matched += 1
  }

  if (weights.size === 0) {
    return {
      available: true,
      reason: "Za mało dopasowanych domen w historii do wnioskowania.",
      sampleSize: items.length,
      domainsMatched: 0,
      interests: [],
      gender: null,
      age: null,
    }
  }

  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0)

  const interests: InterestCategory[] = Array.from(weights.entries())
    .map(([id, weight]) => ({
      id,
      label: CATEGORY_META[id]?.label ?? id,
      weight,
      share: weight / total,
      evidence: Array.from(evidence.get(id) ?? []),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)

  // Płeć — ważona średnia stereotypowego przechylenia (uczciwie zachowawcza).
  let leanSum = 0
  for (const [id, weight] of weights) {
    leanSum += (CATEGORY_META[id]?.genderLean ?? 0) * weight
  }
  const leanAvg = leanSum / total // -1..1
  const genderConfidence = Math.min(0.6, Math.abs(leanAvg) * 0.9)
  const genderLabel =
    Math.abs(leanAvg) < 0.08
      ? "Nieokreślona / zbalansowana"
      : leanAvg > 0
        ? "Kobieta (tak zgaduje branża)"
        : "Mężczyzna (tak zgaduje branża)"
  const genderBasis = interests
    .slice(0, 2)
    .map((i) => i.label)
    .join(", ")

  // Wiek — głosowanie ważone na 4 koszyki.
  const ageVotes = new Map<string, number>()
  for (const [id, weight] of weights) {
    const bucket = CATEGORY_META[id]?.ageBucket ?? "25-34"
    ageVotes.set(bucket, (ageVotes.get(bucket) ?? 0) + weight)
  }
  let topBucket = AGE_BUCKETS[1] as string
  let topVote = -1
  for (const bucket of AGE_BUCKETS) {
    const v = ageVotes.get(bucket) ?? 0
    if (v > topVote) {
      topVote = v
      topBucket = bucket
    }
  }
  const ageConfidence = Math.min(0.6, total > 0 ? topVote / total : 0)

  return {
    available: true,
    sampleSize: items.length,
    domainsMatched: matched,
    interests,
    gender: {
      label: genderLabel,
      confidence: genderConfidence,
      basis: genderBasis,
    },
    age: {
      label: topBucket,
      confidence: ageConfidence,
      basis: `${matched} dopasowań w historii`,
    },
  }
}
