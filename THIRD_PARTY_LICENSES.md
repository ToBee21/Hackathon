# Third-Party Licenses and Attributions

**Product:** Cloak & Dagger — a privacy and data-sovereignty browser extension (Chrome MV3, built with Plasmo).

Cloak & Dagger is publicly distributed and **redistributes the third-party components listed below** (bundled local AI model weights, ML runtimes, JavaScript libraries, DNS/phishing blocklist data, and build tooling whose output ships inside the package). For every component we **comply with the applicable license terms**: we retain all required copyright, attribution, and notice texts; we ship a copy of (or a durable link to) each governing license; where a component was modified (e.g. ONNX quantization) we mark it as a change; and we pass through every redistribution condition imposed by the upstream license. The exact required notice text for each component is reproduced verbatim below.

Three obligations deserve special attention up front:

- **Google Gemma (`gemma-3-1b-it`)** is **not** open source. The bundled weights are governed by the **Gemma Terms of Use** (`ai.google.dev/gemma/terms`) and the **Gemma Prohibited Use Policy** (`ai.google.dev/gemma/prohibited_use_policy`). Distribution of Gemma carries four mandatory conditions (Section 3.1) — including shipping the verbatim Gemma Notice string, providing recipients a copy of the Agreement, marking any modified files, and binding downstream users to the Section 3.2 use restrictions. See the Gemma entry and the Compliance section.
- **Copyleft — HaGeZi DNS-Blocklists** are licensed **GPL-3.0-only** (strong copyleft / share-alike). Redistributing or deriving filter lists from HaGeZi requires shipping the **full GPL-3.0 license text**, retaining all notices, and (for any modified/merged list) offering that combined list itself under GPL-3.0 with corresponding source. See the HaGeZi entry and the Compliance section.
- **NLI dataset citation** — the bundled NLI model (`nli-deberta-v3-small`) was fine-tuned on the **MultiNLI (MNLI)** and **SNLI** corpora. Their attribution/share-alike terms require us to reproduce the **MultiNLI citation (Williams, Nangia & Bowman, 2018)** and the **SNLI citation (Bowman et al., 2015)**, included below.

The full text of the **Apache License 2.0**, the **MIT License**, and the **GNU General Public License v3.0** is referenced for each component and is shipped once alongside this file (`licenses/` directory). License bodies that are required to be reproduced verbatim by their terms (MIT, GPL-3.0) are reproduced in full; Apache-2.0 components share a single embedded copy of the Apache-2.0 text.

---

## Local AI models

All four shipped model artifacts are **q4f16 / int8 ONNX** weights bundled inside the extension and run fully on-device via Transformers.js + ONNX Runtime Web. Each ONNX artifact is a **quantized derivative** of its upstream checkpoint; per Apache-2.0 §4(b) and the Gemma Terms §3.1, we note that the weights were converted/quantized to ONNX (q4f16 or int8) from the original checkpoints.

### SmolVLM-256M-Instruct (vision/VLM)

- **Source / version:** `HuggingFaceTB/SmolVLM-256M-Instruct` (architecture `idefics3`); redistributed as q4f16 ONNX weights under `assets/models/smolvlm-256m/`.
- **SPDX license:** `Apache-2.0`
- **Source URL:** https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct
- **Base models / datasets:** Base models `HuggingFaceTB/SmolLM2-135M-Instruct` (Apache-2.0, text decoder) + `google/siglip-base-patch16-512` (Apache-2.0, vision encoder); trained on `HuggingFaceM4/the_cauldron` + `HuggingFaceM4/Docmatix`.
- **Required attribution / notice (verbatim):**

  ```
  SmolVLM-256M-Instruct
  Copyright (c) Hugging Face
  Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
  Source: https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct
  Built on base models SmolLM2-135M-Instruct and google/siglip-base-patch16-512 (both Apache-2.0); trained on the HuggingFaceM4/the_cauldron and HuggingFaceM4/Docmatix datasets.
  The q4f16 ONNX weights bundled here are a quantized modification of the original checkpoints (Apache-2.0 §4(b)).
  ```

