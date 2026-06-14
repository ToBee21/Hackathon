import { describe, expect, it } from "vitest"

import { readRepoFile } from "./helpers"

describe("page DOM / main-world leakage security gate", () => {
  it("does not use wildcard postMessage for the content/main-world bridge", () => {
    const source = readRepoFile("src/content.ts")
    const mainWorld = readRepoFile("src/contents/bionic-blur-main.ts")

    expect(source).toContain("window.postMessage(")
    expect(source).toContain("sameWindowTargetOrigin()")
    expect(source).toContain("derivePageScopedSeed")
    expect(source).not.toMatch(/window\.postMessage\([\s\S]*?,\s*["']\*["']/)
    expect(mainWorld).not.toMatch(/window\.postMessage\([\s\S]*?,\s*["']\*["']/)
  })

  it("keeps the floating window honest: open shadow root is UI, not a secrecy boundary", () => {
    const source = readRepoFile("src/content/floatingWindow.ts")

    expect(source).toContain("NOT a confidentiality boundary")
    expect(source).toContain('attachShadow({ mode: "open" })')
  })

  it("rejects synthetic page-driven clicks for privileged page-visible actions", () => {
    const floating = readRepoFile("src/content/floatingWindow.ts")
    const linkGuard = readRepoFile("src/content/linkGuard.ts")
    const content = readRepoFile("src/content.ts")

    expect(floating).toContain("function isTrustedActivation(event: Event): boolean")
    expect(floating).toContain("function isInteractiveDragTarget(target: EventTarget | null): boolean")
    expect(floating).toContain("event.stopPropagation()")
    expect(floating).toContain("if (!isTrustedActivation(event)) return")
    expect(floating).toContain("if (!isTrustedActivation(e)) return")
    expect(linkGuard).toContain("function isTrustedActivation(event: Event): boolean")
    expect(linkGuard).toContain("if (!isTrustedActivation(e))")
    expect(linkGuard).toContain("if (!isTrustedActivation(event)) return")
    expect(content).toContain("if (!e.isTrusted) return")
  })
})
