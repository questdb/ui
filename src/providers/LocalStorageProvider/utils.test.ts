import { describe, it, expect } from "vitest"
import { parseRunWithSelectionMode } from "./utils"

describe("parseRunWithSelectionMode", () => {
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