- **Notes:** Redistribution of the weights is permitted (model card: "We release the SmolVLM checkpoints under the Apache 2.0 license."). No separate NOTICE file exists upstream, so reproducing copyright + license + source link satisfies Apache-2.0 §4. Non-binding usage advisory from the model card: the model "is not intended for high-stakes scenarios or critical decision-making processes that affect an individual's well-being or livelihood" and may produce inaccurate content — surfaced to users as guidance, not a license term.

### gemma-3-1b-it (LLM) — Gemma Terms of Use (NOT open source)

- **Source / version:** Google `gemma-3-1b-it`, bundled via `onnx-community/gemma-3-1b-it-ONNX` as q4f16 ONNX weights under `assets/models/gemma-3-1b/`. Derived from base `google/gemma-3-1b-pt`. Copyright Google LLC / Google DeepMind.
- **SPDX license:** `LicenseRef-Gemma-Terms-of-Use` (custom, redistributable-but-restricted; **not** Apache-2.0, **not** OSI-approved)
- **Source URLs:** https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX · https://huggingface.co/google/gemma-3-1b-it · Terms: https://ai.google.dev/gemma/terms · Prohibited Use Policy: https://ai.google.dev/gemma/prohibited_use_policy
- **Required NOTICE text (verbatim — must ship as a Notice file, Gemma Terms §3.1.4):**

  ```
  Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms
  ```

- **Gemma Terms of Use — redistribution obligations (Section 3.1).** Because Cloak & Dagger Distributes Gemma (other than via a Hosted Service), all four conditions apply:
  1. **§3.1.1** — Include the Section 3.2 use restrictions as an enforceable provision in our governing agreement / ToS, AND give downstream users notice that they apply.
  2. **§3.1.2** — Provide every recipient a copy of the Gemma Terms of Use ("the Agreement").
  3. **§3.1.3** — Cause any modified files to carry prominent notices that they were modified. (The q4f16 ONNX conversion is a modification and is marked as such.)
  4. **§3.1.4** — Accompany the Distribution with a "Notice" text file containing exactly the verbatim string above.

  The current Terms (effective 2026-04-01) do **not** require a "Built with Gemma" branding notice; only the specific Notice string is mandated. Gemma is **not copyleft/share-alike** — you may add your own terms to modifications provided they do not conflict with the Agreement and the §3.2 restrictions pass through. Google reserves the right to remotely restrict usage it believes violates the policy or applicable law.
- **Prohibited Use Policy (`ai.google.dev/gemma/prohibited_use_policy`, incorporated by reference via §3.2 — MUST be passed through to downstream users).** Prohibited uses include, among others: (1) generating content that infringes/misappropriates IP; (2) dangerous or illegal activities (CSAM, illegal-drug/weapons facilitation, violent extremism, unlicensed professional — legal/medical/financial — advice presented as from a licensed professional); (3) abuse/disruption of services (spam, fraud, phishing, malware, circumventing safety filters); (4) content causing individual harm (hate speech, harassment, incitement of violence, self-harm facilitation, doxxing, **unauthorized tracking/monitoring/surveillance of individuals without consent**); (5) misinformation/deception (undisclosed impersonation, falsely attributing AI output to a human, defamation, automated decisions materially affecting individual rights/well-being); (6) sexually explicit content for gratification (excluding bona fide scientific/educational/documentary/artistic use).

### Qwen3.5-0.8B (text + vision LLM)

- **Source / version:** Alibaba `Qwen/Qwen3.5-0.8B`. Two artifacts bundled: the **text** variant via `onnx-community/Qwen3.5-0.8B-Text-ONNX` (q4f16 ONNX, `assets/models/qwen3-5-08b-text/`) and the **vision/VLM** variant `Qwen3_5ForConditionalGeneration` (q4f16 ONNX vision encoder + embed-tokens + merged decoder, `assets/models/qwen3-5-08b-vision/`). Base: `Qwen/Qwen3.5-0.8B-Base` → post-trained `Qwen/Qwen3.5-0.8B`. Training data not publicly disclosed by Alibaba.
- **SPDX license:** `Apache-2.0` (uniform across the Qwen3.5 series — no research-license / size-gated carve-out)
- **Source URLs:** https://huggingface.co/Qwen/Qwen3.5-0.8B · https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX
- **Required attribution / notice (verbatim):**

  ```
  Qwen3.5-0.8B
  Copyright 2026 Alibaba Cloud
  Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0).
  Model: https://huggingface.co/Qwen/Qwen3.5-0.8B
  ONNX build: https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX
  The bundled q4f16 ONNX weights (text and vision variants) are a quantized modification of the original checkpoints (Apache-2.0 §4(b)).
  ```

