import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { readRepoFile, REPO_ROOT } from "./helpers"

describe("security proof surface", () => {
  it("locks the public privacy/security claim surface to the README", () => {
    const readme = readRepoFile("readme.md")

    expect(readme).toMatch(/suwerenności danych/i)
    expect(readme).toMatch(/klucz wyłącznie w pamięci sesji/i)
    expect(readme).toMatch(/panic button/i)
    expect(readme).toMatch(/simplelogin/i)
    expect(readme).toMatch(/privacy score|wynik prywatności/i)
    expect(readme).toMatch(/DataGhost/i)
  })

  it("also preserves the README's own honesty clauses so the audit can classify them", () => {
    const readme = readRepoFile("readme.md")

    expect(readme).toMatch(/obfuskacj|obfuscation/i)
    expect(readme).toMatch(/nie eliminuje|does not eliminate/i)
    expect(readme).toMatch(/chroni dane w spoczynku|data at rest/i)
  })

  it("keeps exactly nine hostile privacy fixtures with threat-model metadata", () => {
    const fixtureRoot = path.join(REPO_ROOT, "tests", "fixtures", "privacy-hostile")
    const fixtureFiles = fs
      .readdirSync(fixtureRoot)
      .filter((name) => !name.startsWith("."))
      .sort()

    expect(fixtureFiles).toHaveLength(9)

    for (const file of fixtureFiles) {
      const fixture = fs.readFileSync(path.join(fixtureRoot, file), "utf8")
      expect(fixture).toContain("Customer fear:")
      expect(fixture).toContain("Data that could leak:")
      expect(fixture).toContain("Attacker control:")
      expect(fixture).toContain("Promise at risk:")
      expect(fixture).toContain("Protection proof:")
    }
  })
})
