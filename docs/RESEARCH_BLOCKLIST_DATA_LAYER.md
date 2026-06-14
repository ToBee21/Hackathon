# Blocklist data layer — verified research + architecture

> Source: deep-research run `wf_1d8288e2-501` (2026-06-14). 24 sources, 25 claims
> adversarially verified (24 confirmed / 1 killed). Counts drift; treat as orders
> of magnitude. This doc is the rationale behind `src/shared/blocklist/*`.

## 1. Problem we are solving

Before: blocking is fed from a hand-written ~27-host tracker array + ~35
tracking-param array (`src/shared/targetingShield.ts`). No external feeds, no
auto-update, no dedup, **zero malware/phishing/scam**. That is not a blocklist
DB — it is a hardcoded array.

After: a license-clean, deduped, provenance-tagged **data layer** that the
existing AI page-risk engine drives — loose baseline everywhere, scorched-earth
only on pages the model flags sensitive.

## 2. Feeds — license verdicts (what we may actually ship)

| Feed | License | Format | Ship verdict |
| --- | --- | --- | --- |
| **HaGeZi DNS-Blocklists** (tiers Light→Ultimate) | GPL-3.0 | hosts / domains / adblock | ✅ bundle (honor GPL + upstream terms) |
| **HaGeZi TIF** (malware/phishing/C2, ~1.5M) | GPL-3.0 | domains | ✅ bundle |
| **HaGeZi NRD / DGA-entropy** | GPL-3.0 | domains | ✅ bundle (fuels the entropy angle) |
| **Phishing.Database** (mitchellkrogza) | **MIT** | txt / .adblock / tar.gz | ✅ **cleanest** — keep notice only |
| **EasyPrivacy** (core EasyList) | GPLv3 **or** CC-BY-SA 3.0 | ABP | ✅ bundle (share-alike attaches) |
| AdGuard Base/Tracking/Annoyances | GPL-3.0 | ABP | ⚠️ copyleft on the whole conveyed work (FSF-disputed) |
| Brave **adblock-rust** engine | MPL-2.0 | Rust→WASM | ✅ static-linkable weak copyleft (runtime ABP eval) |
| **ThreatFox** (abuse.ch) | fair-use + **mandatory Auth-Key** | hosts/JSON/CSV, regen **5 min** | ⛔ not bundleable; **server-relay only** |
| **URLhaus** (abuse.ch) | non-commercial fair-use | txt/CSV | ⛔ not bundleable without permission |
| OpenPhish community feed | ToU bars redistribution + commercial | txt | ⛔ do not ship |
| Peter Lowe's | **no stated license** | hosts | ⚠️ contact pgl@yoyo.org before shipping |

**Implication for the server:** the abuse.ch feeds are exactly the ones a
client cannot fetch (Auth-Key cannot be shipped per-user). A self-hosted
command-centre that holds the key and re-serves a normalized delta is a real
architectural reason to exist — but re-serving abuse.ch data to many clients is
itself redistribution their ToU restricts. **Default: serve only our own bundle
compiled from GPL/MIT feeds (HaGeZi + Phishing.Database).** abuse.ch only with
written permission.

## 3. MV3 rule budget (Chrome, 2026 — verified from chrome docs)

- **Static**: `GUARANTEED_MINIMUM_STATIC_RULES = 30 000`; more is shared
  globally and queryable via `getAvailableStaticRuleCount()` — never assume a
  fixed ceiling. Up to **100 rulesets**, **50 enabled at once** (raised from 10
  in Chrome 120), toggled via `updateEnabledRulesets()`.
- **Dynamic**: `MAX_NUMBER_OF_DYNAMIC_RULES = 30 000`. `block` is a **"safe"**
  action and gets the full 30k; only "unsafe" rules (redirect/modifyHeaders) are
  capped at 5 000. **A pure block list pays no 5k penalty.**
- A 100k+ hosts mega-list does **not** fit as raw rules → partition into static
  rulesets and/or pack many domains per rule via `condition.requestDomains`.
- Build-time dedup/merge: **`@adguard/hostlist-compiler`** (npm) merges N
  hosts/adblock sources into one compiled, deduped list (the "Compress"
  transform rewrites `0.0.0.0 example.org` → `||example.org^`).

**Our split:**
- **Build-time** (`scripts/compile-blocklists.mjs`): fetch HaGeZi + Phishing.DB,
  compile + dedup, emit a provenance-tagged baseline bundle.
- **Runtime**: baseline packed into a few dynamic `block` rules; risk-adaptive
  escalation adds per-origin rules; optional signed delta fetch from the server.

## 4. Differentiated angle (research found NO settled prior art)

No verified claim established academic/product prior art for **risk-adaptive
blocking fused with a local page-risk model**. Ghostery TrackerDB exists
(provenance DB) but not the fusion. Ranked novelty-vs-effort:

1. **Risk-adaptive context-tiered blocking** — baseline always on; AI
   high/critical enables escalated-tier domains scoped to that origin. Low
   effort (reuses existing escalation), high novelty.
2. **Provenance surfacing** — "blocked X — C2 on HaGeZi TIF" / "broker, list Y".
   Ties into Digital Shadow Audit.
3. **NRD/DGA-entropy × local signal** — escalate suspicious-but-unlisted domains.

## 5. Supply-chain hardening (the "what if they take our server" answer)

A blocklist is **data, not code** — never `eval`'d, parsed by a strict schema,
CSP already `script-src 'self'`. That structurally removes the npm-supply-chain
class. On top:

1. **Signed bundles** — server publishes bundle + detached Ed25519 signature;
   extension bakes in the public key; client verifies via Web Crypto before
   applying. Private key lives off the public server.
2. **Capability constraint** — the bundle format can express **only "block this
   domain"**. No allow/redirect/regex fields exist, so even a fully compromised
   server + signing key can only make the client over-block (recoverable), never
   exfiltrate or silently unblock malware. This is the deepest defense.
3. **Last-known-good + anti-rollback + anomaly gate** — baked-in baseline is the
   floor; reject older versions (rollback) and implausible size deltas.
4. **Never-block allowlist** — banks/gov/own server can't be blocked by a
   poisoned upstream.
5. **Opt-out**, HTTPS, no client-IP logging.

Implemented in `bundleSchema.ts` (capability/validation) + `secureUpdater.ts`
(signature/rollback/anomaly), proven in
`tests/security/blocklistCapability.security.test.ts`.

## 6. Staging

- **v0 (shipped here):** bundled baseline + risk-adaptive dynamic blocking +
  provenance + secure-updater module + capability tests + compile script.
- **v1 (server):** Hetzner container (nginx) serving signed bundle + manifest
  (version/ETag); client `chrome.alarms` conditional GET → verify → apply →
  last-known-good. Sign off-box.
- **Skip:** true decentralization, abuse.ch relay (license), SB hash-prefix.

## 7. Open questions (unverified — confirm before shipping)

- Exact DNR rule yield when HaGeZi Ultimate (~564k) is compiled, and ruleset
  count needed within budget.
- Client-side Safe Browsing v5 hash-prefix feasibility/quota under MV3.
- Licenses for feeds not verified this batch: Spamhaus DROP/ASN-DROP, PhishTank,
  CRDF, Disconnect, oisd, 1Hosts, "I don't care about cookies".