- **Notes:** Base LICENSE is the unmodified standard Apache-2.0 text ("Copyright 2026 Alibaba Cloud"). No upstream NOTICE file (so §4(d) is moot). Not copyleft — bundling in the extension is permitted. Apache-2.0 standard terms: model provided "AS IS"; do not use Alibaba/Qwen trademarks except for required attribution.

### nli-deberta-v3-small (NLI / zero-shot classification)

- **Source / version:** `Xenova/nli-deberta-v3-small` (int8 ONNX) — the ONNX conversion of `cross-encoder/nli-deberta-v3-small`, built on `microsoft/deberta-v3-small`, fine-tuned on MNLI + SNLI. Bundled under `assets/models/nli-deberta-v3-small/` (includes the SentencePiece `spm.model` tokenizer).
- **SPDX license (composite):** `Apache-2.0 AND MIT AND CC-BY-SA-4.0 AND CC-BY-SA-3.0 AND CC-BY-3.0` (model wrapper Apache-2.0; base architecture MIT; embedded training data share-alike/attribution)
- **Source URLs:** https://huggingface.co/Xenova/nli-deberta-v3-small · https://huggingface.co/cross-encoder/nli-deberta-v3-small · https://huggingface.co/microsoft/deberta-v3-small
- **Required attribution / notice (verbatim):**

  ```
  nli-deberta-v3-small (ONNX, int8) — Natural Language Inference / zero-shot classification model.

  Model (Apache License 2.0): "cross-encoder/nli-deberta-v3-small" by the SentenceTransformers / Cross-Encoder project (UKP / Nils Reimers). ONNX conversion: "Xenova/nli-deberta-v3-small" (Joshua Lochner / Hugging Face), distributed under the same Apache-2.0 terms. Licensed under the Apache License, Version 2.0; see https://www.apache.org/licenses/LICENSE-2.0
  Sources: https://huggingface.co/cross-encoder/nli-deberta-v3-small , https://huggingface.co/Xenova/nli-deberta-v3-small
  The int8 ONNX weights bundled here are a quantized modification of the original checkpoint (Apache-2.0 §4(b)).

  Base architecture (MIT License): "DeBERTaV3 small" (microsoft/deberta-v3-small), Copyright (c) Microsoft Corporation. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction... THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Source: https://huggingface.co/microsoft/deberta-v3-small
    He, Gao, Chen. "DeBERTaV3: Improving DeBERTa using ELECTRA-Style Pre-Training with Gradient-Disentangled Embedding Sharing." arXiv:2111.09543, 2021.

  This model was fine-tuned on the following datasets, whose licenses require attribution and are share-alike:

  MultiNLI (MNLI corpus) — released under the OANC license plus Creative Commons Attribution 3.0 Unported (CC BY 3.0) and Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) for certain fiction sources, with remaining fiction in the US public domain. Required citation:
    Adina Williams, Nikita Nangia, Samuel R. Bowman. 2018. "A Broad-Coverage Challenge Corpus for Sentence Understanding through Inference." Proceedings of NAACL-HLT 2018, Vol. 1 (Long Papers), pp. 1112-1122. https://aclanthology.org/N18-1101
    Source: https://huggingface.co/datasets/nyu-mll/multi_nli

  SNLI (Stanford Natural Language Inference Corpus) — "The Stanford Natural Language Inference Corpus by The Stanford NLP Group is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License" (CC BY-SA 4.0, http://creativecommons.org/licenses/by-sa/4.0/). Required citation:
    Samuel R. Bowman, Gabor Angeli, Christopher Potts, Christopher D. Manning. 2015. "A large annotated corpus for learning natural language inference." Proceedings of EMNLP 2015, pp. 632-642. https://aclanthology.org/D15-1075
    Source: https://huggingface.co/datasets/stanfordnlp/snli
  ```

