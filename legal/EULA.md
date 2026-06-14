# End-User License Agreement (EULA)

**Product:** Cloak & Dagger — a privacy and data-sovereignty browser extension (Chrome MV3).
**Provider:** [PROVIDER / LEGAL ENTITY] ("Provider", "we", "us"), author "Hackathon Signal:Noise Team".
**Effective date:** [EFFECTIVE DATE]
**Contact:** [CONTACT EMAIL]

> This EULA is a template prepared from a cited legal-requirements review (see
> `build/legal-research.md`). The warranty-disclaimer, limitation-of-liability,
> and indemnification clauses below reflect standard commercial-drafting norms and
> are **not legal advice**; have counsel review before public release. The Gemma
> notice string and the Gemma acceptable-use pass-through are hard, citable
> requirements and are reproduced as required.

## 1. Acceptance

By installing or using Cloak & Dagger (the "Software") you agree to this EULA, the
[Terms of Service](TERMS_OF_SERVICE.md), the [Privacy Policy](PRIVACY_POLICY.md),
and the [Disclaimer & Limitation of Liability](DISCLAIMER_AND_LIABILITY.md). If you
do not agree, do not install or use the Software.

## 2. License grant

The Provider grants you a personal, non-exclusive, non-transferable, revocable
license to install and use the Software for your own lawful privacy self-defense,
free of charge. The Software, except for the third-party components in Section 4,
is provided under its own terms; this license does not transfer ownership.

## 3. On-device operation

All AI inference and analysis run entirely on your device (WebGPU/WASM). The
Software does not operate any server and does not transmit your page content,
images, screenshots, form data, or browsing activity off your device. See the
[Privacy Policy](PRIVACY_POLICY.md).

## 4. Third-party components

The Software bundles and redistributes third-party AI model weights, runtimes,
libraries, and blocklist data. Each is governed by its own license; the complete,
verified attribution is in [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md)
and the full license texts are in the [`licenses/`](../licenses) directory, both
shipped with the product and surfaced in the extension's "Licenses" screen. Your
use of each component is additionally subject to that component's license.

### 4.1 Google Gemma (gemma-3-1b)

The Software bundles Google "Gemma" model weights. **Gemma is provided under and
subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms.** A copy of
the Gemma Terms of Use notice and the Gemma Prohibited Use Policy reference is
shipped at [`licenses/Gemma-Terms-of-Use.txt`](../licenses/Gemma-Terms-of-Use.txt),
and the governing documents are available at:

- Gemma Terms of Use: https://ai.google.dev/gemma/terms
- Gemma Prohibited Use Policy: https://ai.google.dev/gemma/prohibited_use_policy

By enabling or using the Gemma model in the Software you accept and agree to be
bound by the Gemma Terms of Use and the Gemma Prohibited Use Policy as the
governing agreement for the Gemma weights (you are a recipient of those weights;
this Section, the shipped notice, and the in-extension Gemma consent screen
provide you a copy of, and bind you to, that agreement). The bundled Gemma weights
have been **modified** from the original `google/gemma-3-1b-it` checkpoint —
quantized to q4f16 and exported to ONNX — as noted in the shipped notices. Google
may restrict (remotely or otherwise) usage of Gemma that Google reasonably
believes violates the Gemma Terms of Use or the Gemma Prohibited Use Policy or any
applicable law. Cloak & Dagger is not affiliated with, authorized by, or endorsed
by Google; "Gemma" and "Google" are named here solely for factual attribution.

### 4.2 HaGeZi DNS blocklist data (GPL-3.0)

The Software bundles HaGeZi DNS blocklist **data** licensed under the GNU General
Public License v3.0 (`licenses/GPL-3.0.txt`). That data is bundled as a separate,
unmodified data file (a "mere aggregate"). **Nothing in this EULA restricts, and
this EULA does not purport to restrict, your rights under the GPL-3.0 with respect
to that blocklist data** — you remain free to copy, extract, modify, and
redistribute that data under, and subject to, the GPL-3.0.

