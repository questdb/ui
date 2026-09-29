import { describe, expect, it, vi } from "vitest"
import type { QueryExecResult } from "../../../hooks/useQueryExecution"
import type { CellResult, SingleQueryResult } from "../../../store/notebook"
import {
  MAX_ACTIVE_STATEMENT_REQUESTS,
  statementRequestLimiter,
} from "../../../utils/questdb/requestLimiter"
import { computeResultBottomHeight } from "./cellSizing"
import {
  abortCellRunsOnUnmount,
  committedResult,
  committedResults,
  launchStatement,
} from "./useCellExecution"

const dql = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
})

const frame = (results: SingleQueryResult[]): CellResult => ({
  results,
  activeResultIndex: 0,
  timestamp: 0,
})

describe("abortCellRunsOnUnmount", () => {
  it("aborts validation and request phases before clearing their registries", () => {
    // Given a cell with a validation barrier, an in-flight request and a generation
    const validation = new AbortController()
    const request = new AbortController()
    const barriers = new Map([["cell", new Set([validation])]])
    const requests = new Map([["cell", [request]]])
    const generations = new Map([["cell", 4]])

    // When the hook tears down
    abortCellRunsOnUnmount(barriers, requests, generations)

    // Then both phases are aborted, the registries are empty and the generation advanced
    expect(validation.signal.aborted).toBe(true)
    expect(request.signal.aborted).toBe(true)
    expect(barriers.size).toBe(0)
    expect(requests.size).toBe(0)
    expect(generations.get("cell")).toBe(5)
  })

  it("supersedes a validation-only cell so it cannot launch after teardown", () => {
    // Given a cell that is still validating and has no generation yet
    const validation = new AbortController()
    const barriers = new Map([["validating", new Set([validation])]])
    const generations = new Map<string, number>()

    // When the hook tears down
    abortCellRunsOnUnmount(barriers, new Map(), generations)

    // Then the validation aborts and the cell gains a newer generation
    expect(validation.signal.aborted).toBe(true)
    expect(generations.get("validating")).toBe(1)
  })
})

describe("launchStatement", () => {
  it("reports a statement aborted while queued as not launched", async () => {
    // Given the limiter is saturated by requests that never settle
    const holds = Array.from({ length: MAX_ACTIVE_STATEMENT_REQUESTS }, () => {
      let release: () => void = () => {}
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      return { promise, release }
    })
    const occupied = holds.map((hold) =>
      statementRequestLimiter(() => hold.promise),
    )
    const execute = vi.fn<[], Promise<QueryExecResult>>()
    const ac = new AbortController()

    // When a queued statement's signal aborts before a slot frees up
    const launch = launchStatement(execute, ac.signal, "select 1")
    ac.abort()

    // Then it never executed, so it is not launched
    await expect(launch).resolves.toEqual({ launched: false })
    expect(execute).not.toHaveBeenCalled()
    holds.forEach((hold) => hold.release())
    await Promise.all(occupied)
  })

  it("keeps the unverifiable cancelled error for a statement aborted after launch", async () => {
    // Given a statement whose request rejects once its signal aborts
    const ac = new AbortController()
    const execute = vi.fn(
      () =>
        new Promise<QueryExecResult>((_, reject) => {
          ac.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          )
        }),
    )

    // When the abort lands mid-flight
    const launch = launchStatement(execute, ac.signal, "select 1")
    await vi.waitFor(() => expect(execute).toHaveBeenCalled())
    ac.abort()

    // Then the outcome is launched, carrying the error that marks it unverified
    await expect(launch).resolves.toMatchObject({
      launched: true,
      exec: { type: "error", error: "Cancelled by user" },
    })
  })
})

describe("committedResult — a script run landing under edited text", () => {
  it("keeps the frame as it ran when the value did not change", () => {
    // Given a run whose text the editor still holds
    const result = frame([dql("select 1"), dql("select 2")])

    // When it commits
    const committed = committedResult(
      result,
      "select 1;\nselect 2",
      "select 1;\nselect 2",
    )

    // Then the frame is the same object
    expect(committed).toBe(result)
  })

  it("gives survivors the editor's text after a case-only edit during the run", () => {
    // Given a run that landed under the old casing while the editor re-cased it
    const result = frame([dql("select 1"), dql("select 2")])

    // When it commits
    const committed = committedResult(
      result,
      "SELECT 1;\nselect 2",
      "select 1;\nselect 2",
    )

    // Then the snapshot and sizing read the SQL as the editor holds it
    expect(committed.results.map((r) => r.query)).toEqual([
      "SELECT 1",
      "select 2",
    ])
  })

  it("drops the result of a statement deleted during the run, so sizing reserves no orphan grid", () => {
    // Given a SELECT that ran, then was deleted while the INSERT still ran
    const insert: SingleQueryResult = {
      type: "dml",
      query: "insert into t select 1",
    }
    const result = frame([dql("select 1"), insert])

    // When it commits
    const committed = committedResult(
      result,
      "insert into t select 1",
      "select 1;\ninsert into t select 1",
    )

    // Then only the INSERT stays, and the pane sizes to one notification (44)
    expect(committed.results).toEqual([insert])
    expect(computeResultBottomHeight(committed, "insert into t select 1")).toBe(
      44,
    )
  })

  it("keeps a frame no statement claims as it ran", () => {
    // Given a run whose only statement was rewritten while it ran
    const result = frame([dql("select 1")])

    // When it commits
    const committed = committedResult(result, "select 2", "select 1")

    // Then the frame stays as it ran
    expect(committed).toBe(result)
  })
})

describe("committedResults — a fragment run landing under edited text", () => {
  it("keeps the fragment as it ran when the value did not change", () => {
    // Given a cursor run whose text the editor still holds
    const results = [dql("select 2")]

    // When it commits
    const committed = committedResults(
      results,
      "select 1;\nselect 2",
      "select 1;\nselect 2",
    )

    // Then the results are the same array
    expect(committed).toBe(results)
  })

  it("gives the fragment its statement's current text, so the pane reserves the tab bar", () => {
    // Given a cursor run of the second statement that landed while the editor re-cased it
    const [recorded] = committedResults(
      [dql("select 2")],
      "select 1;\nSELECT 2",
      "select 1;\nselect 2",
    )

    // When the committed frame is sized under the editor's text
    const height = computeResultBottomHeight(
      frame([recorded]),
      "select 1;\nSELECT 2",
    )

    // Then the result reads as the editor holds it, and both statements get
    // a tab: 40 tab + 44 notification + 36 actions + 44 header + 1 row = 194,
    // not the 154 of a lone result
    expect(recorded.query).toBe("SELECT 2")
    expect(height).toBe(194)
  })
})