- **Notes:** The shipped Xenova repo declares no own license and inherits Apache-2.0 from `cross-encoder/nli-deberta-v3-small`. The model code/weights are permissively licensed, but the embedded training data is share-alike (SNLI CC BY-SA 4.0; MNLI CC BY-SA 3.0 + CC BY 3.0), so the dataset attributions and both academic citations above are reproduced. NLI outputs are probabilistic and must not be presented as legal/safety advice.

### sensitivity-distil-minilm (page-sensitivity classifier — first-party model, derived from Apache-2.0 upstreams)

- **Source / version:** First-party model trained by the Cloak & Dagger team (`training/`); int8 ONNX under `assets/models/sensitivity-distil-minilm/`. A single-pass MiniLM-L6 multi-label classifier produced by **knowledge distillation**. **Student/base model:** `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0). **Teacher (soft labels distilled into the weights):** `cross-encoder/nli-deberta-v3-small` (Apache-2.0; same MNLI/SNLI lineage as the NLI entry above).
- **SPDX license:** First-party weights, distributed under the Cloak & Dagger product license; the inherited upstream obligations are `Apache-2.0` (base) with the MNLI/SNLI attribution/share-alike chain propagating through the teacher's soft labels.
- **Source URLs:** https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 · https://huggingface.co/cross-encoder/nli-deberta-v3-small
- **Required attribution / notice (verbatim):**

  ```
  sensitivity-distil-minilm — first-party single-pass page-sensitivity classifier (int8 ONNX), trained by the Cloak & Dagger team via knowledge distillation.

  Base / student model (Apache License 2.0): "sentence-transformers/all-MiniLM-L6-v2". Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0). Source: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
  Teacher model whose soft labels were distilled into these weights (Apache License 2.0): "cross-encoder/nli-deberta-v3-small". Source: https://huggingface.co/cross-encoder/nli-deberta-v3-small
  Because the teacher was fine-tuned on MultiNLI and SNLI, the dataset attributions and citations listed under the nli-deberta-v3-small entry (Williams/Nangia/Bowman 2018; Bowman et al. 2015) apply equally to this model.
  ```

- **Notes:** Present in the production build directory; the training README marks it "Not yet wired into the extension." Treated as a shipped redistributable artifact. **This component is not covered by the supplied verified license research and its upstream licenses should be independently confirmed before public release** (see Compliance gaps).

---

## ML runtime

### @huggingface/transformers (Transformers.js)

- **Source / version:** npm `@huggingface/transformers` `^4.2.0` (esbuild/Plasmo-bundled into the extension; aliased to `dist/transformers.web.js`).
- **SPDX license:** `Apache-2.0`
- **Source URL:** https://github.com/huggingface/transformers.js
- **Required attribution / notice (verbatim):**

  ```
  Transformers.js (@huggingface/transformers)
  Copyright (c) Hugging Face
  Licensed under the Apache License, Version 2.0.
  https://github.com/huggingface/transformers.js/blob/main/LICENSE
  ```

- **Notes:** Apache-2.0. The upstream repo ships **no NOTICE file** (the LICENSE is the unmodified Apache-2.0 template with the placeholder copyright line), so §4(d) does not apply; §4(a)–(c) obligations are satisfied by including the Apache-2.0 text + the attribution above. Not copyleft. This entry licenses the **runtime only** — model weights loaded/bundled at runtime carry their own per-model licenses (see Local AI models).

### onnxruntime-web (ONNX Runtime Web)

- **Source / version:** Microsoft ONNX Runtime Web (prebuilt WASM + JS), bundled under `assets/onnxruntime/`.
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/microsoft/onnxruntime
- **Required attribution / notice (verbatim):**

  ```
  onnxruntime-web (ONNX Runtime Web)
  Copyright (c) Microsoft Corporation
  Licensed under the MIT License.
  Source: https://github.com/microsoft/onnxruntime

  MIT License

  Copyright (c) Microsoft Corporation

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** MIT; the canonical LICENSE contains no year — none is invented here. Because the extension bundles the JS + `.wasm` binaries, the MIT notice must be reproduced. Diligence: the full ONNX Runtime source tree ships a `ThirdPartyNotices.txt` (e.g. RapidJSON/MIT) — inspect the installed `dist/` for any bundled third-party notices and include them if present.

---

## Libraries

### three.js

