import { describe, expect, it } from "vitest"
import type {
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import { deriveStatementFrame, statementKeysFor } from "../notebookUtils"
import { getQueriesFromText } from "../../Monaco/utils"
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

const comparing = (identity: string): NotebookCell["highlightConfig"] => ({
  identityColumns: [identity],
  rules: [
    {
      id: "up",
      enabled: true,
      kind: "previous",
      target: { kind: "column", name: "price" },
      appliesTo: "cell",
      display: "temporary",
      condition: { op: "gt" },
      color: "dataPositive",
    },
  ],
})

const QUERY = "select symbol, price from trades"
const [KEY] = statementKeysFor([QUERY])

describe("captureResultTrends", () => {
  it("captures every settled statement of a changed cell and keeps the previous index", () => {
    // Given a cell with a comparison rule that ran once and then again
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))

    // When both results settle
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])

    // Then the store holds the baseline from the first run
    expect(store.get("c1", KEY)?.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(store.get("c1", KEY)?.revision).toBe(2)
  })

  it("keeps a baseline for every statement under the key the grid reads", () => {
    // Given a two-statement cell with a comparison rule that ran twice
    const SECOND = "select symbol, price from quotes"
    const store = createResultTrendStore(() => 100)
    const first = cell(
      "c1",
      [dql(QUERY, [["BTC", 1]]), dql(SECOND, [["ETH", 10]])],
      comparing("symbol"),
    )
    const second = cell(
      "c1",
      [dql(QUERY, [["BTC", 2]]), dql(SECOND, [["ETH", 20]])],
      comparing("symbol"),
    )

    // When both runs settle
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])

    // Then the second tab's slot key finds the second statement's baseline
    const frame = deriveStatementFrame(
      getQueriesFromText(second.value),
      second.result,
    )
    const secondTabKey = frame?.slots[1].key ?? ""
    expect(secondTabKey).not.toBe(KEY)
    expect(store.get("c1", secondTabKey)?.previous?.rows.get("ETH")).toEqual([
      "ETH",
      10,
    ])
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
    // Given two compared runs, then a saved config with another identity
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])
    const configured = { ...second, highlightConfig: comparing("price") }

    // When the config settles
    captureResultTrends(store, [second], [configured])

    // Then the baseline is gone and the identity follows the config
    expect(store.get("c1", KEY)?.previous).toBeNull()
    expect(store.get("c1", KEY)?.identityColumns).toEqual(["price"])
  })

  it("keeps no previous rows for a cell without a comparison rule", () => {
    // Given a cell with only a value rule that ran twice
    const valueOnly: NotebookCell["highlightConfig"] = {
      identityColumns: ["symbol"],
      rules: [
        {
          id: "high",
          enabled: true,
          kind: "value",
          target: { kind: "column", name: "price" },
          appliesTo: "cell",
          display: "temporary",
          condition: { op: "gt", value: 0 },
          color: "dataSeries2",
        },
      ],
    }
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], valueOnly)
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], valueOnly)

    // When both results settle
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])

    // Then no baseline is held, while the revision still advances the flash
    expect(store.get("c1", KEY)?.previous).toBeNull()
    expect(store.get("c1", KEY)?.revision).toBe(2)
  })

  it("forgets a cell whose result is released", () => {
    // Given a compared cell with a baseline
    const store = createResultTrendStore(() => 100)
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, [], [first])
    captureResultTrends(store, [first], [second])

    // When the result is released back to storage
    captureResultTrends(store, [second], [{ ...second, result: undefined }])

    // Then the store holds none of its rows
    expect(store.get("c1", KEY)).toBeUndefined()
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
