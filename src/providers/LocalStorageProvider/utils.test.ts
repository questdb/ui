import { describe, it, expect } from "vitest"
import {
  isMaxColumnWidthDraftValid,
  parseMaxColumnWidth,
  parseRunWithSelectionMode,
} from "./utils"

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

describe("parseRunWithSelectionMode", () => {
  it.each(["partial", "complete", "off"] as const)(
    "keeps the stored %s mode",
    (mode) => {
      expect(parseRunWithSelectionMode(mode)).toBe(mode)
    },
  )

  it("migrates the legacy boolean values", () => {
    // Given values stored by the old on/off switch
    // When parsing them
    // Then true maps to partial and false maps to off
    expect(parseRunWithSelectionMode("true")).toBe("partial")
    expect(parseRunWithSelectionMode("false")).toBe("off")
  })

  it("falls back to partial for missing or unknown values", () => {
    // Given no stored value or a corrupted one
    // When parsing them
    // Then the default partial mode applies
    expect(parseRunWithSelectionMode("")).toBe("partial")
    expect(parseRunWithSelectionMode("garbage")).toBe("partial")
  })
})
