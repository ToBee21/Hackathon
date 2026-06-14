import { beforeEach, describe, expect, it } from "vitest"

import { dataFootprintFeature } from "../src/shared/features/dataFootprintFeature"
import {
  resetDataFootprint,
  setDataFootprint
} from "../src/shared/dataFootprint/dataFootprintState"
import { summarizeFields, type FormFieldMeta } from "../src/shared/dataFootprint/piiFieldHeuristics"
import type { PageContext } from "../src/shared/pageContextSchema"

function field(partial: Partial<FormFieldMeta>): FormFieldMeta {
  return {
    type: "text",
    name: "",
    id: "",
    autocomplete: "",
    placeholder: "",
    label: "",
    ...partial
  }
}

const ctx = { page: { excluded: false } as unknown as PageContext, risk: {} as never }

describe("Data Footprint feature card", () => {
  beforeEach(() => resetDataFootprint())

  it("is active on ordinary pages, inactive on excluded ones", () => {
    expect(dataFootprintFeature.activation({ excluded: false } as never)).toBe(true)
    expect(dataFootprintFeature.activation({ excluded: true } as never)).toBe(false)
  })

  it("renders no card when nothing sensitive is collected", () => {
    setDataFootprint(summarizeFields([field({ name: "search" })]))
    expect(dataFootprintFeature.run(ctx)).toBeNull()
  })

  it("lists the requested data categories in Polish with a score", () => {
    setDataFootprint(
      summarizeFields([
        field({ autocomplete: "cc-number" }),
        field({ name: "pesel" }),
        field({ type: "email" })
      ])
    )
    const card = dataFootprintFeature.run(ctx)!
    expect(card.featureId).toBe("data-footprint")
    expect(card.source).toBe("heuristic")
    // payment(30) + gov_id(30) + email(10) = 70 → "high"
    expect(card.level).toBe("high")
    expect(typeof card.score).toBe("number")
    expect(card.lines[0]).toContain("dane karty płatniczej")
    expect(card.lines[0]).toContain("dokument tożsamości")
    expect(card.lines[0]).toContain("e-mail")
    expect(card.action).toContain("alias")
    expect(card.evidence && card.evidence.length).toBeGreaterThan(0)
  })

  it("uses Polish noun declension for the field count", () => {
    setDataFootprint(summarizeFields([field({ type: "email" })]))
    expect(dataFootprintFeature.run(ctx)!.lines[1]).toContain("1 wrażliwe pole")

    resetDataFootprint()
    setDataFootprint(
      summarizeFields([
        field({ type: "email" }),
        field({ type: "tel" }),
        field({ autocomplete: "street-address" })
      ])
    )
    expect(dataFootprintFeature.run(ctx)!.lines[1]).toContain("3 wrażliwe pola")
  })

  it("gives gentler advice for a low/medium footprint", () => {
    setDataFootprint(summarizeFields([field({ type: "email" }), field({ autocomplete: "given-name" })]))
    const card = dataFootprintFeature.run(ctx)!
    expect(card.level === "low" || card.level === "medium").toBe(true)
    expect(card.action).toContain("gwiazdką")
  })
})
