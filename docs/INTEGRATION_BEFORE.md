# PrivacyMyst — BEFORE the Grand Integration

> Snapshot of the fragmented state captured **2026-06-13**, immediately before the
> "ultimate" merge. Pristine pre-merge ref: **`backup/pre-ultimate-70371e9`**.
> Worktree checkpoint of the uncommitted pile: **`b801cd1`**.

This is the honest "it was dirty" picture: a hackathon team shipped six work
streams in parallel — some landed as commits on `origin/main`, some were sitting
**uncommitted in the working tree at once**, and several touched the same files.

---

## 1. The six work streams

| # | Stream | Author | Where it lived | Touched |
|---|--------|--------|----------------|---------|
| 1 | **cyberradar** — animated threat-radar canvas | Makaren337 | commit `cef2e2c` on `origin/main` | `components/CyberRadar.tsx` (new, 603 LOC), `popup.tsx` |
| 2 | **Honeypot Trap** — DNR tracker data-poisoning | Krystian | commit `25c1ab5` on `origin/main` | `shared/honeypot.ts` (new, 479 LOC), `background.ts`, `types.ts`, `components/types.ts`, `icons.tsx`, `signals.tsx`, `package.json` |
| 3 | **AI Deep-Dive Risk** — on-page content risk scan | teammate | **uncommitted worktree** | `shared/aiDeepDive/*` (6), `background/aiDeepDive/*` (3), `content/aiDeepDive/*` (4), `components/AiDeepDiveCard.tsx`, `tests/aiDeepDiveScore.test.ts` |
| 4 | **Max Camo** — auto-escalate defenses on high risk | teammate | **uncommitted worktree** | `background/aiDeepDive/maxCamoPolicy.ts`, `maxCamoActive` wiring in `types.ts`/`popup.tsx` |
| 5 | **Module D/B hardening** — panic wipe, session-only crypto key, `cnd:` namespace unification, consistent navigator spoofing, honest labels | Claude/Opus | **uncommitted worktree** | `background.ts`, `shared/storage.ts`, `contents/bionic-blur-main.ts`, `types.ts`, `popup.tsx`, components, `readme.md` |
| 6 | **Digital Shadow Audit** — passive fingerprint-entropy estimate | Claude/Opus | **uncommitted worktree** | `components/ShadowAudit.tsx`, `shared/shadowAudit.ts` |

Streams 3–6 were **all uncommitted in the working tree simultaneously**, layered
on top of `70371e9`. Streams 1–2 were ahead on `origin/main`.

---

## 2. Commit topology at the start

```
* 4645acc (origin/main) Merge branch 'main'
|\
| * 25c1ab5  Honeypot Trap with declarativeNetRequest data poisoning   (stream 2)
* | cef2e2c  cyberradar                                                 (stream 1)
|/
* ab3ad06  Merge PR #3 from codex/bionic-blur-module-b
|\
| * 70371e9  (HEAD, codex/ai-deep-dive-risk-mvp)  Merge origin/main into bionic-blur-module-b
* ee8386a  Merge PR #2
...
* a11bccd  (main) Wersja 1.1 Moduł A
```

- `HEAD` (`70371e9`) was **behind** `origin/main` by two features (cyberradar + honeypot).
- The working tree added streams 3–6 on top of `70371e9` without committing.
- So "ultimate" required **merging `origin/main` into a snapshot of the dirty worktree**.

---

## 3. Conflict map (predicted, then confirmed)

Both lineages edited the same shared files — almost all **additive** (each teammate
appended a different symbol at the same anchor point):

| File | HEAD side (streams 3–6) | origin/main side (streams 1–2) | Conflict type |
|------|-------------------------|--------------------------------|---------------|
| `components/icons.tsx` | `Mail`, `Fingerprint` | `Crosshair` | additive union |
| `components/signals.tsx` | `aiDeepDive` legend row | `honeypot` legend row | additive union (+ near-duplicate red hue) |
| `components/types.ts` | `LogSource += "aiDeepDive"` | `LogSource += "honeypot"` | additive union |
| `types.ts` | `PanicButtonMessage`, `AiDeepDiveRiskMessage` | `TriggerHoneypotTestMessage`, `HoneypotLog` | union of message types |
| `popup.tsx` | AiDeepDiveCard + ShadowAudit + alias footer + maxCamo | CyberRadar import + JSX | union + stagger-index renumber |
| `background.ts` | panic handler + AI handler | `initHoneypotTrap()` | auto-merged (disjoint regions) |
| `package.json` | — | `+declarativeNetRequestFeedback` | clean take |

---

## 4. `declarativeNetRequest` rule-ID landscape (collision audit)

Three independent modules touch the browser's request layer. Verified rule IDs
**do not collide**:

| Owner | Rule IDs | Purpose |
|-------|----------|---------|
| Bionic Blur (`background.ts`) | `41001` | Accept-Language header normalization |
| Honeypot Trap (`shared/honeypot.ts`) | `42001`–`42005` | redirect 5 tracker families to poisoned payloads |
| AI Deep-Dive / Max Camo | *(none)* | pure storage + toggle patches, no DNR |

---

## 5. Risks identified before merging

1. **Shared counter race** — both Honeypot and Bionic Blur do read-modify-write on
   `cnd:state.trackersBlockedCount`; concurrent writes can drop updates.
2. **Design-rule violations** — CyberRadar drew emoji (`⚠`) into the canvas HUD,
   violating the "no emoji" Stealth-Console rule.
3. **Pre-existing type error** — CyberRadar referenced `ctx.createConicalGradient`
   (non-existent API; correct name is `createConicGradient`) in dead code.
4. **Plasmo entrypoint trap** — AI Deep-Dive code lives under `src/content/`
   (singular) and `src/background/`; these must stay plain modules (imported by the
   real `src/content.ts`/`src/background.ts`), NOT be moved to `src/contents/`.
5. **Two `updateDynamicRules` callers** at startup — safe only because each scopes
   `removeRuleIds` to its own IDs.

See **`INTEGRATION_AFTER.md`** for how each was resolved.
