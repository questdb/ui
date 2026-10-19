import "../../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import { formatScriptSummary } from "./formatScriptSummary"

const base = {
  successful: 0,
  failed: 0,
  total: 3,
  duration: 2_000_000,
}

describe("script summary", () => {
  it("formats successful and failed counts with correct grammar", () => {
    expect(formatScriptSummary({ ...base, successful: 2, failed: 1 })).toBe(
      "Running completed in 2ms with 2 successful and 1 failed queries",
    )
    expect(formatScriptSummary({ ...base, successful: 1, total: 1 })).toBe(
      "Running completed in 2ms with 1 successful query",
    )
    expect(formatScriptSummary({ ...base, failed: 1 })).toBe(
      "Stopped after running 1 failed query",
    )
  })

  it("formats a script stopped before completing a statement", () => {
    expect(formatScriptSummary(base)).toBe("Stopped after running 0 queries")
  })
})
