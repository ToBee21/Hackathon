# Privacy Policy

**Product:** Cloak & Dagger (Chrome MV3 browser extension)
**Provider:** [PROVIDER / LEGAL ENTITY] ("we", "us"), author "Hackathon Signal:Noise Team".
**Effective date:** [EFFECTIVE DATE]
**Contact:** [CONTACT EMAIL]

> A posted privacy policy is **mandatory** for any Chrome Web Store extension that
> "handles" user data, where Google defines "handle" as *collecting, transmitting,
> using, OR sharing* — so this policy applies even though Cloak & Dagger processes
> everything locally and transmits nothing. (Chrome Web Store User Data FAQ /
> Privacy / Disclosure Requirements policies.)

## 1. Summary (the short version)

**Cloak & Dagger does not collect, transmit, sell, rent, or share any of your data.**
It has **no servers and no telemetry.** Everything the extension does — risk
classification, the AI vision ad-image detector, tracker/cookie hardening, email
aliasing, honeypot tests — runs **entirely on your own device**, inside your
browser, using local AI models cached on your machine. Your page content, the
images on pages you visit, screenshots of the active tab, form data, and your
browsing activity are processed **locally and only momentarily** to produce the
result you asked for, and are **never sent anywhere.**

## 2. What the extension processes locally (and why)

To deliver its features, the extension reads and processes the following **on your
device only**, without transmitting it:

| Data processed locally | Purpose | Leaves your device? |
|---|---|---|
| Page text / DOM content of pages you visit | Local AI page-sensitivity / risk classification | No |
| Images rendered on the current page; a screenshot of the active tab (`tabs.captureVisibleTab`) | Local "AI vision" ad-image detection (classify ad / not-ad, then blur ad images) | No |
| Form fields / honeypot interactions | Detecting tracker honeypots and fingerprinting attempts | No |
| Cookies and request metadata | Tracker/cookie hardening and blocklist matching | No |
| Local AI model weights and runtime | Cached in the browser so inference works offline | Stays on device |
| Your settings and counters | Saved in `chrome.storage.local` on your device | No |

This processing is **ephemeral**: inputs are used to compute a result and are not
retained as a profile. We do not build user profiles and we do not log your
activity off-device.

## 3. What we do NOT do

- We do **not** collect personal or sensitive data.
- We do **not** transmit page content, images, screenshots, or browsing activity
  to us or to any third party.
- We do **not** sell or share your data; there is nothing to sell or share.
- We operate **no analytics, no advertising, no tracking, no remote logging.**

## 4. The on-device boundary (and what would change it)

The "nothing leaves your device" guarantee depends on the absence of any
off-device transmission. Under EU ePrivacy Directive Art. 5(3) (as interpreted by
EDPB Guidelines 2/2023, §3.2), purely local production of information is **out of
scope**, but *sending any result back over the network to a server* would
constitute "gaining of access" and re-engage the law. Cloak & Dagger is
architected to never make that transmission. The optional, signed **blocklist
update** mechanism (if enabled) only downloads a public, signed blocklist file
from its source; it does **not** upload anything about you. We will update this
policy before introducing any feature that transmits data.

## 5. Permissions and why they are needed

Per the Chrome Web Store narrowest-permissions requirement, the extension's
permissions and their justifications are listed in
[CHROME_WEB_STORE_LISTING.md](CHROME_WEB_STORE_LISTING.md) and in the extension's
"Legal / Permissions" screen. Host permissions and `tabs.captureVisibleTab` are
used solely to deliver the locally-described, user-initiated features above and
for no other purpose.

## 6. Chrome Web Store Limited Use disclosure

The use of any information accessed by this extension adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements. Cloak & Dagger uses information solely to
provide and improve its single user-facing purpose (local privacy protection) and
does not transfer, sell, or use such information for any unrelated purpose,
advertising, or creditworthiness/lending. (Cloak & Dagger uses **no** Google APIs;
this statement is provided for completeness and to satisfy the Limited Use
disclosure obligation that attaches to handling page content.)

## 7. Your privacy rights (GDPR, CCPA/CPRA)

Because the extension collects no personal data and transmits nothing, the GDPR
Art. 13 "information to be provided where personal data are collected from the data
subject" trigger is **not engaged**, and there is no personal data for us to
access, rectify, erase, or sell. We nonetheless affirm: we are **not** a "business"
selling or sharing personal information under the CCPA/CPRA, and we hold no personal
data about you on any server. If you believe any feature processes data in a way
not described here, contact us at [CONTACT EMAIL]. We do not claim that on-device
processing places us categorically outside data-protection law; rather, we have
designed the product so that no personal data is collected or transmitted.

Any data the extension stores (settings, counters, cached models) lives only in
your browser; clearing the extension's storage or uninstalling it removes it.

## 8. Children

The extension is not directed to children and collects no data from anyone.

## 9. Changes

We will post material changes here and update the Effective date and the
in-extension Legal screen.
