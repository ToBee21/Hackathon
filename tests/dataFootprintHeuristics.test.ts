import { describe, expect, it } from "vitest"

import {
  classifyField,
  emptyDataFootprint,
  summarizeFields,
  type FormFieldMeta
} from "../src/shared/dataFootprint/piiFieldHeuristics"

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

describe("classifyField", () => {
  it("uses the autocomplete token first (strongest signal)", () => {
    expect(classifyField(field({ autocomplete: "email" }))).toBe("email")
    expect(classifyField(field({ autocomplete: "section-ship shipping tel" }))).toBe("phone")
    expect(classifyField(field({ autocomplete: "cc-number" }))).toBe("payment")
    expect(classifyField(field({ autocomplete: "postal-code" }))).toBe("postal")
    expect(classifyField(field({ autocomplete: "bday" }))).toBe("dob")
    expect(classifyField(field({ autocomplete: "new-password" }))).toBe("password")
  })

  it("falls back to the input type when unambiguous", () => {
    expect(classifyField(field({ type: "email" }))).toBe("email")
    expect(classifyField(field({ type: "tel" }))).toBe("phone")
    expect(classifyField(field({ type: "password" }))).toBe("password")
  })

  it("matches PL + EN keywords on name/id/placeholder/label", () => {
    expect(classifyField(field({ name: "card_number" }))).toBe("payment")
    expect(classifyField(field({ name: "cvv" }))).toBe("payment")
    expect(classifyField(field({ id: "pesel" }))).toBe("gov_id")
    expect(classifyField(field({ name: "passport_no" }))).toBe("gov_id")
    expect(classifyField(field({ placeholder: "data urodzenia" }))).toBe("dob")
    expect(classifyField(field({ label: "Kod pocztowy" }))).toBe("postal")
    expect(classifyField(field({ name: "ulica" }))).toBe("postal")
    expect(classifyField(field({ placeholder: "Numer telefonu" }))).toBe("phone")
    expect(classifyField(field({ name: "e-mail" }))).toBe("email")
    expect(classifyField(field({ name: "nazwisko" }))).toBe("name")
  })

  it("returns null for non-sensitive fields", () => {
    expect(classifyField(field({ name: "search" }))).toBeNull()
    expect(classifyField(field({ name: "quantity", type: "number" }))).toBeNull()
    expect(classifyField(field({ name: "comment" }))).toBeNull()
    // a bare login username should not be flagged as a name/PII field
    expect(classifyField(field({ name: "username" }))).toBeNull()
  })
})

describe("summarizeFields", () => {
  it("returns an empty low-footprint summary for no fields", () => {
    const s = summarizeFields([])
    expect(s).toEqual(emptyDataFootprint())
    expect(s.level).toBe("low")
    expect(s.score).toBe(0)
  })

  it("keeps a newsletter (email + name) at a low footprint", () => {
    const s = summarizeFields([
      field({ type: "email", name: "email" }),
      field({ autocomplete: "given-name" })
    ])
    expect(s.categories).toEqual(["email", "name"])
    expect(s.sensitiveFieldCount).toBe(2)
    expect(s.level).toBe("low")
  })

  it("escalates to medium for contact + address collection", () => {
    const s = summarizeFields([
      field({ type: "email" }),
      field({ type: "tel" }),
      field({ autocomplete: "street-address" })
    ])
    expect(s.categories).toEqual(["postal", "phone", "email"])
    expect(s.level).toBe("medium")
  })

  it("flags payment + identity collection as high/critical, most sensitive first", () => {
    const s = summarizeFields([
      field({ autocomplete: "cc-number" }),
      field({ name: "pesel" }),
      field({ autocomplete: "bday" }),
      field({ type: "email" }),
      field({ type: "tel" })
    ])
    expect(s.categories[0]).toBe("payment")
    expect(s.categories[1]).toBe("gov_id")
    expect(s.score).toBeGreaterThanOrEqual(75)
    expect(s.level).toBe("critical")
    expect(s.sensitiveFieldCount).toBe(5)
    expect(s.totalFieldCount).toBe(5)
  })

  it("counts non-sensitive fields toward total but not the footprint", () => {
    const s = summarizeFields([
      field({ type: "email" }),
      field({ name: "search" }),
      field({ name: "quantity", type: "number" })
    ])
    expect(s.categories).toEqual(["email"])
    expect(s.sensitiveFieldCount).toBe(1)
    expect(s.totalFieldCount).toBe(3)
  })
})
