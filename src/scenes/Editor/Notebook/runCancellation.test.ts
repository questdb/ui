import { describe, expect, it } from "vitest"
import {
  SUPERSEDED_RUN_NOTE,
  midRunCancellationNote,
  runCancelReasonOf,
  runCancellationOf,
} from "./runCancellation"

describe("runCancelReasonOf", () => {
  it("accepts a reason a transition named", () => {
    // Given abort reasons a transition passed to the run's controller
    const reasons = ["superseded", "cell_deleted"]

    // When each one is read back
    const read = reasons.map(runCancelReasonOf)

    // Then each comes back as the named reason
    expect(read).toEqual(reasons)
  })

  it("rejects a foreign string and a non-string abort reason", () => {
    // Given reasons no transition names: a user string, an Error, and none
    const foreign = ["user", new Error("aborted"), undefined]

    // When each one is read back
    const read = foreign.map(runCancelReasonOf)

    // Then none is a run cancel reason
    expect(read).toEqual([undefined, undefined, undefined])
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
    const cancellation = runCancellationOf(controller.signal)

    // Then it is a plain cancellation
    expect(cancellation).toBe("cancelled")
  })
})
