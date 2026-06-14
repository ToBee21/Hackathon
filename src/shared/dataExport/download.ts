// src/shared/dataExport/download.ts
// DOM-only helper to save a string to a local file via a Blob + a temporary
// <a download> click. Guarded so it is a no-op in non-DOM contexts. Zero network.

/**
 * Triggers a client-side download of `text` as `filename` (application/json).
 * Creates a Blob object URL, clicks a hidden <a download>, then revokes the URL.
 * Safe no-op when there is no DOM (e.g. unit tests, service worker).
 */
export function downloadJson(filename: string, text: string): void {
  try {
    if (
      typeof document === "undefined" ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function" ||
      typeof Blob === "undefined"
    ) {
      return
    }

    const blob = new Blob([text], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.style.display = "none"
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    // Saving is best-effort; never throw into the caller's UI flow.
  }
}