## 5. Acceptable use

You will use the Software only for lawful purposes and in compliance with all
applicable laws and with the licenses of the bundled components. In particular, as
a condition of the license to the bundled Gemma weights (Gemma Terms of Use §3.1 /
§3.2 and the Gemma Prohibited Use Policy, passed through to you here as an
enforceable provision), **you may not use, nor allow others to use, Gemma or any
model derivative to:**

1. **Perform or facilitate activities that violate intellectual-property rights**,
   including infringing, misappropriating, or otherwise violating the rights of
   any third party.
2. **Engage in, promote, or facilitate dangerous, illegal, or malicious
   activities**, including child sexual abuse or exploitation; generating or
   facilitating illegal weapons, drugs, or other illegal goods/services;
   harassment, intimidation, or threats; unauthorized tracking, monitoring, or
   surveillance of individuals without their consent; processing or revealing
   sensitive personal information about individuals without authorization;
   providing or presenting output as licensed/professional legal, medical,
   financial, or similar advice; or attempting to circumvent or disable safety
   filters or operational safeguards.
3. **Generate or facilitate misinformation, misrepresentation, or deception**,
   including impersonating a person or entity without explicit disclosure in a way
   intended to deceive; falsely attributing AI-generated output to a human; making
   automated decisions that produce material adverse effects on an individual's
   legal rights or access to essential services (e.g., finance, legal, employment,
   healthcare, housing, insurance, social welfare) without appropriate human
   oversight; or defamation.
4. **Generate sexually explicit content for the purposes of pornography or sexual
   gratification.** Note that this does not include content created for scientific,
   educational, documentary, or artistic purposes.

These restrictions are in addition to, and do not limit, any other acceptable-use
terms in the [Terms of Service](TERMS_OF_SERVICE.md). Cloak & Dagger's own
features (local risk classification and ad-image detection) are designed for the
consenting user's self-protection and must not be repurposed in violation of the
above.

## 6. No warranty (AS IS)

THE SOFTWARE AND ALL BUNDLED MODELS, CLASSIFIERS, AND DATA ARE PROVIDED **"AS IS"
AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND**, EXPRESS, IMPLIED, OR STATUTORY,
INCLUDING WITHOUT LIMITATION THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR
A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. The AI outputs (including the
page-risk classifier and the vision ad-detector) are best-effort, may be
inaccurate or incomplete ("hallucinated"), and are **not** professional, legal,
medical, financial, or security advice. See the
[Disclaimer & Limitation of Liability](DISCLAIMER_AND_LIABILITY.md).

## 7. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL THE PROVIDER OR
ITS CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING
OUT OF OR RELATED TO THE SOFTWARE OR THIS EULA, WHETHER IN CONTRACT, TORT, OR
OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. Because the Software
is provided free of charge, the Provider's aggregate liability will not exceed the
amount you paid for the Software (which is zero) or, where a minimum applies by
law, the minimum permitted amount. Some jurisdictions do not allow certain
exclusions; in those jurisdictions liability is limited to the maximum extent
permitted by law.

## 8. Indemnification

To the extent permitted by applicable law, you agree to indemnify and hold harmless
the Provider and its contributors from any claim or demand, including reasonable
legal fees, arising out of your use of the Software in violation of this EULA, the
acceptable-use restrictions in Section 5, or any applicable law or third-party
license (including the Gemma Terms of Use and Gemma Prohibited Use Policy).

## 9. Termination

This license terminates automatically if you breach it. The bundled-component
licenses (including the Gemma Terms of Use and the GPL-3.0 for the blocklist data)
survive per their own terms.

## 10. Governing law

This EULA is governed by the laws of [GOVERNING-LAW JURISDICTION], without regard
to conflict-of-laws rules, except where mandatory local consumer law applies.

## 11. Changes

We may update this EULA; material changes will be reflected by the Effective date
and the in-extension Legal screen. Continued use after an update constitutes
acceptance.
