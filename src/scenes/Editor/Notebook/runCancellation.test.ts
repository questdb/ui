import { describe, expect, it } from "vitest"
import {
  SUPERSEDED_RUN_NOTE,
  midRunCancellationNote,
  runCancelReasonOf,
  runCancellationOf,
} from "./runCancellation"

describe("runCancelReasonOf", () => {
  it("accepts a reason a transition named", () => {
    expect(runCancelReasonOf("superseded")).toBe("superseded")
    expect(runCancelReasonOf("cell_deleted")).toBe("cell_deleted")
  })

  it("rejects a foreign string and a non-string abort reason", () => {
    expect(runCancelReasonOf("user")).toBeUndefined()
    expect(runCancelReasonOf(new Error("aborted"))).toBeUndefined()
    expect(runCancelReasonOf(undefined)).toBeUndefined()
  })
})

describe("runCancellationOf", () => {
  it("reads the named reason off the aborted signal", () => {
    // Given a run aborted because a newer run started
    const controller = new AbortController()
    controller.abort("superseded")

    // When the shell reports the cancellation
    const cancellation = runCancellationOf(controller.signal)

    // Then the agent gets the superseded note, not the generic one
    expect(cancellation).toBe("superseded")
    expect(midRunCancellationNote(cancellation)).toBe(SUPERSEDED_RUN_NOTE)
  })

  it("falls back to a plain cancellation for an abort without a known reason", () => {
    // Given a signal aborted with the DOM default reason
    const controller = new AbortController()
    controller.abort()

    // When the shell reports the cancellation
    // Then it is a plain cancellation
    expect(runCancellationOf(controller.signal)).toBe("cancelled")
  })
})
