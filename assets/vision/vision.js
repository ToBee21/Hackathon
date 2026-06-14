// Offline Vision Ad-Detector — runs as its OWN web-accessible extension page
// (mirrors assets/offscreen/), a separate CONTEXT from the offscreen but sharing
// the SAME migrated runtime bundle (assets/vendor/transformers.web.js — the
// esbuild-bundled newer transformers.js that now also serves the offscreen text
// models and exposes the VLM low-level API). Loads SmolVLM-256M-Instruct
// (idefics3, q4f16) on WebGPU and classifies whether an image is an
// advertisement — fully local. Emits DIAG-prefixed console lines so the
// Playwright runner (scripts/diag-vision.mjs) can verify it without a UI.

import {
  AutoModelForImageTextToText,
  AutoProcessor,
  RawImage,
  env
} from "../vendor/transformers.web.js"

// ---- Bundled model layout (flat folder under assets/models/) ---------------
const LOCAL_MODEL_ID = "smolvlm-256m"
const PROMPT =
  "Look at this image. Is it an advertisement or marketing banner trying to sell a product? Answer with one short sentence describing what the image shows."

// ---- DIAG logging (consumed by scripts/diag-vision.mjs) --------------------
const diag = (...a) => console.log("DIAG", ...a)

// ---- DOM helpers -----------------------------------------------------------
const $ = (id) => document.getElementById(id)
const setStatus = (s) => {
  const el = $("status")
  if (el) el.textContent = s
  diag("STATUS", s)
}
const setVerdict = (isAd, pending = false) => {
  const el = $("verdict")
  if (!el) return
  el.className = "mono " + (pending ? "pending" : isAd ? "ad" : "notad")
  el.textContent = pending ? "…" : isAd ? "ADVERTISEMENT" : "NOT AN AD"
}

const runtimeUrl = (p) => chrome.runtime.getURL(p)

// ---- One-time runtime config (verified working path) -----------------------
function configureEnv() {
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = runtimeUrl("assets/models/")
  env.useBrowserCache = false

  const onnx = env.backends?.onnx
  if (onnx?.wasm) {
    onnx.wasm.wasmPaths = runtimeUrl("assets/onnxruntime/")
    // Keep ORT single-threaded and in-page (no worker) so it stays inside the
    // extension-page CSP and never tries to spawn a blocked Worker.
    onnx.wasm.numThreads = 1
    onnx.wasm.proxy = false
  }
  if (onnx?.webgpu) {
    onnx.webgpu.powerPreference = "high-performance"
  }
  diag("ENV", "localModelPath=" + env.localModelPath)
}

// ---- Synthetic product advertisement --------------------------------------
// A large, unmistakable marketing banner (brand header, product, big price,
// % OFF badge, BUY NOW button, free-shipping line) so the verify runs without a
// real tab AND a tiny VLM can recognize it as advertising.
function drawSyntheticAd(canvas) {
  canvas.width = 512
  canvas.height = 512
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d")
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"

  // Card background
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = "#fff4e6"
  ctx.fillRect(0, 0, w, h)

  // Brand header bar
  ctx.fillStyle = "#e21b1b"
  ctx.fillRect(0, 0, w, 92)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 46px Arial, sans-serif"
  ctx.fillText("MEGA SALE", 26, 62)
  ctx.font = "bold 22px Arial, sans-serif"
  ctx.fillText("Limited time offer", 28, 84)

  // Product "box" (a stylised shoe-box / product image placeholder)
  ctx.fillStyle = "#1f6fe2"
  ctx.fillRect(60, 140, 230, 180)
  ctx.fillStyle = "#9fc1f2"
  ctx.fillRect(78, 158, 194, 110)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 26px Arial, sans-serif"
  ctx.fillText("PRODUCT", 96, 300)

  // "50% OFF" starburst badge
  ctx.save()
  ctx.translate(380, 200)
  ctx.fillStyle = "#ffcc00"
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const r = i % 2 === 0 ? 78 : 56
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = "#e21b1b"
  ctx.font = "bold 30px Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("50%", 0, -2)
  ctx.fillText("OFF", 0, 28)
  ctx.restore()
  ctx.textAlign = "left"

  // Big price
  ctx.fillStyle = "#111111"
  ctx.font = "bold 64px Arial, sans-serif"
  ctx.fillText("$19.99", 60, 392)
  ctx.fillStyle = "#888888"
  ctx.font = "28px Arial, sans-serif"
  // strike-through old price
  const oldX = 300
  ctx.fillText("$39.99", oldX, 388)
  ctx.strokeStyle = "#888888"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(oldX - 4, 379)
  ctx.lineTo(oldX + 96, 379)
  ctx.stroke()

  // BUY NOW button
  ctx.fillStyle = "#1aa34a"
  ctx.fillRect(60, 420, 240, 60)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 30px Arial, sans-serif"
  ctx.fillText("BUY NOW", 96, 460)

  // Free shipping line
  ctx.fillStyle = "#333333"
  ctx.font = "bold 22px Arial, sans-serif"
  ctx.fillText("Free shipping - Shop today!", 60, 504)

  return canvas.toDataURL("image/png")
}

