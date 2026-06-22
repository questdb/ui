import { describe, it, expect, beforeEach } from "vitest"
import {
  requestCellReveal,
  getPendingReveal,
  consumeReveal,
  clearPendingReveal,
} from "./cellReveal"

const input = (overrides: Record<string, unknown> = {}) => ({
  bufferId: 1,
  cellId: "cell-1",
  range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
  notebookField: "cell" as const,
  cellType: "sql" as const,
  ...overrides,
})

describe("cellReveal store", () => {
  beforeEach(() => clearPendingReveal())

  it("returns null when nothing is pending", () => {
    // Given no request
    // Then there is nothing pending
    expect(getPendingReveal()).toBeNull()
  })

  it("returns the parked request regardless of how long it waits", () => {
    // Given a reveal request (no wall-clock expiry — a slow cold mount must still drain it)
    requestCellReveal(input({ cellId: "c-live" }))

    // Then it stays pending until consumed or superseded
    expect(getPendingReveal()?.cellId).toBe("c-live")
  })

  it("supersedes an older request and issues a strictly greater token", () => {
    // Given two successive requests
    const first = requestCellReveal(input({ cellId: "old" }))
    const second = requestCellReveal(input({ cellId: "new" }))

    // Then the latest wins with a higher token
    expect(second).toBeGreaterThan(first)
    expect(getPendingReveal()?.cellId).toBe("new")
  })

  it("ignores consumeReveal for a superseded token", () => {
    // Given a request that was superseded by a newer one
    const stale = requestCellReveal(input({ cellId: "old" }))
    requestCellReveal(input({ cellId: "new" }))

    // When the stale token tries to consume
    consumeReveal(stale)

    // Then the newer request is left intact
    expect(getPendingReveal()?.cellId).toBe("new")
  })

  it("clears the pending request when the matching token consumes it", () => {
    // Given the current request
    const token = requestCellReveal(input())

    // When consumed with its own token
    consumeReveal(token)

    // Then nothing is pending
    expect(getPendingReveal()).toBeNull()
  })
})
