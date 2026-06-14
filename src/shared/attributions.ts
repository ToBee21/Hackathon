// src/shared/attributions.ts
// Third-party attributions rendered in the in-extension "Licenses" screen
// (src/tabs/licenses.tsx) and kept in sync with THIRD_PARTY_LICENSES.md at the
// repo root. The data here is produced by the license-attribution audit
// (web-researched + adversarially verified) — do not hand-edit licenses without
// re-verifying against the primary source.

export type AttributionCategory =
  | "Local AI models"
  | "ML runtime"
  | "Libraries"
  | "Blocklist data"
  | "Build tooling"

export interface Attribution {
  /** Human label, e.g. "SmolVLM-256M-Instruct". */
  name: string
  /** What it powers in the product, e.g. "Vision ad-detector". */
  component: string
  category: AttributionCategory
  /** Canonical license name, e.g. "Apache-2.0", "Gemma Terms of Use". */
  license: string
  /** SPDX id where one exists, else "" (e.g. proprietary terms). */
  spdx: string
  /** Primary source URL (repo / model card / license). */
  url: string
  /** One-line attribution/notice shown to the user. */
  attribution: string
  /** True when the license requires a visible notice on redistribution. */
  requiresNotice: boolean
}

// Populated from the verified license-attribution audit. Ordered by category.
export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    name: "SmolVLM-256M-Instruct",
    component: "Local AI model (vision/VLM, q4f16 ONNX weights)",
    category: "Local AI models",
    license: "Apache License 2.0",
    spdx: "Apache-2.0",
    url: "https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct",
    attribution:
      "SmolVLM-256M-Instruct © Hugging Face, licensed under Apache-2.0; q4f16 ONNX weights are a quantized modification (built on Apache-2.0 SmolLM2-135M-Instruct + SigLIP).",
    requiresNotice: true
  },
  {
    name: "gemma-3-1b-it",
    component: "Local AI model (LLM, q4f16 ONNX weights)",
    category: "Local AI models",
    license: "Gemma Terms of Use",
    spdx: "LicenseRef-Gemma-Terms-of-Use",
    url: "https://ai.google.dev/gemma/terms",
    attribution:
      "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms; use is also governed by the Gemma Prohibited Use Policy.",
    requiresNotice: true
  },
  {
    name: "Qwen3.5-0.8B",
    component: "Local AI model (text + vision LLM, q4f16 ONNX weights)",
    category: "Local AI models",
    license: "Apache License 2.0",
    spdx: "Apache-2.0",
    url: "https://huggingface.co/Qwen/Qwen3.5-0.8B",
    attribution:
      "Qwen3.5-0.8B © 2026 Alibaba Cloud, licensed under Apache-2.0; bundled q4f16 ONNX (text + vision) weights are a quantized modification.",
    requiresNotice: true
  },
  {
    name: "nli-deberta-v3-small",
    component: "Local AI model (NLI / zero-shot classification, int8 ONNX)",
    category: "Local AI models",
    license: "Apache-2.0 (model) with MIT base and CC BY-SA / CC BY datasets",
    spdx: "Apache-2.0 AND MIT AND CC-BY-SA-4.0 AND CC-BY-SA-3.0 AND CC-BY-3.0",
    url: "https://huggingface.co/cross-encoder/nli-deberta-v3-small",
    attribution:
      "cross-encoder/nli-deberta-v3-small (Apache-2.0; ONNX by Xenova) on microsoft/deberta-v3-small (MIT); fine-tuned on MultiNLI (Williams/Nangia/Bowman 2018) and SNLI CC BY-SA 4.0 (Bowman et al. 2015) — cite both.",
    requiresNotice: true
  },
  {
    name: "sensitivity-distil-minilm",
    component: "Local AI model (first-party page-sensitivity classifier, int8 ONNX)",
    category: "Local AI models",
    license: "First-party (Cloak & Dagger); derived from Apache-2.0 upstreams",
    spdx: "Apache-2.0 AND MIT AND CC-BY-SA-4.0 AND CC-BY-SA-3.0 AND CC-BY-3.0",
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
    attribution:
      "First-party model distilled from all-MiniLM-L6-v2 (Apache-2.0) using cross-encoder/nli-deberta-v3-small (Apache-2.0) as teacher; the MNLI/SNLI dataset citations apply via the teacher.",
    requiresNotice: true
  },
  {
    name: "@huggingface/transformers (Transformers.js)",
    component: "ML runtime (npm, bundled)",
    category: "ML runtime",
    license: "Apache License 2.0",
    spdx: "Apache-2.0",
    url: "https://github.com/huggingface/transformers.js",
    attribution:
      "Transformers.js (@huggingface/transformers) © Hugging Face, licensed under Apache-2.0 (no upstream NOTICE file).",
    requiresNotice: true
  },
  {
    name: "onnxruntime-web",
    component: "ONNX runtime (bundled WASM + JS)",
    category: "ML runtime",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/microsoft/onnxruntime",
    attribution:
      "ONNX Runtime Web © Microsoft Corporation, licensed under the MIT License.",
    requiresNotice: true
  },
  {
    name: "three.js",
    component: "Library (npm, bundled 3D STL viewer)",
    category: "Libraries",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/mrdoob/three.js",
    attribution:
      "three.js © 2010-2026 three.js authors, licensed under the MIT License.",
    requiresNotice: true
  },
  {
    name: "React + react-dom",
    component: "Library (npm, bundled UI)",
    category: "Libraries",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/facebook/react",
    attribution:
      "React and react-dom © Meta Platforms, Inc. and affiliates, licensed under the MIT License.",
    requiresNotice: true
  },
  {
    name: "Plasmo",
    component: "Build tooling (extension framework; runtime helpers bundled)",
    category: "Libraries",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/PlasmoHQ/plasmo",
    attribution:
      "Plasmo © 2023 Plasmo Corp. <foss@plasmo.com> and contributors, licensed under the MIT License.",
    requiresNotice: true
  },
  {
    name: "Tailwind CSS",
    component: "Build tooling (styling; compiled CSS ships)",
    category: "Build tooling",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/tailwindlabs/tailwindcss",
    attribution:
      "Tailwind CSS © Tailwind Labs, Inc., licensed under the MIT License; do not strip the compiled-CSS MIT banner.",
    requiresNotice: true
  },
  {
    name: "HaGeZi DNS-Blocklists",
    component: "Blocklist data (tracker/malware/phishing DNS lists)",
    category: "Blocklist data",
    license: "GNU General Public License v3.0",
    spdx: "GPL-3.0-only",
    url: "https://github.com/hagezi/dns-blocklists",
    attribution:
      "HaGeZi DNS-Blocklists © HaGeZi, licensed under GPL-3.0 (copyleft); ship the full GPL-3.0 text, keep the list as separate unmodified data, and honor upstream-source licenses listed in sources.md.",
    requiresNotice: true
  },
  {
    name: "Phishing.Database",
    component: "Blocklist data (phishing domains)",
    category: "Blocklist data",
    license: "MIT License",
    spdx: "MIT",
    url: "https://github.com/Phishing-Database/Phishing.Database",
    attribution:
      "Phishing.Database © 2018-2025 Mitchell Krog, Nissar Chababy, and Phishing.Database Contributors, licensed under the MIT License.",
    requiresNotice: true
  }
]

export const ATTRIBUTION_CATEGORY_ORDER: readonly AttributionCategory[] = [
  "Local AI models",
  "ML runtime",
  "Libraries",
  "Blocklist data",
  "Build tooling"
]

/**
 * The legally DISTINCT notices that warrant prominent, separate display at the
 * top of the Licenses screen: Google Gemma's custom Terms of Use and any
 * copyleft (GPL) component. Permissive MIT/Apache attributions are satisfied by
 * the grouped list below + the bundled licenses/ texts.
 */
export function noticeRequiredAttributions(): Attribution[] {
  return ATTRIBUTIONS.filter(
    (a) => /Gemma/i.test(a.spdx) || /GPL/i.test(a.spdx)
  )
}

/** Group attributions by category in display order. */
export function attributionsByCategory(): Array<{
  category: AttributionCategory
  items: Attribution[]
}> {
  return ATTRIBUTION_CATEGORY_ORDER.map((category) => ({
    category,
    items: ATTRIBUTIONS.filter((a) => a.category === category)
  })).filter((group) => group.items.length > 0)
}
