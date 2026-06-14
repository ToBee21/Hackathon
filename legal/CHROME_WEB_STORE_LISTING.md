# Chrome Web Store — publishing & compliance checklist

Use this when submitting Cloak & Dagger to the Chrome Web Store. Every item below
is grounded in a cited Chrome Web Store program policy (see `build/legal-research.md`).

## 1. Privacy policy (MANDATORY)

- [ ] Publish [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) at a public URL and paste that
      URL into the **Developer Dashboard → Privacy → Privacy policy** field.
      Required even though everything is local: Google defines "handle" as
      *collecting, transmitting, using, OR sharing* user data, and reading page
      content / `tabs.captureVisibleTab` screenshots counts as "using".

## 2. Single purpose + prominent disclosure (listing AND UI)

- [ ] State a single purpose: *"Local, on-device privacy protection: it analyzes
      pages and images entirely in your browser to flag privacy-risky pages and
      detect/blur ad images, and hardens trackers/cookies — nothing leaves your
      device."*
- [ ] **Prominently disclose, in BOTH the store listing AND the extension UI**, that
      the extension reads page content and reads/rasterizes on-page images and
      takes a screenshot of the active tab (`tabs.captureVisibleTab`) to power the
      AI risk classifier and the AI vision ad-detector — all locally. (Limited Use
      policy permits using web-browsing activity only for a user-facing feature
      *"described prominently in the Product's Chrome Web Store page AND in the
      Product's user interface."*) The in-extension Legal/Licenses screens and the
      "Skanuj reklamy (AI vision)" control provide the in-UI disclosure.

## 3. Limited Use affirmative statement

- [ ] Ensure this statement is reachable one click from the homepage / in the
      privacy policy (it is included in [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) §6):
      *"The use of information received from Google APIs will adhere to the Chrome
      Web Store User Data Policy, including the Limited Use requirements."*
      (Cloak & Dagger uses no Google APIs; the statement is published for
      completeness because the extension handles page content.)

## 4. Permissions — narrowest necessary, with justifications

List these in the Dashboard "permission justification" fields and in the
in-extension Legal/Permissions screen (CWS requires narrowest permissions + a
justification in the listing or an "about page").

| Permission | Justification (single purpose, local only) |
|---|---|
| `storage` | Save user settings, toggles, and counters in `chrome.storage.local`; cache local model state. |
| `tabs` + host `http/https` | Read the active page and run on-page protections (risk scan, ad-image scan); `tabs.captureVisibleTab` for the local vision ad-detector. No browsing history is collected or transmitted. |
| `scripting` | Inject the content scripts that perform on-page analysis and ad-image blurring. |
| `declarativeNetRequest` (+ `Feedback`) | Block/neutralize tracker and ad requests via local rules; no request data leaves the device. |
| `cookies` + `browsingData` | Tracker-cookie hardening and the user-initiated Panic wipe. |
| `privacy` | Apply browser privacy guards (e.g., WebRTC leak, network prediction). |
| `alarms` | Schedule periodic local noise/maintenance cycles. |
| `sidePanel`, `contextMenus`, `offscreen`, `commands` | UI surfaces; the offscreen document runs the local AI models; `commands` provides the Alt+Shift+V vision shortcut. |
| `debugger` | **Review before publishing.** Used for resilient text extraction on pages that block content scripts; the Chrome Web Store flags `debugger` and shows a warning. If not essential, remove it to keep permissions narrowest-necessary; if kept, justify it explicitly and expect added review. |

## 5. Branding / no implied endorsement

- [ ] Name Google, Gemma, Hugging Face, Alibaba, Microsoft, Meta, etc. **only
      factually for attribution** (as the licenses require). Do **not** imply that
      Cloak & Dagger is authorized, endorsed, or produced by Google or any of them
      (CWS Impersonation policy). Avoid "official", "powered by Google", or logos
      used as endorsement. A factual "Built with Google Gemma (under the Gemma
      Terms of Use)" line is fine.

## 6. AI-content disclosure

- [ ] The listing and the UI describe that AI features run locally and are
      best-effort; the in-extension Disclaimer states outputs may be inaccurate and
      are not professional advice. (There is no verbatim CWS-mandated AI string;
      this is transparency best practice. Do **not** claim a discrete "must disclose
      AI-generated content" Gemma requirement — that overstates the terms.)

## 7. Bundled-license obligations (verify present in the package)

- [ ] [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md), [`NOTICE`](../NOTICE),
      and [`licenses/`](../licenses) (Apache-2.0, GPL-3.0, MIT, Gemma-Terms-of-Use)
      are present and the in-extension "Licenses" screen renders them.
- [ ] Gemma: verbatim Notice string shipped; q4f16 modification noted; Gemma
      Prohibited-Use pass-through is in the EULA; a Gemma consent screen shows the
      notice before the model is used.
- [ ] HaGeZi GPL-3.0 data is bundled unmodified and the EULA does not restrict GPL
      rights to it.
