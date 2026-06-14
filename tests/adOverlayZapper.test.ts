import { afterEach, describe, expect, it, vi } from "vitest"

import {
  resetAdOverlayZapperForTest,
  zapAdOverlays
} from "../src/content/adOverlayZapper"

class FakeElement {
  attrs: Record<string, string> = {}
  style = {
    setProperty: vi.fn((key: string, value: string) => {
      ;(this.style as Record<string, unknown>)[key] = value
    })
  }
  innerHTML = ""
  textContent = ""
  innerText = ""
  rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  children: FakeElement[] = []

  constructor(public selectorCount: Record<string, number> = {}) {}
  hasAttribute(name: string) { return name in this.attrs }
  setAttribute(name: string, value: string) { this.attrs[name] = value }
  closest(selector: string) { return selector === "[data-cloak-dagger]" ? null : null }
  getBoundingClientRect() { return this.rect }
  querySelectorAll(selector: string) {
    const count = this.selectorCount[selector] ?? 0
    return Array.from({ length: count }, () => new FakeElement())
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

function installDom(nodes: FakeElement[]) {
  vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 800 })
  vi.stubGlobal("document", {
    body: {
      querySelectorAll: () => nodes
    }
  })
  vi.stubGlobal("getComputedStyle", () => ({
    position: "fixed",
    zIndex: "2147483647",
    display: "block",
    visibility: "visible",
    opacity: "1"
  }))
}

afterEach(() => {
  resetAdOverlayZapperForTest()
  vi.unstubAllGlobals()
})

describe("ad overlay zapper", () => {
  it("ukrywa duży modal reklamowy podobny do screena z cineb", () => {
    const overlay = new FakeElement({
      "img, picture, video, iframe": 3,
      "button, [role='button'], a": 4,
      "button,a,[role='button'],[aria-label],.close,.modal-close": 1
    })
    overlay.rect = { left: 300, top: 180, right: 900, bottom: 620, width: 600, height: 440 }
    overlay.innerText = "Amber Linda Karen"
    overlay.innerHTML = '<button aria-label="close">×</button><img><img><img>'
    installDom([overlay])

    expect(zapAdOverlays()).toBe(1)
    expect(overlay.attrs["data-cnd-ad-overlay-zapped"]).toBe("1")
    expect((overlay.style as Record<string, unknown>).display).toBe("none")
  })

  it("nie rusza login/consent dialogu", () => {
    const dialog = new FakeElement({
      "button,a,[role='button'],[aria-label],.close,.modal-close": 1
    })
    dialog.rect = { left: 300, top: 180, right: 900, bottom: 620, width: 600, height: 440 }
    dialog.innerText = "Sign in password privacy consent"
    dialog.innerHTML = '<button aria-label="close">×</button><input type="password">'
    dialog.querySelectorAll = (selector: string) =>
      selector === "input, textarea, select" ? [new FakeElement()] : []
    installDom([dialog])

    expect(zapAdOverlays()).toBe(0)
    expect(dialog.attrs["data-cnd-ad-overlay-zapped"]).toBeUndefined()
  })
})
