import { describe, it, expect } from "vitest"
import { isMaxColumnWidthDraftValid, parseMaxColumnWidth } from "./utils"

describe("parseMaxColumnWidth", () => {
  it("parses a stored number", () => {
    expect(parseMaxColumnWidth("550")).toBe(550)
  })

  it("falls back to auto for a missing value", () => {
    expect(parseMaxColumnWidth("")).toBe("auto")
  })

  it("falls back to auto for the stored auto keyword", () => {
    expect(parseMaxColumnWidth("auto")).toBe("auto")
  })

  it("falls back to auto for garbage", () => {
    expect(parseMaxColumnWidth("wide")).toBe("auto")
  })

  it("clamps values below the minimum", () => {
    expect(parseMaxColumnWidth("10")).toBe(60)
  })

  it("clamps values above the maximum", () => {
    expect(parseMaxColumnWidth("99999")).toBe(4000)
  })
})

describe("isMaxColumnWidthDraftValid", () => {
  it("accepts an empty draft as auto", () => {
    expect(isMaxColumnWidthDraftValid("")).toBe(true)
  })

  it("accepts a whole number within the bounds", () => {
    expect(isMaxColumnWidthDraftValid("250")).toBe(true)
  })

  it("rejects numbers outside the bounds", () => {
    expect(isMaxColumnWidthDraftValid("10")).toBe(false)
    expect(isMaxColumnWidthDraftValid("99999")).toBe(false)
  })

  it("rejects locale-formatted and decimal numbers", () => {
    expect(isMaxColumnWidthDraftValid("1,500")).toBe(false)
    expect(isMaxColumnWidthDraftValid("1.500")).toBe(false)
    expect(isMaxColumnWidthDraftValid("250.5")).toBe(false)
  })

  it("rejects non-numeric input", () => {
    expect(isMaxColumnWidthDraftValid("wide")).toBe(false)
    expect(isMaxColumnWidthDraftValid("-250")).toBe(false)
    expect(isMaxColumnWidthDraftValid("1e3")).toBe(false)
  })
})
