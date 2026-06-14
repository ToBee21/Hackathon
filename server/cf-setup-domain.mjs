// server/cf-setup-domain.mjs <domain> <originIp>
// Idempotently points a domain at the origin and applies the same zone hardening
// as the portfolio. Reads CF_API_TOKEN from env (never logged). No secret here.
//   CF_API_TOKEN='...' node server/cf-setup-domain.mjs privacymyst.pl 135.181.90.46

const TOKEN = process.env.CF_API_TOKEN
if (!TOKEN) { console.error("CF_API_TOKEN env required"); process.exit(1) }
const DOMAIN = process.argv[2] || "privacymyst.pl"
const IP = process.argv[3] || "135.181.90.46"
const API = "https://api.cloudflare.com/client/v4"
const EMAIL = process.env.CF_AUTH_EMAIL
// Global API Key uses X-Auth-Email + X-Auth-Key; scoped API Token uses Bearer.
const H = EMAIL
  ? { "X-Auth-Email": EMAIL, "X-Auth-Key": TOKEN, "Content-Type": "application/json" }
  : { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }

async function cf(method, path, body) {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  return r.json().catch(() => ({ success: false, errors: [{ message: `non-json ${r.status}` }] }))
}
const err = (j) => JSON.stringify(j.errors || j.messages || j)

// Auth probe (also tells us if the token can read zones).
const probe = await cf("GET", `/zones?name=${DOMAIN}`)
if (!probe.success) {
  console.error("AUTH/zone-list failed:", err(probe))
  console.error("(If this is a Global API Key, it needs X-Auth-Email + X-Auth-Key, not Bearer.)")
  process.exit(2)
}

let zoneId = probe.result?.[0]?.id
let nameServers = probe.result?.[0]?.name_servers
let status = probe.result?.[0]?.status

if (!zoneId) {
  const acc = await cf("GET", "/accounts")
  const accId = acc.result?.[0]?.id
  if (!accId) { console.error("no account id available:", err(acc)); process.exit(3) }
  const created = await cf("POST", "/zones", { name: DOMAIN, account: { id: accId }, type: "full" })
  if (!created.success) { console.error("zone create failed:", err(created)); process.exit(4) }
  zoneId = created.result.id
  nameServers = created.result.name_servers
  status = created.result.status
  console.log(`zone CREATED: ${zoneId}`)
} else {
  console.log(`zone exists: ${zoneId}`)
}
console.log(`zone status: ${status}`)
console.log(`cloudflare nameservers: ${(nameServers || []).join(", ") || "(none returned)"}`)

async function upsertA(name) {
  const ex = await cf("GET", `/zones/${zoneId}/dns_records?type=A&name=${name}`)
  const rec = { type: "A", name, content: IP, ttl: 1, proxied: true }
  if (ex.result?.length) {
    const u = await cf("PUT", `/zones/${zoneId}/dns_records/${ex.result[0].id}`, rec)
    console.log(`A ${name} -> ${IP} (proxied): ${u.success ? "updated" : "FAIL " + err(u)}`)
  } else {
    const c = await cf("POST", `/zones/${zoneId}/dns_records`, rec)
    console.log(`A ${name} -> ${IP} (proxied): ${c.success ? "created" : "FAIL " + err(c)}`)
  }
}
await upsertA(DOMAIN)
await upsertA(`www.${DOMAIN}`)

const settings = {
  always_use_https: "on", min_tls_version: "1.2", tls_1_3: "on",
  automatic_https_rewrites: "on", ssl: "full", browser_check: "on"
}
for (const [k, value] of Object.entries(settings)) {
  const s = await cf("PATCH", `/zones/${zoneId}/settings/${k}`, { value })
  console.log(`setting ${k}: ${s.success ? "ok" : "skip (" + (s.errors?.[0]?.message || "") + ")"}`)
}
console.log("DONE")
