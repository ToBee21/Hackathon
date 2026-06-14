// src/shared/dataExport/collectExport.ts
// Gathers everything the extension knows LOCALLY about the user and builds the
// redacted export bundle. All chrome.* and navigator access is guarded so this
// never throws in a non-extension / non-browser context (e.g. unit tests, SSR).
//
// The browser block (userAgent / language / platform) is intentionally KEPT —
// it IS the user's own data. Secrets are redacted inside buildDataExport.

import {
  buildDataExport,
  type DataExportBundle
} from "./buildExport"
import { getDataFootprint } from "../dataFootprint/dataFootprintState"

export interface CollectDataExportOptions {
  /** Result of collectShadowProfile() — caller passes it so we never touch real navigator/canvas here. */
  shadowAudit?: unknown
  /** Override clock (ms epoch). Defaults to Date.now(). */
  now?: number
  /** Extension version string. */
  appVersion?: string
}

/** Reads ALL keys from chrome.storage.local; returns {} when unavailable. */
async function readAllStorage(): Promise<Record<string, unknown>> {
  try {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local
    ) {
      return {}
    }
    const all = await chrome.storage.local.get(null)
    return all && typeof all === "object" ? (all as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** A small, safe block of the user's OWN browser data. Guarded for non-DOM contexts. */
function readBrowserBlock(): Record<string, unknown> | undefined {
  try {
    if (typeof navigator === "undefined") return undefined
    const block: Record<string, unknown> = {}
    if (typeof navigator.userAgent === "string") block.userAgent = navigator.userAgent
    if (typeof navigator.language === "string") block.language = navigator.language
    if (typeof navigator.platform === "string") block.platform = navigator.platform
    return Object.keys(block).length > 0 ? block : undefined
  } catch {
    return undefined
  }
}

/** Reads the session data-footprint summary; tolerant of a missing/throwing state module. */
function readDataFootprint(): unknown {
  try {
    return getDataFootprint()
  } catch {
    return undefined
  }
}

/**
 * Collects the full local export bundle. Pure orchestration over guarded reads;
 * the assembly + redaction happens in buildDataExport.
 */
export async function collectDataExport(
  opts: CollectDataExportOptions = {}
): Promise<DataExportBundle> {
  const storage = await readAllStorage()
  const browser = readBrowserBlock()
  const dataFootprint = readDataFootprint()

  return buildDataExport({
    storage,
    shadowAudit: opts.shadowAudit,
    dataFootprint,
    browser,
    now: opts.now ?? Date.now(),
    appVersion: opts.appVersion ?? "0.0.0"
  })
}
