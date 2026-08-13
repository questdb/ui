import { describe, expect, it } from "vitest"
import { buildStatementSlotViews } from "./statementSlotView"
import { deriveStatementFrame, statementKeysFor } from "../notebookUtils"
import type { CellFetchState } from "../cellRefresh/cellRefreshEngine"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"

const dql = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[1]],
  count: 1,
})

const result = (queries: string[]): CellResult => ({
  results: queries.map(dql),
  activeResultIndex: 0,
  timestamp: 0,
})

const fetchState = (over: Partial<CellFetchState> = {}): CellFetchState => ({
  queries: [],
  queriesKey: "",
  fetching: false,
  settledKey: null,
  classifyBlock: null,
  classifiedKey: null,
  slotFetching: new Set(),
  slotErrors: new Map(),
  cancelledSlots: new Set(),
  slotFetchedAt: new Map(),
  ...over,
})

describe("buildStatementSlotViews", () => {
  it("attaches refresh state to slots by statement content", () => {
    // Given a two-statement frame where the second is refreshing and the
    // first failed its last round
    const statements = ["select 1", "select 2"]
    const [key1, key2] = statementKeysFor(statements)
    const frame = deriveStatementFrame(statements, result(statements))!
    const state = fetchState({
      slotFetching: new Set([key2]),
      slotErrors: new Map([[key1, "boom"]]),
      slotFetchedAt: new Map([[key1, 1234]]),
    })

    // When the slot views are built
    const slots = buildStatementSlotViews(frame, state)

    // Then each slot carries its own refresh state and freshness
    expect(slots[0]).toMatchObject({
      key: key1,
      refreshing: false,
      refreshError: "boom",
      fetchedAt: 1234,
    })
    expect(slots[1]).toMatchObject({ key: key2, refreshing: true })
    expect(slots[1].refreshError).toBeUndefined()
  })

  it("marks a statement with no result as not run, with no refresh state", () => {
    // Given a frame whose second statement was added since the last run
    const statements = ["select 1", "select 2"]
    const frame = deriveStatementFrame(statements, result(["select 1"]))!

    // When the slot views are built with no engine state at all
    const slots = buildStatementSlotViews(frame, undefined)

    // Then the added statement is a neutral, idle slot
    expect(slots).toHaveLength(2)
    expect(slots[1].result).toBeNull()
    expect(slots[1].refreshing).toBe(false)
    expect(slots[1].refreshError).toBeUndefined()
  })

  it("keeps duplicate statements' refresh state separate by occurrence", () => {
    // Given two identical statements, only the second refreshing
    const statements = ["select 1", "select 1"]
    const [first, second] = statementKeysFor(statements)
    const frame = deriveStatementFrame(statements, result(statements))!
    const slots = buildStatementSlotViews(
      frame,
      fetchState({ slotFetching: new Set([second]) }),
    )

    // Then only that occurrence shows the spinner
    expect(slots[0]).toMatchObject({ key: first, refreshing: false })
    expect(slots[1]).toMatchObject({ key: second, refreshing: true })
  })
})
