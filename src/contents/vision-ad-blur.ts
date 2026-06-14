// src/contents/vision-ad-blur.ts
//
// Content script that drives the page-side AI vision ad-image blocker.
//
// On a {type:"CND_VISION_SCAN"} message (from the extension popup / side panel /
// service worker), it runs `scanAndBlurAdImages` with a classify function that
// round-trips each candidate image through the offscreen vision handler:
//
//     content  --chrome.runtime.sendMessage({type:"CND_VISION_INFER", image})-->  SW/offscreen
//     content  <--{ ok, result:{ isAd, description } }--------------------------  SW/offscreen
//
// The PNG dataURL is the only thing that crosses the boundary, and only to the
// extension's own offscreen document — never to the network.
//
// Test hook: if `window.__CND_VISION_STUB` is present, it is used as the
// classifier instead of the runtime round-trip. This lets a Playwright/unit
// harness exercise the full scan→blur mechanic without a live offscreen handler.

import type { PlasmoCSConfig } from "plasmo"

import {
  scanAndBlurAdImages,
  type AdVerdict,
  type ScanResult
} from "../shared/vision/adImageScan"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_idle",
  all_frames: false
}

// ---- message contract (page-side) -----------------------------------------

/** Trigger sent to this content script to start a scan. */
export interface VisionScanMessage {
  type: "CND_VISION_SCAN"
  minSize?: number
  max?: number
  viewportOnly?: boolean
}

/** Request this content script sends to the SW/offscreen per candidate image. */
export interface VisionInferRequest {
  type: "CND_VISION_INFER"
  /** PNG dataURL of one candidate image. */
  image: string
}

/** Response the SW/offscreen sends back for a VisionInferRequest. */
export interface VisionInferResponse {
  ok: boolean
  result?: { isAd: boolean; description?: string }
  error?: string
}

const SCAN_MESSAGE = "CND_VISION_SCAN"
const INFER_MESSAGE = "CND_VISION_INFER"
const STUB_KEY = "__CND_VISION_STUB"

type StubClassifier = (pngDataUrl: string) => AdVerdict | Promise<AdVerdict>

declare global {
  interface Window {
    /** Test/verify hook: when set, used in place of the offscreen round-trip. */
    [STUB_KEY]?: StubClassifier
    /** Set after the listener installs, so a harness can await readiness. */
    __CND_VISION_READY?: boolean
    /** Last scan result, exposed for assertions in live verification. */
    __CND_VISION_LAST?: ScanResult
  }
}

// ---- classifier wiring -----------------------------------------------------

/**
 * Build the classify fn handed to the scanner. Prefers the injected test stub;
 * otherwise round-trips through the extension's offscreen vision handler.
 */
function makeClassifier(): (pngDataUrl: string) => Promise<AdVerdict> {
  return async (pngDataUrl: string): Promise<AdVerdict> => {
    const stub = typeof window !== "undefined" ? window[STUB_KEY] : undefined
    if (typeof stub === "function") {
      const v = await stub(pngDataUrl)
      return normalizeVerdict(v)
    }
    return classifyViaOffscreen(pngDataUrl)
  }
}

async function classifyViaOffscreen(pngDataUrl: string): Promise<AdVerdict> {
  const req: VisionInferRequest = { type: INFER_MESSAGE, image: pngDataUrl }
  let resp: VisionInferResponse | undefined
  try {
    resp = (await chrome.runtime.sendMessage(req)) as VisionInferResponse
  } catch {
    // No receiver / port closed → treat as "not an ad" so we never blur on error.
    return { isAd: false, description: "" }
  }
  if (!resp || !resp.ok || !resp.result) {
    return { isAd: false, description: "" }
  }
  return normalizeVerdict({
    isAd: !!resp.result.isAd,
    description: resp.result.description || ""
  })
}

function normalizeVerdict(v: AdVerdict | { isAd?: unknown; description?: unknown }): AdVerdict {
  return {
    isAd: !!(v && (v as AdVerdict).isAd),
    description:
      v && typeof (v as AdVerdict).description === "string"
        ? (v as AdVerdict).description
        : ""
  }
}

// ---- scan trigger ----------------------------------------------------------

let scanInFlight = false

async function runScan(msg: VisionScanMessage): Promise<ScanResult> {
  // Single-flight: a second trigger while one is running is ignored (the
  // data-attribute stamping already makes overlapping scans idempotent, but
  // serialising keeps classify() call counts predictable).
  if (scanInFlight) {
    return window.__CND_VISION_LAST || { scanned: 0, blurred: 0, skipped: 0 }
  }
  scanInFlight = true
  try {
    const result = await scanAndBlurAdImages(makeClassifier(), {
      minSize: msg.minSize,
      max: msg.max,
      viewportOnly: msg.viewportOnly
    })
    window.__CND_VISION_LAST = result
    return result
  } finally {
    scanInFlight = false
  }
}

function isScanMessage(value: unknown): value is VisionScanMessage {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === SCAN_MESSAGE
  )
}

// ---- install ---------------------------------------------------------------

function install(): void {
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) {
    return
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isScanMessage(message)) return false
    runScan(message)
      .then((result) => {
        try {
          sendResponse({ ok: true, result })
        } catch {
          /* channel already closed */
        }
      })
      .catch((error) => {
        try {
          sendResponse({ ok: false, error: String((error as Error)?.message || error) })
        } catch {
          /* ignore */
        }
      })
    // Returning true keeps the message channel open for the async sendResponse.
    return true
  })

  if (typeof window !== "undefined") window.__CND_VISION_READY = true
}

install()

// Exported so a harness can invoke the scan directly without the message round-trip.
export { runScan, makeClassifier }
