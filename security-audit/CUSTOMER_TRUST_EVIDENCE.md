# CUSTOMER_TRUST_EVIDENCE

This file intentionally lists only **bounded facts** that are supported by code plus tests. It does **not** grant credit for broader marketing interpretations.

## Positive, bounded evidence

| Bounded fact | Evidence | Proof tests |
| --- | --- | --- |
| API tokens are written through encrypted storage helpers, not plaintext alias storage | `src/shared/emailAlias.ts`, `src/shared/storage.ts` | `tests/security/storage-privacy.security.test.ts` |
| The crypto passphrase uses `chrome.storage.session` when available, with memory fallback | `src/shared/storage.ts` | `tests/security/storage-privacy.security.test.ts` |
| Visible-text extraction skips form controls like `INPUT`, `TEXTAREA`, `SELECT`, `BUTTON` | `src/content/aiDeepDive/extractVisibleText.ts` | existing code evidence; could be strengthened with DOM fixture tests later |
| NLI snippet building omits raw URL query strings from the snippet fed into the classifier | `src/shared/aiDeepDive/localNli.ts` | existing `tests/aiDeepDiveLocalNli.test.ts` |
| Fallback page-coverage reporting redacts browser-page query strings and local file paths | `tests/aiDeepDiveTabCoverage.test.ts` | existing `tests/aiDeepDiveTabCoverage.test.ts` |
| Local LLM prompt explicitly frames page text as untrusted DATA | `src/shared/aiDeepDive/localLlm.ts` | existing `tests/aiDeepDiveLocalLlm.test.ts`, `tests/security/model-output-trust.security.test.ts` |
| LLM JSON parsing clamps scores and drops unknown categories | `src/shared/aiDeepDive/localLlm.ts` | existing `tests/aiDeepDiveLocalLlm.test.ts` |
| Compact AI risk results are sanitized to `rawTextRetained: false` before being stored as verdict state | `src/background/aiDeepDive/handleRiskResult.ts` | `tests/security/model-output-trust.security.test.ts` |
| The code explicitly documents that the floating UI is not a confidentiality boundary | `src/content/floatingWindow.ts` | `tests/security/page-dom-leakage.security.test.ts` |
| Shipped build artifacts were inspected directly, not inferred from source only | built `manifest.json`, built `content*.js`, built `offscreen.js`, built `transformers.web.js` | `tests/security/build-artifact-privacy.security.test.ts`, `tests/security/permission-minimization.security.test.ts` |

## What is intentionally *not* counted as trust evidence

- Any privacy/security feature that exists only as a comment or README promise.
- Any locality claim that depends on `allowRemoteModels = false` when the repo currently sets it to `true`.
- Any exclusion claim that depends on heuristics rather than hard gating.
- Any secrecy claim about the floating overlay, because the code itself rejects that model.
