import { describe, expect, it, vi } from "vitest"

import {
  silently,
  NotebookToolError,
} from "../../../utils/notebooks/notebookToolError"

// The other half of the throw boundary — the agent route staying throwing — is
// pinned in notebookAIBridge.test.ts (last_cell / unknown_cell reject). Here we
// pin the UI half: the same typed error must become a silent no-op.
describe("silently — the UI throw boundary", () => {
  it("swallows a NotebookToolError so a guarded invalid op is a no-op", () => {
    // Given a transition raising the typed error for an already-guarded state
    const run = vi.fn(() => {
      throw new NotebookToolError("last_cell", "only cell")
    })
    // When the UI route runs it through silently
    const result = silently(run)
    // Then the click handler sees a no-op, not a crash
    expect(result).toBeUndefined()
    expect(run).toHaveBeenCalledOnce()
  })

  it("re-raises any non-NotebookToolError untouched", () => {
    // Given an unexpected failure — a real bug, not a guarded invalid state
    const bug = new TypeError("boom")
    // When it flows through the boundary
    // Then it must surface rather than hide behind the no-op
    expect(() =>
      silently(() => {
        throw bug
      }),
    ).toThrow(bug)
  })

  it("returns the transition result verbatim on success", () => {
    // Given a transition that succeeds (e.g. addCell returning the new id)
    // When run through silently
    // Then the value passes through unchanged
    expect(silently(() => "new-cell-id")).toBe("new-cell-id")
  })
})
