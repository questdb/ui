import { describe, expect, it } from "vitest"
import { withAlpha } from "./index"

describe("withAlpha", () => {
  it.each([
    ["#123456", 0.5, "#12345680"],
    ["#123456cc", 0.25, "#12345640"],
    ["#abc", 0.5, "#aabbcc80"],
    ["#abcd", 0.5, "#aabbcc80"],
  ])("applies alpha to %s", (value, alpha, expected) => {
    expect(withAlpha(value, alpha)).toBe(expected)
  })

  it.each([
    ["rgb(12, 34, 56)", "rgba(12, 34, 56, 0.5)"],
    ["rgba(12, 34, 56, 0.2)", "rgba(12, 34, 56, 0.5)"],
    ["rgb(12.5, 34.25, 56)", "rgba(12.5, 34.25, 56, 0.5)"],
    ["rgb(12 34 56)", "rgba(12, 34, 56, 0.5)"],
    ["rgb(12 34 56 / 25%)", "rgba(12, 34, 56, 0.5)"],
    ["rgba(10% 20% 30% / .2)", "rgba(10%, 20%, 30%, 0.5)"],
  ])("replaces alpha in %s", (value, expected) => {
    expect(withAlpha(value, 0.5)).toBe(expected)
  })

  it("clamps alpha to the CSS range", () => {
    expect(withAlpha("#123456", 2)).toBe("#123456ff")
    expect(withAlpha("#123456", -1)).toBe("#12345600")
  })

  it("preserves intentional non-color passthrough values", () => {
    expect(withAlpha("transparent", 0.5)).toBe("transparent")
  })
})
