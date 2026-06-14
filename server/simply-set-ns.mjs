// server/simply-set-ns.mjs <domain> [ns1 ns2 ...]
// Point a simply.com-registered domain's nameservers at Cloudflare (or any NS).
// Basic auth: username = account number (Sxxxxxx), password = API key. Read from
// env, never logged. No secret in this file.
//   SIMPLY_ACCOUNT='Sxxxxxx' SIMPLY_API_KEY='...' node server/simply-set-ns.mjs privacymyst.pl
// Defaults to the Cloudflare NS assigned to the privacymyst.pl zone.

const ACC = process.env.SIMPLY_ACCOUNT
const KEY = process.env.SIMPLY_API_KEY
if (!ACC || !KEY) { console.error("SIMPLY_ACCOUNT and SIMPLY_API_KEY env required"); process.exit(1) }

const DOMAIN = process.argv[2] || "privacymyst.pl"
const NS = process.argv.slice(3)
const nameservers = NS.length ? NS : ["steven.ns.cloudflare.com", "walk.ns.cloudflare.com"]

const base = `https://api.simply.com/2/my/products/${DOMAIN}/registry/nameservers/`
const H = {
  Authorization: "Basic " + Buffer.from(`${ACC}:${KEY}`).toString("base64"),
  "Content-Type": "application/json"
}

const cur = await fetch(base, { headers: H })
console.log("current NS:", cur.status, JSON.stringify(await cur.json().catch(() => ({}))))

const put = await fetch(base, { method: "PUT", headers: H, body: JSON.stringify({ nameservers }) })
console.log(`set NS -> ${nameservers.join(", ")}`)
console.log("result:", put.status, JSON.stringify(await put.json().catch(() => ({}))))