- **Source / version:** npm `three` `^0.169.0` (bundled; 3D STL viewer, e.g. `assets/models/grandma.stl`).
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/mrdoob/three.js
- **Required attribution / notice (verbatim):**

  ```
  three.js
  Copyright © 2010-2026 three.js authors
  Licensed under the MIT License.
  https://github.com/mrdoob/three.js/blob/dev/LICENSE

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** MIT; the copyright holder of record is the collective "three.js authors". License unchanged across versions.

### React + react-dom

- **Source / version:** npm `react` + `react-dom` `^18.3.1` (bundled UI; from the `facebook/react` monorepo under one shared LICENSE).
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/facebook/react
- **Required attribution / notice (verbatim):**

  ```
  React

  MIT License

  Copyright (c) Meta Platforms, Inc. and affiliates.

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** Plain MIT (the historical BSD+Patents grant was removed in React 16, Sept 2017). One entry covers both `react` and `react-dom`.

---

## Build tooling

> Build-time tooling is listed because either (a) its runtime helpers are compiled into the shipped extension, or (b) its output ships. Pure dev-only tools that ship nothing (e.g. `@adguard/hostlist-compiler`) are noted but impose no redistribution obligation on the extension package.

### Plasmo (extension framework — runtime helpers bundled)

- **Source / version:** npm `plasmo` `^0.90.5` (build-time tooling + runtime helpers bundled into the MV3 extension).
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/PlasmoHQ/plasmo
- **Required attribution / notice (verbatim):**

  ```
  Plasmo
  Copyright (c) 2023 Plasmo Corp. <foss@plasmo.com> (https://www.plasmo.com) and contributors
  Licensed under the MIT License.
  https://github.com/PlasmoHQ/plasmo/blob/main/LICENSE

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** MIT; Plasmo's runtime helpers are bundled (substantial portions), so the notice is required. Copyright-line address is `foss@plasmo.com`.

### Tailwind CSS (build-time; compiled CSS ships)

- **Source / version:** npm `tailwindcss` `^3.4.17` (build-time CSS framework; only the **compiled CSS** ships, not the source).
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/tailwindlabs/tailwindcss
- **Required attribution / notice (verbatim):**

  ```
  Tailwind CSS
  Copyright (c) Tailwind Labs, Inc.
  Licensed under the MIT License.
  https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE

  MIT License

  Copyright (c) Tailwind Labs, Inc.

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** MIT. Tailwind's build emits a banner in the compiled CSS (`/*! tailwindcss vX | MIT License | https://tailwindcss.com */`) — do **not** strip it; it plus this entry satisfy the obligation. MIT has no NOTICE-file mechanism.

### @adguard/hostlist-compiler (dev-only — not shipped)

- **Source / version:** npm `@adguard/hostlist-compiler` `^2.1.0`. Used at build time (`scripts/compile-blocklists.mjs`) only to fetch, normalize, compress, and de-duplicate the blocklist feeds. **Not bundled** in the extension.
- **SPDX license:** `MIT` (AdGuard / `AdguardTeam/HostlistCompiler`) — **confirm before release** (see Compliance gaps).
- **Source URL:** https://github.com/AdguardTeam/HostlistCompiler
- **Notes:** Because it ships nothing, it imposes no redistribution obligation on the extension package; listed for transparency.

---

## Blocklist data

The blocklist data layer (`src/shared/blocklist/`) is compiled at build time from the feeds below and shipped as **data, not code** — parsed by a strict schema whose only expressible action is "block a domain" (`bundleSchema.ts`); it is never `eval`'d.

### HaGeZi DNS-Blocklists — GPL-3.0 (COPYLEFT / share-alike)

- **Source / version:** `hagezi/dns-blocklists`. Bundled/derived lists: `pro.mini` (tracker), `tif.mini` (threat-intel: malware/phishing/C2), `nrd7` (newly-registered domains, escalation tier).
- **SPDX license:** `GPL-3.0-only` (the LICENSE has no project-wide "or any later version" grant — do **not** use `GPL-3.0-or-later`)
- **Source URLs:** https://github.com/hagezi/dns-blocklists · LICENSE: https://github.com/hagezi/dns-blocklists/blob/main/LICENSE · upstream sources: https://github.com/hagezi/dns-blocklists/blob/main/sources.md
- **Required attribution / notice (verbatim):**

  ```
  HaGeZi DNS-Blocklists — Copyright (C) HaGeZi (https://github.com/hagezi). Licensed under the GNU General Public License v3.0 (GPL-3.0). Source: https://github.com/hagezi/dns-blocklists — full license text: https://github.com/hagezi/dns-blocklists/blob/main/LICENSE. This program comes with ABSOLUTELY NO WARRANTY. This is free software, and you are welcome to redistribute it under the terms of the GPL-3.0. NOTE: HaGeZi's lists aggregate many upstream third-party sources, each governed by its own license (see https://github.com/hagezi/dns-blocklists/blob/main/sources.md); those licenses must be honored in addition to GPL-3.0.
  ```

