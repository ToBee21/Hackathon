export function startAiDeepDiveScanScheduler(runScan: () => void): void {
  let timer: number | undefined
  let scans = 0
  // Mniej skanów na stronę: pierwszy daje wynik, kolejne łapią doładowaną treść.
  // Po wyczerpaniu limitu odłączamy obserwatora, by nic nie mieliło w tle.
  const maxScansPerPage = 6
  let observer: MutationObserver | undefined

  const stopObserving = () => {
    observer?.disconnect()
    observer = undefined
  }

  const schedule = (delay = 400) => {
    if (scans >= maxScansPerPage) {
      stopObserving()
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      scans += 1
      if (scans >= maxScansPerPage) stopObserving()
      runWhenIdle(runScan)
    }, delay)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => schedule(120), { once: true })
  } else {
    schedule(120)
  }

  window.addEventListener("load", () => schedule(450), { once: true })

  observer = new MutationObserver((mutations) => {
    // Re-skanuj tylko gdy REALNIE doszła nowa treść (nowe węzły). Bez tego —
    // przy samych zmianach atrybutów/tekstu (SPA, czaty, liczniki, animacje) —
    // skan odpalałby się bez końca i dławił stronę. Długi debounce dodatkowo
    // skleja serie zmian w jeden skan.
    let addedNodes = 0
    for (const mutation of mutations) addedNodes += mutation.addedNodes.length
    if (addedNodes > 0) schedule(2500)
  })

  const startObserver = () => {
    if (!document.body || !observer) return
    observer.observe(document.body, { childList: true, subtree: true })
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
    idle(callback, { timeout: 500 })
    return
  }

  window.setTimeout(callback, 0)
}
