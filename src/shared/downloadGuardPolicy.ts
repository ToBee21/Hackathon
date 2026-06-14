import { isAllowlisted } from "./blocklist/allowlist"
import {
  analyzeLink,
  KNOWN_BRANDS,
  registrableDomain,
  type LinkRiskLevel
} from "./linkSafety/urlHeuristics"

export interface DownloadRiskInput {
  url?: string
  finalUrl?: string
  filename?: string
  mime?: string
  danger?: string
}

export interface DownloadRiskVerdict {
  block: boolean
  label: string
  level: LinkRiskLevel
  host: string
  registrableDomain: string
  executable: boolean
  riskScore: number
  reasons: string[]
}

const EXECUTABLE_DOWNLOAD_EXTENSIONS = [
  ".exe",
  ".msi",
  ".msix",
  ".bat",
  ".cmd",
  ".scr",
  ".com",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".apk",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm"
]

const EXECUTABLE_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
  "application/x-ms-installer",
  "application/x-msi",
  "application/java-archive",
  "application/vnd.android.package-archive"
])

const BROWSER_DANGER_VALUES = new Set([
  "file",
  "url",
  "content",
  "uncommon",
  "host",
  "unwanted",
  "dangerous",
  "blocked",
  "sensitive",
  "deepScannedFailed"
])

const DOWNLOAD_GUARD_RULE_ID_BASE = 44_000
const DOWNLOAD_GUARD_RULE_COUNT = 1

const HARD_BLOCKED_DOWNLOAD_DOMAINS = [
  // Observed fake-browser installer campaign from manual runtime testing.
  "insecthoney.xyz"
]

const DANGEROUS_DOWNLOAD_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "xmlhttprequest",
  "other"
] as unknown as chrome.declarativeNetRequest.ResourceType[]

export function downloadGuardRuleIds(): number[] {
  return Array.from(
    { length: DOWNLOAD_GUARD_RULE_COUNT },
    (_, index) => DOWNLOAD_GUARD_RULE_ID_BASE + index
  )
}

export function buildDownloadGuardDnrRules(): chrome.declarativeNetRequest.Rule[] {
  return [
    {
      id: DOWNLOAD_GUARD_RULE_ID_BASE,
      priority: 100,
      action: { type: "block" },
      condition: {
        requestDomains: HARD_BLOCKED_DOWNLOAD_DOMAINS,
        resourceTypes: DANGEROUS_DOWNLOAD_RESOURCE_TYPES
      }
    }
  ] as unknown as chrome.declarativeNetRequest.Rule[]
}

export function assessDownloadRisk(input: DownloadRiskInput): DownloadRiskVerdict {
  const rawUrl = input.finalUrl || input.url || ""
  const parsed = parseHttpUrl(rawUrl)
  if (!parsed) return safeVerdict(input, "")

  const host = parsed.hostname.toLowerCase()
  const domain = registrableDomain(host)
  const filename = basename(input.filename || parsed.pathname)
  const executable = isExecutableDownload(parsed, filename, input.mime)
  const browserDanger = String(input.danger || "").trim()
  const browserFlagged = BROWSER_DANGER_VALUES.has(browserDanger)
  const linkVerdict = analyzeLink(parsed.href, { anchorText: filename }) ?? null
  const reasons = new Set<string>()

  if (browserFlagged) reasons.add(`przeglądarka oznaczyła pobranie jako ${browserDanger}`)
  if (executable) reasons.add("plik wykonywalny")
  for (const signal of linkVerdict?.signals ?? []) reasons.add(signal.id)

  const officialFloor = isAllowlisted(domain)
  const brandSpoof = executable && filenameImpersonatesBrand(filename, domain)
  if (brandSpoof) reasons.add("instalator podszywa się pod markę na obcej domenie")

  const riskyLevel =
    linkVerdict?.level === "high" || linkVerdict?.level === "critical"
  const mediumExecutable =
    executable &&
    (linkVerdict?.level === "medium" ||
      hasSignal(linkVerdict, "suspicious-tld") ||
      hasSignal(linkVerdict, "download-lure") ||
      hasSignal(linkVerdict, "brand-in-path") ||
      brandSpoof)

  const block =
    browserFlagged ||
    (executable && !officialFloor && (riskyLevel || mediumExecutable || brandSpoof))

  return {
    block,
    label: `${filename || "pobranie"} z ${domain}`,
    level: linkVerdict?.level ?? "low",
    host,
    registrableDomain: domain,
    executable,
    riskScore: linkVerdict?.score ?? 0,
    reasons: Array.from(reasons).slice(0, 6)
  }
}

function parseHttpUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url
  } catch {
    return null
  }
}

function safeVerdict(input: DownloadRiskInput, domain: string): DownloadRiskVerdict {
  return {
    block: false,
    label: basename(input.filename || "") || "pobranie",
    level: "low",
    host: "",
    registrableDomain: domain,
    executable: false,
    riskScore: 0,
    reasons: []
  }
}

function basename(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? ""
  return clean.split(/[\\/]/).filter(Boolean).pop() ?? ""
}

function isExecutableDownload(url: URL, filename: string, mime?: string): boolean {
  const lowerName = filename.toLowerCase()
  const lowerPath = decodeURIComponent(url.pathname).toLowerCase()
  if (EXECUTABLE_DOWNLOAD_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) return true
  if (EXECUTABLE_DOWNLOAD_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) return true
  return Boolean(mime && EXECUTABLE_MIME_TYPES.has(mime.toLowerCase()))
}

function filenameImpersonatesBrand(filename: string, domain: string): boolean {
  const lowerName = filename.toLowerCase()
  const domainMain = domain.split(".")[0] ?? domain
  return KNOWN_BRANDS.some(
    (brand) => lowerName.includes(brand) && domainMain !== brand
  )
}

function hasSignal(
  verdict: ReturnType<typeof analyzeLink> | null,
  signalId: string
): boolean {
  return Boolean(verdict?.signals.some((signal) => signal.id === signalId))
}
