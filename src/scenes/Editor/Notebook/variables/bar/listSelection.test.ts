import { describe, expect, it } from "vitest"
import { sameSelection, toggleOption } from "./listSelection"

const eur = { value: "'EURUSD'", label: "EURUSD" }
const gbp = { value: "'GBPUSD'", label: "GBPUSD" }

describe("toggleOption", () => {
  it("replaces All with the clicked option", () => {
    expect(toggleOption("all", eur)).toEqual([eur])
  })

  it("adds a missing option and removes a present one", () => {
    expect(toggleOption([eur], gbp)).toEqual([eur, gbp])
    expect(toggleOption([eur, gbp], eur)).toEqual([gbp])
  })
})

describe("sameSelection", () => {
  it("compares All and the selected values in order", () => {
    expect(sameSelection("all", "all")).toBe(true)
    expect(sameSelection("all", [])).toBe(false)
    expect(sameSelection([eur, gbp], [eur, gbp])).toBe(true)
    expect(sameSelection([eur, gbp], [gbp, eur])).toBe(false)
  })
})
