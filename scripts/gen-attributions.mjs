// Fill src/shared/attributions.ts ATTRIBUTIONS[] from the verified license audit
// (build/attributions-raw.json produced by the license-attribution workflow).
import { readFileSync, writeFileSync } from "node:fs"

const raw = JSON.parse(readFileSync("build/attributions-raw.json", "utf8"))

function category(name) {
  if (/SmolVLM|gemma|Qwen|deberta|minilm|MiniLM/i.test(name)) return "Local AI models"
  if (/transformers|onnxruntime/i.test(name)) return "ML runtime"
  if (/three|React|Plasmo/i.test(name)) return "Libraries"
  if (/HaGeZi|Phishing/i.test(name)) return "Blocklist data"
  return "Build tooling"
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim()
}

const items = raw.map((x) => ({
  name: esc(x.name),
  component: esc(x.component || x.componentRole || x.role || ""),
  category: category(x.name),
  license: esc(x.license),
  spdx: esc(x.spdx || ""),
  url: esc(x.url || (Array.isArray(x.sourceUrls) ? x.sourceUrls[0] : "") || ""),
  attribution: esc(x.attribution),
  requiresNotice: Boolean(x.requiresNotice)
}))

const lit =
  "export const ATTRIBUTIONS: readonly Attribution[] = [\n" +
  items
    .map(
      (i) =>
        "  {\n" +
        `    name: "${i.name}",\n` +
        `    component: "${i.component}",\n` +
        `    category: "${i.category}",\n` +
        `    license: "${i.license}",\n` +
        `    spdx: "${i.spdx}",\n` +
        `    url: "${i.url}",\n` +
        `    attribution:\n      "${i.attribution}",\n` +
        `    requiresNotice: ${i.requiresNotice}\n` +
        "  }"
    )
    .join(",\n") +
  "\n]"

let ts = readFileSync("src/shared/attributions.ts", "utf8")
ts = ts.replace(
  /\/\/ NOTE: populated[^\n]*\nexport const ATTRIBUTIONS: readonly Attribution\[\] = \[\]/,
  "// Populated from the verified license-attribution audit. Ordered by category.\n" +
    lit
)
writeFileSync("src/shared/attributions.ts", ts)
console.log("filled " + items.length + " attributions")
for (const i of items) {
  console.log(
    `  [${i.category}] ${i.name} -> ${i.spdx || i.license}${i.requiresNotice ? " *notice*" : ""}`
  )
}
