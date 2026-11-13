import { describe, expect, it } from "vitest"
import { buildStatementSlotViews } from "./statementSlotView"
import { deriveStatementFrame, statementKeysFor } from "../statementIdentity"
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
  slotVerifiedAt: new Map(),
  slotVerifiedTimings: new Map(),
  fetchCancelled: false,
  ...over,
})

describe("buildStatementSlotViews", () => {
  it("uses timing from the same response as its freshness stamp, without replacing rows", () => {
    const old = {
      compiler: 0,
      authentication: 0,
      count: 0,
      execute: 7e9,
      fetch: 8e9,
    }
    const fresh = { ...old, execute: 4e8, fetch: 5e8 }
    const queries = ["select 1", "select 2", "select 3"]
    const keys = statementKeysFor(queries)
    const frame = deriveStatementFrame(queries, {
      ...result(queries),
      results: queries.map((query) => ({
        ...dql(query),
        fetchedAt: 2000,
        timings: old,
      })),
    })!
    const slots = buildStatementSlotViews(
      frame,
      fetchState({
        slotVerifiedAt: new Map([
          [keys[0], 3000],
          [keys[1], 1500],
          [keys[2], 3000],
        ]),
        slotVerifiedTimings: new Map([
          [keys[0], fresh],
          [keys[1], fresh],
          [keys[2], undefined],
        ]),
      }),
    )
    expect(slots.map((slot) => slot.timings)).toEqual([fresh, old, undefined])
    slots.forEach((slot, index) =>
      expect(slot.result).toBe(frame.slots[index].result),
    )
  })

  it("attaches refresh state to slots by statement content", () => {
    // Given a two-statement frame where the second is refreshing and the
    // first failed its last round
    const statements = ["select 1", "select 2"]
    const [key1, key2] = statementKeysFor(statements)
    const frame = deriveStatementFrame(statements, result(statements))!
    const state = fetchState({
      slotFetching: new Set([key2]),
      slotErrors: new Map([[key1, "boom"]]),
      slotVerifiedAt: new Map([[key1, 1234]]),
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

  it("shows the later of the rows' fetch time and the poll that verified them", () => {
    // Given a frame whose rows were fetched at T1, one slot verified unchanged
    // later and the other before its rows were written
    const statements = ["select 1", "select 2"]
    const [key1, key2] = statementKeysFor(statements)
    const frame = deriveStatementFrame(statements, {
      results: statements.map((query) => ({
        ...dql(query),
        fetchedAt: 2000,
      })),
      activeResultIndex: 0,
      timestamp: 0,
    })!
    const state = fetchState({
      slotVerifiedAt: new Map([
        [key1, 3000],
        [key2, 1500],
      ]),
    })

    // When the slot views are built
    const slots = buildStatementSlotViews(frame, state)

    // Then the status line never shows a time older than the rows
    expect(slots.map((slot) => slot.fetchedAt)).toEqual([3000, 2000])
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

    // When the slot views are built
    const slots = buildStatementSlotViews(
      frame,
      fetchState({ slotFetching: new Set([second]) }),
    )

    // Then only that occurrence shows the spinner
    expect(slots[0]).toMatchObject({ key: first, refreshing: false })
    expect(slots[1]).toMatchObject({ key: second, refreshing: true })
  })
})
