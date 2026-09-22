import { describe, expect, it, vi } from "vitest"
import type { ListVariable } from "../../../../../store/notebook"
import type { Client } from "../../../../../utils/questdb/client"
import { fetchVariableOptions } from "./fetchVariableOptions"

const pairList: ListVariable & { source: { type: "query" } } = {
  name: "pair",
  kind: "list",
  source: {
    type: "query",
    query: "SELECT DISTINCT symbol FROM fx_trades",
  },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
}

const makeQuest = (response: unknown) =>
  ({
    validateQuery: () =>
      Promise.resolve({
        query: "",
        columns: [{ name: "symbol", type: "SYMBOL" }],
        timestamp: -1,
      }),
    queryRaw: () => ({
      promise: Promise.resolve(response),
      queryId: "q-1",
    }),
    abort: vi.fn(),
  }) as unknown as Client

describe("fetchVariableOptions", () => {
  it("returns quoted options, the column names and the fetch time", async () => {
    // Given
    const quest = makeQuest({
      type: "dql",
      columns: [{ name: "symbol", type: "SYMBOL" }],
      dataset: [["EURUSD"], ["GBPUSD"]],
      count: 2,
    })
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)

    // When
    const result = await fetchVariableOptions(
      quest,
      pairList,
      [],
      new AbortController().signal,
    )
    vi.useRealTimers()

    // Then
    expect(result).toMatchObject({
      kind: "ready",
      fetched: {
        options: [
          { value: "'EURUSD'", label: "EURUSD" },
          { value: "'GBPUSD'", label: "GBPUSD" },
        ],
        columns: ["symbol"],
        truncated: false,
        warnings: [],
        fetchedAt: 1_700_000_000_000,
      },
    })
  })

  it("passes a query failure through as an error", async () => {
    // Given
    const quest = makeQuest({ type: "error", error: "table does not exist" })

    // When
    const result = await fetchVariableOptions(
      quest,
      pairList,
      [],
      new AbortController().signal,
    )

    // Then
    expect(result).toEqual({ kind: "error", error: "table does not exist" })
  })
})
