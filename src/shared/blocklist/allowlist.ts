// src/shared/blocklist/allowlist.ts
// Never-block allowlist. A poisoned upstream feed (or a compromised update
// server with a stolen signing key) must not be able to block critical
// infrastructure. Any entry whose registrable domain matches this list is
// dropped during bundle sanitization — BEFORE any rule is installed.
//
// Keep this conservative and small: it is a safety floor, not a curation list.

// Matched at the REGISTRABLE-DOMAIN level (host == entry OR host endsWith
// ".entry"), so apex entries also cover their subdomains.
const NEVER_BLOCK: ReadonlySet<string> = new Set([
  // The extension's own update channel (must always reach us).
  "hubertjaniak.pl",
  // Certificate / revocation / time infrastructure.
  "letsencrypt.org",
  "digicert.com",
  "pool.ntp.org",
  // Public DNS / connectivity checks browsers rely on.
  "dns.google",
  "cloudflare-dns.com",
  // Major platforms at the apex (login/identity/commerce live on subdomains).
  "google.com",
  "microsoft.com",
  "microsoftonline.com",
  "live.com",
  "apple.com",
  "icloud.com",
  "amazon.com",
  // Payment rails (a false positive here is catastrophic for the user).
  "paypal.com",
  "stripe.com",
  // Polish commercial banks — the user base is PL-first; blocking a bank login
  // is the worst-case over-block, so they are explicit floors.
  "mbank.pl",
  "pkobp.pl",
  "ipko.pl",
  "santander.pl",
  "ing.pl",
  "ingbank.pl",
  "pekao.com.pl",
  "bankmillennium.pl",
  "millenet.pl",
  "aliorbank.pl",
  "bnpparibas.pl",
  "credit-agricole.pl",
  "citibank.pl",
  "citihandlowy.pl",
  "bosbank.pl",
  "velobank.pl",
  "bnpparibas.com",
  "nest-bank.pl",
  "getinbank.pl",
  "revolut.com",
  // Government / military TLDs handled by suffix rules below.
])

// Registrable-domain suffixes that must never be blocked wholesale.
const NEVER_BLOCK_SUFFIXES: readonly string[] = [
  ".gov",
  ".gov.pl",
  ".mil",
  // Polish public administration.
  ".gov.uk"
]

/** True if `domain` (a lowercased hostname) must never be blocked. */
export function isAllowlisted(domain: string): boolean {
  const host = domain.toLowerCase().replace(/\.$/, "")
  if (NEVER_BLOCK.has(host)) return true
  for (const allowed of NEVER_BLOCK) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true
  }
  for (const suffix of NEVER_BLOCK_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return true
  }
  return false
}
