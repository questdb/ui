import { describe, expect, it } from "vitest"
import type {
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { statementKeysFor } from "../notebookUtils"
import { captureResultTrends } from "./resultTrendCapture"
import { createResultTrendStore } from "./resultTrendStore"

const dql = (
  query: string,
  dataset: (string | number)[][],
): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [
    { name: "symbol", type: "SYMBOL" },
    { name: "price", type: "DOUBLE" },
  ],
  dataset,
  count: dataset.length,
})

const cell = (
  id: string,
  results: SingleQueryResult[],
  highlightConfig?: NotebookCell["highlightConfig"],
): NotebookCell =>
  ({
    id,
    value: results.map((r) => r.query).join(";\n"),
    result: { results, activeResultIndex: 0, timestamp: 1 },
    ...(highlightConfig ? { highlightConfig } : {}),
  }) as NotebookCell

const QUERY = "select symbol, price from trades"
const [KEY] = statementKeysFor([QUERY])

describe("captureResultTrends", () => {
  it("captures every settled statement of a changed cell and keeps the previous index", () => {
    // Given a cell that ran once and then again
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])])
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])])

    // When both results settle
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])

    // Then the store holds the baseline from the first run
    expect(store.get("c1", KEY)?.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(store.get("c1", KEY)?.revision).toBe(2)
  })

  it("skips a cell whose result and rules did not change", () => {
    // Given a captured cell and a later change to another field
    const store = createResultTrendStore(() => 100)
    const before = cell("c1", [dql(QUERY, [["BTC", 1]])])
    captureResultTrends(store, [], [before])
    const entry = store.get("c1", KEY)

    // When the cell changes in an unrelated way
    captureResultTrends(store, [before], [{ ...before, name: "Watchlist" }])

    // Then the entry is the same object
    expect(store.get("c1", KEY)).toBe(entry)
  })

  it("recaptures with the new identity when the rules change, dropping the baseline", () => {
    // Given two runs, then a saved config with another identity
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])])
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])])
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])
    const configured = {
      ...second,
      highlightConfig: { identityColumns: ["price"], rules: [] },
    }

    // When the config settles
    captureResultTrends(store, [second], [configured])

    // Then the baseline is gone and the identity follows the config
    expect(store.get("c1", KEY)?.previous).toBeNull()
    expect(store.get("c1", KEY)?.identityColumns).toEqual(["price"])
  })

  it("forgets a removed cell", () => {
    // Given a captured cell
    const store = createResultTrendStore(() => 100)
    const only = cell("c1", [dql(QUERY, [["BTC", 1]])])
    captureResultTrends(store, [], [only])

    // When the cell is deleted
    captureResultTrends(store, [only], [])

    // Then nothing remains for it
    expect(store.get("c1", KEY)).toBeUndefined()
  })
})