// ---- Control image: a plain text article (NOT an ad) -----------------------
// Lets the verify prove the detector DISCRIMINATES rather than always saying AD.
function drawPlainArticle(canvas) {
  canvas.width = 512
  canvas.height = 512
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = "#111111"
  ctx.textAlign = "left"
  ctx.font = "bold 30px Georgia, serif"
  ctx.fillText("Weather report", 30, 56)
  ctx.fillStyle = "#222222"
  ctx.font = "20px Georgia, serif"
  const lines = [
    "The morning sky was clear over the valley as",
    "researchers recorded temperatures across the",
    "region. Scientists noted that rainfall this",
    "season remained close to the long-term average.",
    "A gentle wind moved through the forest while",
    "birds gathered near the river at dawn. The",
    "study describes patterns observed over ten",
    "years of careful measurement and analysis."
  ]
  lines.forEach((ln, i) => ctx.fillText(ln, 30, 110 + i * 34))
  return canvas.toDataURL("image/png")
}

// ---- Lazy model load (load once, reuse) ------------------------------------
let _modelPromise = null
async function getModel() {
  if (_modelPromise) return _modelPromise
  _modelPromise = (async () => {
    configureEnv()
    const t0 = performance.now()
    setStatus("loading processor + model (SmolVLM-256M, q4f16, webgpu)…")
    diag("LOAD START")
    const processor = await AutoProcessor.from_pretrained(LOCAL_MODEL_ID)
    const model = await AutoModelForImageTextToText.from_pretrained(
      LOCAL_MODEL_ID,
      {
        dtype: {
          embed_tokens: "q4f16",
          vision_encoder: "q4f16",
          decoder_model_merged: "q4f16"
        },
        device: "webgpu"
      }
    )
    const loadMs = Math.round(performance.now() - t0)
    diag("LOAD DONE", "loadMs=" + loadMs)
    return { processor, model, loadMs }
  })()
  return _modelPromise
}

