import "../../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import { formatScriptSummary } from "./formatScriptSummary"

const base = {
  successful: 0,
  failed: 0,
  total: 3,
  duration: 2_000_000,
  sessionEnded: false,
  outcomeUnknown: false,
}

describe("script summary", () => {
  it("identifies an unconfirmed sent statement, even without completed statements", () => {
    const summary = formatScriptSummary({
      ...base,
      sessionEnded: true,
      outcomeUnknown: true,
    })
    expect(summary).toContain("Stopped after running 0 queries")
    expect(summary).toContain("outcome is unknown; verify before running again")
    expect(summary).not.toContain("No statements were sent")
  })
  it("says no statements were sent only for an empty, definitely-unsent run", () => {
    expect(formatScriptSummary({ ...base, sessionEnded: true })).toContain(
      "No statements were sent",
    )
  })
  it("preserves confirmed prefix history when the session ends", () => {
    const summary = formatScriptSummary({
      ...base,
      successful: 1,
      sessionEnded: true,
    })
    expect(summary).toContain(
      "1 successful query; session ended. No further statements were sent",
    )
    expect(summary).not.toContain("Running completed")
  })
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
})
