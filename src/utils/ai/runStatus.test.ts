import { describe, it, expect } from "vitest"
import {
  getCellRunStatus,
  deriveRunStatusFromResults,
  createRunStatus,
} from "./runStatus"

describe("deriveRunStatus", () => {
  it("returns none for empty/missing results", () => {
    expect(deriveRunStatusFromResults(undefined)).toEqual({ status: "none" })
    expect(deriveRunStatusFromResults(null)).toEqual({ status: "none" })
    expect(deriveRunStatusFromResults([])).toEqual({ status: "none" })
  })

  // A single-statement write that the user cancels mid-run leaves only a
  // cancelled entry, but the abort does NOT roll the write back server-side.
  // Reporting "none" (never run) would invite an agent re-run → duplicate write.
  it("reports cancelled (not none) for a single cancelled statement", () => {
    expect(deriveRunStatusFromResults([{ type: "cancelled" }])).toEqual({
      status: "cancelled",
    })
  })

  it("returns success for a single committed statement", () => {
    expect(deriveRunStatusFromResults([{ type: "dml" }])).toEqual({
      status: "success",
    })
    expect(deriveRunStatusFromResults([{ type: "dql" }])).toEqual({
      status: "success",
    })
    expect(deriveRunStatusFromResults([{ type: "ddl" }])).toEqual({
      status: "success",
    })
  })

  it("returns running while any statement is running/queued", () => {
    expect(deriveRunStatusFromResults([{ type: "running" }])).toEqual({
      status: "running",
    })
    expect(
      deriveRunStatusFromResults([{ type: "dml" }, { type: "running" }]),
    ).toEqual({
      status: "running",
    })
    expect(
      deriveRunStatusFromResults([{ type: "dml" }, { type: "queued" }]),
    ).toEqual({
      status: "running",
    })
  })

  it("surfaces the first error with its message", () => {
    expect(
      deriveRunStatusFromResults([{ type: "error", error: "boom" }]),
    ).toEqual({
      status: "error",
      error: "boom",
    })
  })

  // A committed write followed by a trailing cancelled entry (user Stop on a
  // multi-statement script) must NOT collapse to "none"; the run was interrupted,
  // so "cancelled" is the truthful status (cancelled outranks committed).
  it("reports cancelled for a committed write with a trailing cancelled (user Stop)", () => {
    expect(
      deriveRunStatusFromResults([{ type: "dml" }, { type: "cancelled" }]),
    ).toEqual({
      status: "cancelled",
    })
    expect(
      deriveRunStatusFromResults([{ type: "ddl" }, { type: "cancelled" }]),
    ).toEqual({
      status: "cancelled",
    })
  })

  it("reports error (not none) for a mid-script error with auto-cancelled tail", () => {
    expect(
      deriveRunStatusFromResults([
        { type: "dml" },
        { type: "error", error: "syntax" },
        { type: "cancelled" },
      ]),
    ).toEqual({ status: "error", error: "syntax" })
  })

  it("takes the first error message when multiple errors exist", () => {
    expect(
      deriveRunStatusFromResults([
        { type: "error", error: "first" },
        { type: "error", error: "second" },
      ]),
    ).toEqual({ status: "error", error: "first" })
  })

  it("prefers error over committed when both present and nothing running", () => {
    expect(
      deriveRunStatusFromResults([
        { type: "dml" },
        { type: "error", error: "x" },
      ]),
    ).toEqual({ status: "error", error: "x" })
  })
})

describe("ranEventStatus", () => {
  const prior = { results: [{ type: "dql" }] }

  it("reports cancelled when a fresh result ends cancelled (user Stop mid-run)", () => {
    // Multi-statement: stmt 0 committed, user cancelled stmt 1. runScript's
    // boolean is true (failedCount===0), but the truthful status is cancelled.
    const fresh = { results: [{ type: "dml" }, { type: "cancelled" }] }
    expect(createRunStatus(prior, fresh, true)).toBe("cancelled")
  })

  it("reports cancelled for a single cancelled statement even when ok=false", () => {
    const fresh = { results: [{ type: "cancelled" }] }
    expect(createRunStatus(prior, fresh, false)).toBe("cancelled")
  })

  it("reports success/error from the fresh result, ignoring the boolean", () => {
    expect(createRunStatus(prior, { results: [{ type: "dml" }] }, false)).toBe(
      "success",
    )
    expect(createRunStatus(prior, { results: [{ type: "error" }] }, true)).toBe(
      "error",
    )
  })

  it("falls back to the boolean for a no-op run (result unchanged)", () => {
    // Empty cell run: runCell returns false without producing a new result.
    expect(createRunStatus(prior, prior, false)).toBe("error")
    expect(createRunStatus(null, null, true)).toBe("success")
  })
})

describe("cellRunStatus", () => {
  it("prefers the live result when present", () => {
    expect(
      getCellRunStatus({ result: { results: [{ type: "dml" }] } }),
    ).toEqual({
      status: "success",
    })
  })

  // An unmounted notebook has its result stripped; the persisted enum must keep
  // a committed write from reading back as "none" (which would invite a re-run).
  it("falls back to the persisted lastRunStatus when result is stripped", () => {
    expect(
      getCellRunStatus({ result: undefined, lastRunStatus: "success" }),
    ).toEqual({ status: "success" })
    expect(getCellRunStatus({ result: null, lastRunStatus: "error" })).toEqual({
      status: "error",
    })
  })

  it("returns none when neither a result nor a persisted status exists", () => {
    expect(getCellRunStatus({})).toEqual({ status: "none" })
    expect(getCellRunStatus(undefined)).toEqual({ status: "none" })
  })

  it("prefers the live result over a stale persisted status", () => {
    expect(
      getCellRunStatus({
        result: { results: [{ type: "error", error: "x" }] },
        lastRunStatus: "success",
      }),
    ).toEqual({ status: "error", error: "x" })
  })
})
