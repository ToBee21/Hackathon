# Blocklist command-centre (update server)

Self-hosted, signed update channel for the PrivacyMyst blocklist data layer.
The server is a **dumb static host** for two files — `bundle.signed.json` and
`manifest.json`. All trust lives in the **Ed25519 signature** the client checks,
not in the server. The signing key never touches the public box.

```
 off-box (laptop/CI)                 Hetzner (hubertjaniak.pl)        extension
 ─────────────────────               ─────────────────────────       ─────────────
 compile feeds  ──►  sign  ──scp──►  /srv/blocklist/*.json  ──►  fetch + verify sig
 (HaGeZi GPL,        (Ed25519,        (portfolio Caddy             (Web Crypto) →
  Phishing.DB MIT)    PRIVATE key)     file_server /blocklist/*)    anti-rollback →
                                                                    last-known-good
```

## Security model (why a server compromise is not fatal)

A bundle is **data, not code** (never `eval`'d; CSP `script-src 'self'`), so the
npm-supply-chain class is structurally gone. On top:

| Attacker capability | What they get |
| --- | --- |
| Read-only server compromise / MITM | Nothing — `bad-signature` ⇒ client keeps last-known-good. A multi-GB body can't OOM the SW either: `fetchBounded()` caps at 8 MB before parse. |
| Write access to `/srv/blocklist` | Nothing — can't forge the signature without the private key |
| **Stolen signing key** | Can only make clients **over-block**, and only *bounded* over-block: the bundle format has no allow/redirect/regex field (no exfiltration, no silent unblock); anti-rollback (persistent high-water mark) blocks replay; the first update off a fresh install is capped (`SEED_FIRST_UPDATE_MAX`); and the never-block allowlist protects gov/mil + a curated set of critical platforms and PL banks. It is NOT a blanket "no domain can ever be blocked" — only the allowlisted floor is guaranteed. Recover by rotating to `K_next` (multi-key verifier ships every release one key ahead). |

Enforced in `src/shared/blocklist/bundleSchema.ts` (capability) + `secureUpdater.ts`
(signature/rollback/anomaly), proven in `tests/security/blocklistCapability.security.test.ts`
and `tests/blocklistServer.presmoke.test.ts`.

## Local Docker presmoke (verified)

```bash
node server/keygen.mjs                       # keypair + WebCrypto self-test; paste PUBLIC_KEY_B64 into secureUpdater.ts
BUNDLE_VERSION=2 node server/build-bundle.mjs # sign the baseline seed -> server/out/
docker compose -f server/compose.local.yml up -d
curl http://127.0.0.1:8899/manifest.json
npx vitest run tests/blocklistServer.presmoke.test.ts   # real client vets the live artifact
docker compose -f server/compose.local.yml down          # when done
```

The presmoke asserts the genuine bundle is **accepted** and that tampered
signature / tampered body / rollback are **rejected**.

To point the extension at the presmoke server during dev, set the storage
override (signature is still enforced, so this is safe):
```js
chrome.storage.local.set({ "cnd:blocklist:update-url": "http://127.0.0.1:8899/bundle.signed.json" })
```

## Hetzner deploy runbook

1. **Unblock your IP** so SSH works. Hetzner Cloud Console → *Firewalls* → the
   firewall on the server → inbound rule for TCP/22 → add `your.ip/32`
   (`curl -s ifconfig.me`) → *Apply*. (If you also run host `ufw`,
   `sudo ufw allow from <ip> to any port 22`.)
2. `ssh root@hubertjaniak.pl`
3. `sudo install -d -m 755 /srv/blocklist`
4. In the **portfolio repo's** `Caddyfile`, paste `Caddyfile.portfolio-snippet`
   into the `(portfolio_app)` snippet **above** the default `handle { reverse_proxy
   app:3000 }`. Add the mount to the caddy service in `docker-compose.yml`:
   `- /srv/blocklist:/srv/blocklist:ro`. Reload:
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d caddy`
   (or `docker exec portfolio-caddy caddy reload --config /etc/caddy/Caddyfile`).
5. **Off-box** (your laptop) sign + publish:
   ```bash
   BUNDLE_VERSION=3 node server/build-bundle.mjs           # bump version each release (anti-rollback)
   scp server/out/bundle.signed.json server/out/manifest.json \
       root@hubertjaniak.pl:/srv/blocklist/.staging        # then atomic-swap remotely:
   ssh root@hubertjaniak.pl 'cd /srv/blocklist && mv -f .staging/* . && rmdir .staging'
   ```
   (`mv` on the same filesystem is atomic, so clients never read a half-written file.)
6. **Verify:**
   ```bash
   curl -s https://hubertjaniak.pl/blocklist/manifest.json
   curl -sI https://hubertjaniak.pl/blocklist/bundle.signed.json | grep -i etag
   ```
7. Clients pick it up on the `chrome.alarms` cadence (~6 h, jittered) — see
   `initBlocklistUpdates()` in `src/shared/blocklist/index.ts`. The baked-in
   prod URL is `https://hubertjaniak.pl/blocklist/bundle.signed.json`.

## Keys & rotation

- Private key: `server/.secrets/signing.key.pem` (gitignored, `chmod 600`). For
  CI, mount it as a secret file and point `BLOCKLIST_PRIVATE_KEY_FILE` at that
  path. Never pass PEM bytes through environment variables, shell history, or
  command-line examples. Never on the public server.
- Public key(s): baked into `secureUpdater.ts` (`UPDATE_PUBLIC_KEYS_B64`, an
  array). The verifier is **multi-key first-match-wins**, so rotation is in-band:
  add `K_next` to the array and ship an extension update BEFORE you start signing
  with it, then drop the old key a release later. Always keep the next key
  provisioned so a key-compromise is recoverable without a flag-day.
- **Version is monotonic.** Bump `BUNDLE_VERSION` every release; the client
  rejects any bundle whose version ≤ what it holds (rollback defense).

## Feeds (license-clean only)

Build-time compile via `scripts/compile-blocklists.mjs` (needs
`npm i -D @adguard/hostlist-compiler`): HaGeZi (GPL-3.0) + Phishing.Database
(MIT). abuse.ch URLhaus/ThreatFox are **not** bundleable (Auth-Key / fair-use) —
see `docs/RESEARCH_BLOCKLIST_DATA_LAYER.md`.
