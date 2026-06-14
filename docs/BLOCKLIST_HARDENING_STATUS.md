# Blocklist server — hardening status

Punch-list from the adversarial red-team workflow (`wf_25d80338-5e6`, 7 agents,
3 layers × design + red-team + synthesis). P0 = applied in code; deferred items
are ops/CI process, not code, and are safe to do at deploy time.

## P0 — applied (client resilience, the load-bearing defenses)

- **Byte-ceiling fetch before parse** — `fetchBounded()` caps the body at 8 MB
  and counts actual stream bytes (Content-Length is attacker-controlled), so a
  multi-GB body can't OOM the service worker. *This was the one break the
  signature does not stop.* (`index.ts`)
- **Multi-key verifier (first-match)** — `UPDATE_PUBLIC_KEYS_B64: string[]`;
  rotation is in-band (ship `K_next` a release ahead). (`secureUpdater.ts`)
- **Persistent monotonic high-water mark** — `cnd:blocklist:lastAcceptedVersion`
  floors anti-rollback independent of the active bundle, closing the
  storage-reset replay gap. (`index.ts` + `evaluateUpdate(floorVersion)`)
- **Absolute first-update cap** — `SEED_FIRST_UPDATE_MAX` bounds a stolen-key
  max-over-block on fresh installs even when the ratio gate is skipped.
- **Allowlist expanded + claim corrected** — apex google/microsoft/apple/amazon
  + PL commercial banks (mbank/pkobp/ing/santander/…); threat-model wording
  downgraded from "can't block banks" to "only the allowlisted floor is
  guaranteed". (`allowlist.ts`, `server/README.md`)
- **Dev-override scheme restricted** — override accepted only over `https` or
  loopback `http`, so it can't silently downgrade prod to plaintext. (`index.ts`)
- **Sign-time provenance** — `build-bundle.mjs` stamps `generatedAt` and guards
  `BUNDLE_VERSION` (integer ≥ 1; `SOURCE_DATE_EPOCH` for reproducible builds).
- **Mandatory sinkhole exclusion + preflight** — runbook's Caddy snippet adds
  `not path /blocklist/*` to the artifact matcher and a CORS preflight handler.
- **Tests** — multi-key accept/reject, version-floor, seed-cap, plus the live
  presmoke (genuine accept; tampered-sig / tampered-body / rollback reject).
  146/146 green.

## Deferred — ops/CI process (do at/with deploy, not code)

- **Private key in KMS/HSM**, not a laptop PEM; swap `edSign(pem)` for a KMS sign
  call; add a required-review / two-person rule on the release workflow.
- **Pre-sign feed diff** — diff candidate vs last-signed (entry count + churn %),
  refuse to sign on large deltas or any allowlisted/critical domain addition;
  pin + verify upstream feed sources. (Defends targeted injection the client
  size-anomaly gate can't see.)
- **Atomic publish ordering on Hetzner** — scp to `.tmp`, `fsync`, rename bundle
  FIRST then manifest, same filesystem (runbook Step 5 already uses staging+mv).
- **Pre-flight remote version check** — assert `newVersion > GET …/manifest.json
  version` before signing.
- **Prod coexistence smoke** — after the Caddy edit, assert `/blocklist/*` 200 +
  CORS/304 AND `/` + a `/live/*` demo still 200 (portfolio unregressed).
- **CrowdSec/log hygiene** — whitelist GET/HEAD/OPTIONS on `/blocklist/*` but keep
  banning 4xx floods; never log auth headers; mask the private key in CI logs.
- **Update-staleness watchdog** — track age of last accepted update so the
  ETag/304 path can't silently freeze updates forever.

Full red-team output: workflow `wf_25d80338-5e6` task result.