- **Copyleft / share-alike implications (this is the legally significant constraint):**
  - On redistribution, GPL-3.0 §4/§5 require us to **retain all copyright/license notices**, **ship the full verbatim GPL-3.0 license text** with the distribution, and **prominently state** the work is GPL-3.0 with the no-warranty notice.
  - **Mere aggregation (preferred):** If we bundle the **unmodified** HaGeZi list as a separate, clearly-labeled GPL-3.0 data file that our independently-written code reads at runtime, the GPL's §5 "aggregate" clause means the copyleft does **not** virally relicense our own extension source — but we still must ship that list under GPL-3.0 with its source + notice. **Our design keeps HaGeZi data as separate, labeled, GPL-3.0 data parsed by a fixed schema, exactly to stay in mere-aggregation territory.**
  - **Derivative (must avoid for proprietary code):** If we **modify/merge/derive** a combined filter list from HaGeZi, that combined list is a derivative work and must itself be offered under GPL-3.0 with corresponding source (§5/§6).
  - **Aggregation nuance:** `sources.md` states "Every source has its own license, for the individual licenses see the source files or source repositories." HaGeZi is a compilation of ~300+ upstream lists, so bundling/deriving it can pull in **additional** upstream-source obligations beyond GPL-3.0. (The "Copyright (C) 2007 Free Software Foundation, Inc." line in the LICENSE is GPL boilerplate, **not** the blocklist's copyright holder — attribute to "HaGeZi".)
  - Redistribution (including commercial) is permitted; no field-of-use restriction. Only the standard §15–16 warranty/liability disclaimer applies.

### Phishing.Database — MIT

- **Source / version:** `Phishing-Database/Phishing.Database` (formerly `mitchellkrogza/Phishing.Database`). Used list: `phishing-domains-ACTIVE.txt`.
- **SPDX license:** `MIT`
- **Source URL:** https://github.com/Phishing-Database/Phishing.Database
- **Required attribution / notice (verbatim):**

  ```
  Phishing.Database
  Copyright (c) 2018-2025 Mitchell Krog - github.com/mitchellkrogza
  Copyright (c) 2018-2025 Nissar Chababy - github.com/funilrys
  Copyright (c) 2018-2025 Phishing.Database Contributors - github.com/Phishing-Database
  Licensed under the MIT License. https://github.com/Phishing-Database/Phishing.Database/blob/master/LICENSE

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  ```

- **Notes:** MIT — must preserve the notice + all three copyright lines because the data is bundled/derived inside the redistributed extension. Not copyleft. Bundling a filtered subset is permitted.

---

## Full license texts

The following license bodies are shipped alongside this file:

- **Apache License 2.0** — `licenses/Apache-2.0.txt` (covers SmolVLM-256M-Instruct, Qwen3.5-0.8B text + vision, nli-deberta-v3-small wrapper, sensitivity-distil-minilm upstreams, Transformers.js).
- **MIT License** — reproduced verbatim per component above (covers onnxruntime-web, three.js, React/react-dom, Plasmo, Tailwind CSS, Phishing.Database). DeBERTa's MIT notice is embedded in the NLI entry.
- **GNU General Public License v3.0** — `licenses/GPL-3.0.txt` (full verbatim text; required for HaGeZi).
- **Gemma Terms of Use** — `licenses/Gemma-Terms-of-Use.txt` + **Gemma Prohibited Use Policy** `licenses/Gemma-Prohibited-Use-Policy.txt` (durable copies; required to be provided to recipients).
- **Creative Commons** — CC BY 3.0, CC BY-SA 3.0, CC BY-SA 4.0 (referenced by the NLI training datasets); links provided inline.
