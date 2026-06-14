# UNVERIFIED_PRIVACY_FAILURES

These are the failures or trust gaps a customer should assume are real until they are removed or disproved by stronger tests.

## 1. Source repo seeds a SimpleLogin token

- **Why it matters:** contradicts the README framing that SimpleLogin is only used after the user provides a token.
- **Evidence:** `src/background.ts` calls `saveApiToken("simplelogin", "...")` during install flow.
- **Status:** source-proven; current compiled build did not expose the exact token string, so there is also a source/build divergence concern.

## 2. Aliases are stored in plaintext

- **Why it matters:** generated aliases can reveal identity segmentation strategy or the user's pseudo-addresses.
- **Evidence:** `src/shared/emailAlias.ts` persists aliases directly in `chrome.storage.local`.
- **Proof:** `tests/security/storage-privacy.security.test.ts`.

## 3. Alias values are logged in plaintext

- **Why it matters:** a generated alias leaks into local log storage and any UI that reads those logs.
- **Evidence:** `src/content.ts` logs `Email alias: wygenerowano ${alias.alias}`.
- **Proof:** `tests/security/log-redaction.security.test.ts`, plus built artifact proof in `tests/security/build-artifact-privacy.security.test.ts`.

## 4. AI report sending is always on

- **Why it matters:** the product cannot honestly market a blanket "no exfiltration" story for compact AI verdicts.
- **Evidence:** `src/shared/aiDeepDive/reportPolicy.ts` returns `true` from `shouldSendAiDeepDiveReport()`.
- **Proof:** `tests/security/no-exfiltration.security.test.ts`.

## 5. Local-only AI claim is not hard-enforced

- **Why it matters:** remote model loading is not hard-disabled, and stored metadata can look more local than the incoming result truly was.
- **Evidence:** `env.allowRemoteModels = true`; sanitization fallback in `handleRiskResult.ts` sets `localOnly: true`.
- **Proof:** `tests/security/no-hidden-network.security.test.ts`, `tests/security/model-output-trust.security.test.ts`.

## 6. Sensitive-page protection is heuristic only

- **Why it matters:** hostile pages can evade the exclusion rule, and ordinary pages with password fields still get scanned.
- **Evidence:** `src/content/sensitivePageGuard.ts` explicitly says it is "not a guarantee".
- **Fixtures:** `tests/fixtures/privacy-hostile/banking-login.html`, `password-blog.html`.

## 7. Excluded pages still keep metadata

- **Why it matters:** even with visible text blanked, the extension still retains URL, origin, title, OG data, headings and selected text in `PageContext`.
- **Evidence:** `src/content/pageContext.ts`.

## 8. Message-boundary validation is shallow

- **Why it matters:** page or extension-side spoofing attempts have a larger attack surface than a strict schema validator would allow.
- **Evidence:** `src/shared/messages.ts` (`isCndMessage`), `src/background.ts` (`startsWith("CND_")`), `src/content.ts` (`window`-only message source check).
- **Proof:** `tests/security/message-boundary.security.test.ts`.

## 9. Panic wipe semantics are inconsistent

- **Why it matters:** users can reasonably expect the Panic Button to wipe all extension traces, but the main background path is weaker than the shared helper.
- **Evidence:** `src/shared/storage.ts` vs `src/background.ts`.

## 10. Offscreen diagnostic log persistence can over-retain data

- **Why it matters:** `normalizeOffscreenLog()` spreads arbitrary record fields into stored log records, which is a retention risk if upstream logs ever include more raw text than expected.
- **Evidence:** `src/background.ts` (`recordOffscreenLog`, `normalizeOffscreenLog`).

## 11. Privacy Score is a UI heuristic, not a measured guarantee

- **Why it matters:** customers may over-trust a number that is really just a local formula over toggles and counters.
- **Evidence:** `src/popup.tsx` (`computePrivacyScore`).

## 12. Broad privileges widen blast radius

- **Why it matters:** `<all_urls>` plus `debugger`, `cookies`, `browsingData`, `privacy`, `scripting`, `offscreen`, and DNR permissions create a large trust surface.
- **Evidence:** built `manifest.json`.
- **Proof:** `tests/security/permission-minimization.security.test.ts`.
