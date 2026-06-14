# TRUST_BOUNDARIES

This map describes where sensitive data or authority crosses trust boundaries, and whether that crossing is tightly enforced or mostly trust-based.

## Boundary map

| Boundary | What crosses it | Enforcement reality | Evidence | Proof tests |
| --- | --- | --- | --- | --- |
| Page main world → content script | Bionic Blur config/telemetry via `window.postMessage` | **Weak**. Config is posted with target `"*"`; telemetry listener only checks `event.source === window` plus a shallow envelope shape. Same-page scripts can attempt spoof traffic. | `src/content.ts`, built `content*.js` | `tests/security/page-dom-leakage.security.test.ts`, `tests/security/message-boundary.security.test.ts` |
| Content script → background | Runtime messages such as alias generation, deep scan, panic, logs | **Mixed**. Some messages are typed by convention, but the boundary is not defended by a single strict schema validator. | `src/content.ts`, `src/types.ts`, `src/background.ts` | source-backed, partial tests |
| Background → offscreen / offscreen → background | `CND_*` deep-scan control and status messages | **Weak**. `isCndMessage()` accepts any object whose string `type` starts with `CND_`; background listener also gates on prefix only. | `src/shared/messages.ts`, `src/background.ts` | `tests/security/message-boundary.security.test.ts` |
| Extension → local persistent storage | aliases, logs, AI state, toggles | **Mixed**. API tokens are encrypted with a session/in-memory passphrase, but aliases and logs are persisted in plaintext in `chrome.storage.local`. | `src/shared/storage.ts`, `src/shared/emailAlias.ts`, `src/background.ts` | `tests/security/storage-privacy.security.test.ts`, `tests/security/log-redaction.security.test.ts` |
| Extension → browser session storage | crypto passphrase | **Reasonable but trust-based**. Uses `chrome.storage.session` when available, otherwise memory fallback. Still relies on browser semantics for the "never on disk" claim. | `src/shared/storage.ts` | `tests/security/storage-privacy.security.test.ts` |
| Extension → network | SimpleLogin alias API, model/runtime downloads | **Present**. SimpleLogin endpoint is explicit. AI runtime also leaves remote model loading enabled. | `src/shared/emailAlias.ts`, `src/shared/aiDeepDive/localNli.ts`, built `offscreen.js`, built `transformers.web.js` | `tests/security/no-hidden-network.security.test.ts` |
| Extension → privileged browser APIs | cookies, browsingData, debugger, privacy, scripting, DNR | **Broad**. Shipped manifest requests powerful permissions plus `<all_urls>`. | `package.json` manifest block, built `manifest.json` | `tests/security/permission-minimization.security.test.ts` |
| Extension UI overlay → host page DOM | floating panel host + open shadow tree | **Not a secrecy boundary by design**. Code explicitly documents that the host page can observe the DOM node. | `src/content/floatingWindow.ts` | `tests/security/page-dom-leakage.security.test.ts` |

## High-risk trust edges

1. **Wildcard page bridge**  -  page/main-world traffic is not origin-locked.
2. **Prefix-only `CND_*` routing**  -  deep-scan transport is convention-based, not schema-tight.
3. **Source/build network ambiguity**  -  source seeds a hardcoded SimpleLogin token, while current build search did not show the exact token. That is a repo-integrity warning by itself.
4. **Sanitized `localOnly` metadata**  -  stored verdict metadata can present stronger locality than the incoming result actually asserted.
5. **Open overlay DOM**  -  safe only if the overlay never carries secrets.

## Customer-trust reading

Anything crossing these boundaries without strict validation should be described as **best-effort** or **trust-based**, not as hard privacy/security enforcement.
