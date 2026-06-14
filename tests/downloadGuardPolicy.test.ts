import { describe, expect, it } from "vitest"

import {
  assessDownloadRisk,
  buildDownloadGuardDnrRules,
  downloadGuardRuleIds
} from "../src/shared/downloadGuardPolicy"

describe("Download Guard policy", () => {
  it("blokuje fake OperaSetup.exe z obcej podejrzanej domeny", () => {
    const verdict = assessDownloadRisk({
      url: "https://insecthoney.xyz/?affId=2905&o=519&title=SETUP%20FILE",
      filename: "OperaSetup.exe",
      mime: "application/x-msdownload"
    })

    expect(verdict.block).toBe(true)
    expect(verdict.executable).toBe(true)
    expect(verdict.registrableDomain).toBe("insecthoney.xyz")
    expect(verdict.reasons).toContain("instalator podszywa się pod markę na obcej domenie")
  })

  it("nie blokuje zwykłego archiwum z neutralnej domeny", () => {
    const verdict = assessDownloadRisk({
      url: "https://example.org/releases/toolkit.zip",
      filename: "toolkit.zip",
      mime: "application/zip"
    })

    expect(verdict.block).toBe(false)
    expect(verdict.executable).toBe(false)
  })

  it("respektuje krytyczną allowlistę dla oficjalnej infrastruktury", () => {
    const verdict = assessDownloadRisk({
      url: "https://dl.google.com/chrome/install/googlechromestandaloneenterprise64.msi",
      filename: "googlechromestandaloneenterprise64.msi",
      mime: "application/x-msi"
    })

    expect(verdict.block).toBe(false)
    expect(verdict.executable).toBe(true)
    expect(verdict.registrableDomain).toBe("google.com")
  })

  it("blokuje pobranie oznaczone przez przeglądarkę jako niebezpieczne", () => {
    const verdict = assessDownloadRisk({
      url: "https://downloads.example.org/file.txt",
      filename: "file.txt",
      danger: "dangerous"
    })

    expect(verdict.block).toBe(true)
    expect(verdict.reasons[0]).toContain("przeglądarka oznaczyła")
  })

  it("instaluje twarde DNR reguły przed etapem Save As", () => {
    const rules = buildDownloadGuardDnrRules()
    const serialized = JSON.stringify(rules)

    expect(rules.map((rule) => rule.id)).toEqual(downloadGuardRuleIds())
    expect(serialized).toContain("insecthoney.xyz")
    expect(serialized).toContain("main_frame")
    expect(serialized).toContain("block")
    expect(serialized).toContain("requestDomains")
    expect(serialized).not.toContain("<all_urls>")
    expect(serialized).not.toContain("regexFilter")
  })
})