// ---- Core: classify a data-URL image ---------------------------------------
async function classify(dataUrl) {
  setVerdict(false, true)
  $("desc").textContent = "—"
  $("timings").textContent = "—"
  $("raw").textContent = ""

  const { processor, model, loadMs } = await getModel()

  setStatus("running vision inference…")
  const image = await RawImage.fromURL(dataUrl)

  const messages = [
    {
      role: "user",
      content: [{ type: "image" }, { type: "text", text: PROMPT }]
    }
  ]
  const text = processor.apply_chat_template(messages, {
    add_generation_prompt: true
  })
  const inputs = await processor(text, [image], { do_image_splitting: false })

  const tGen = performance.now()
  const generated = await model.generate({
    ...inputs,
    max_new_tokens: 96,
    do_sample: false
  })
  const genMs = Math.round(performance.now() - tGen)

  // Full decode (includes the prompt) + answer-only (slice off input length).
  const full = processor.batch_decode(generated, { skip_special_tokens: true })
  const fullText = Array.isArray(full) ? full[0] : String(full)

  let answer = fullText
  try {
    const inputLen = inputs.input_ids.dims.at(-1)
    const trimmed = generated.slice
      ? generated.slice([0, null], [inputLen, null])
      : null
    if (trimmed) {
      const ans = processor.batch_decode(trimmed, { skip_special_tokens: true })
      answer = (Array.isArray(ans) ? ans[0] : String(ans)).trim()
    }
  } catch (e) {
    // Fallback: strip everything up to the last "Assistant:" marker.
    const idx = fullText.lastIndexOf("Assistant:")
    if (idx >= 0) answer = fullText.slice(idx + "Assistant:".length).trim()
  }

  // Decide ad / not-ad from the answer text. SmolVLM-256M rarely emits the
  // literal word "advertisement"; it describes the SCENE ("advertising a
  // product", "shopping for a product", "a sale", "buy now"). Treat any clear
  // commerce/marketing description as an ad.
  const lower = answer.toLowerCase()
  const saysYes = /\byes\b/.test(lower)
  const saysNo = /^\s*no\b|\bnot an? (ad|advert)/.test(lower)
  const adWords =
    /advertis|advert\b|promot|marketing|commercial|\bsale\b|\bsell|\bbuy\b|\bshop|\bstore\b|\bproduct\b|\boffer\b|\bdiscount\b|\bdeal\b|\bprice\b|\bbrand\b|\bcoupon\b|% ?off|for sale/.test(
      lower
    )
  const isAd = (saysYes || adWords) && !saysNo

  setVerdict(isAd, false)
  $("desc").textContent = answer
  $("timings").textContent = `load ${loadMs}ms · generate ${genMs}ms`
  $("raw").textContent = "FULL DECODE:\n" + fullText
  setStatus("done")

  diag("ANSWER", JSON.stringify(answer))
  diag("CLASSIFICATION", isAd ? "AD" : "NOT_AD")
  diag(
    "RESULT",
    JSON.stringify({
      isAd,
      loadMs,
      genMs,
      answer
    })
  )
  return { isAd, answer, loadMs, genMs }
}

// ---- Screenshot path: chrome.tabs.captureVisibleTab -> classify ------------
// EXACT wiring for the real screenshot flow. Needs "tabs"/"activeTab" + host
// perms (manifest already grants them). captureVisibleTab returns a PNG data
// URL of the active tab in the current window, which we feed straight into
// classify() — the same pipeline the synthetic image uses.
async function classifyActiveTabScreenshot() {
  setStatus("capturing active tab screenshot…")
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" })
  // Show what we captured.
  const img = $("shot")
  img.src = dataUrl
  img.style.display = "block"
  $("canvas").style.display = "none"
  return classify(dataUrl)
}

// ---- Wire UI ---------------------------------------------------------------
function runSynthetic(kind = "ad") {
  $("canvas").style.display = "block"
  $("shot").style.display = "none"
  const dataUrl =
    kind === "plain"
      ? drawPlainArticle($("canvas"))
      : drawSyntheticAd($("canvas"))
  return classify(dataUrl)
}

$("btn-synthetic").addEventListener("click", () => {
  runSynthetic().catch((e) => {
    setStatus("ERROR: " + (e?.message || e))
    diag("ERROR", e?.stack || e?.message || String(e))
  })
})

$("btn-screenshot").addEventListener("click", () => {
  classifyActiveTabScreenshot().catch((e) => {
    setStatus("ERROR: " + (e?.message || e))
    diag("ERROR", e?.stack || e?.message || String(e))
  })
})

// ---- Auto-run the synthetic path (so automated verify needs no interaction).
// ?synthetic=0 disables; ?image=plain runs the non-ad control image instead.
const params = new URLSearchParams(location.search)
if (params.get("synthetic") !== "0") {
  const kind = params.get("image") === "plain" ? "plain" : "ad"
  diag("BOOT", "auto-running synthetic classification: " + kind)
  runSynthetic(kind).catch((e) => {
    setStatus("ERROR: " + (e?.message || e))
    diag("ERROR", e?.stack || e?.message || String(e))
  })
}
