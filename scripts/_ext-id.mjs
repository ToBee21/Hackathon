// scripts/_ext-id.mjs — resolve the LIVE Cloak & Dagger extension id from a
// remote-debugged browser. Never hardcode the id: it changes on every fresh
// unpacked load, so a baked-in id always points at a stale/dead install.
//
// Order of resolution:
//   1. explicit override (arg/env) if it looks like a real MV3 id
//   2. the running extension's service worker (chrome-extension://<id>/static/background/…)
//   3. the CDP /json/list targets endpoint
// Throws if nothing can be found after a short retry window.

const ID_RE = /^[a-p]{32}$/

export function looksLikeExtId(value) {
  return typeof value === "string" && ID_RE.test(value)
}

export async function resolveExtId(ctx, port = "9333", override) {
  const explicit = override || process.env.CND_EXT_ID
  if (looksLikeExtId(explicit)) return explicit

  for (let i = 0; i < 25; i++) {
    // a) service workers visible to this CDP context
    const sws = ctx?.serviceWorkers?.() || []
    const sw =
      sws.find((s) => s.url().includes("/static/background/")) ||
      sws.find((s) => s.url().startsWith("chrome-extension://")) ||
      sws[0]
    if (sw) return new URL(sw.url()).host

    // b) raw DevTools target list
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (r.ok) {
        const targets = await r.json()
        const t =
          targets.find((x) => String(x.url || "").includes("/static/background/")) ||
          targets.find(
            (x) =>
              x.type === "service_worker" &&
              String(x.url || "").startsWith("chrome-extension://")
          )
        if (t) return new URL(t.url).host
      }
    } catch {}

    await new Promise((r) => setTimeout(r, 800))
  }

  throw new Error(
    "Could not auto-resolve the extension id. Make sure the demo browser is " +
      "running (npm run demo) and the extension loaded, or pass an id explicitly " +
      "(arg) / set CND_EXT_ID."
  )
}
