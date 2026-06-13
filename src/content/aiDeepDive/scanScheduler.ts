export function startAiDeepDiveScanScheduler(runScan: () => void): void {
  let timer: number | undefined
  let scans = 0
  const maxScansPerPage = 24

  const schedule = (delay = 600) => {
    if (scans >= maxScansPerPage) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      scans += 1
      runWhenIdle(runScan)
    }, delay)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => schedule(250), { once: true })
  } else {
    schedule(250)
  }

  window.addEventListener("load", () => schedule(900), { once: true })

  const observer = new MutationObserver(() => schedule(1800))
  const startObserver = () => {
    if (!document.body) return
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })
  }

  if (document.body) startObserver()
  else document.addEventListener("DOMContentLoaded", startObserver, { once: true })
}

function runWhenIdle(callback: () => void): void {
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
    }
  ).requestIdleCallback

  if (idle) {
    idle(callback, { timeout: 1200 })
    return
  }

  window.setTimeout(callback, 0)
}
