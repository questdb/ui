import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  CellResult,
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
const restored = new WeakSet<CellResult>()
const [KEY] = statementKeysFor([QUERY])

describe("captureResultTrends", () => {
  it("captures every settled statement of a changed cell and keeps the previous index", () => {
    // Given a cell with a comparison rule that ran once and then again
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))

    // When both results settle
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])

    // Then the store holds the baseline from the first run
    expect(store.get("c1", KEY)?.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(store.get("c1", KEY)?.revision).toBe(2)
  })

  it("keeps a baseline for every statement under the key the grid reads", () => {
    // Given a two-statement cell with a comparison rule that ran twice
    const SECOND = "select symbol, price from quotes"
    const store = createResultTrendStore()
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
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])

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
    const store = createResultTrendStore()
    const before = cell("c1", [dql(QUERY, [["BTC", 1]])])
    captureResultTrends(store, restored, [], [before])
    const entry = store.get("c1", KEY)

    // When the cell changes in an unrelated way
    captureResultTrends(
      store,
      restored,
      [before],
      [{ ...before, name: "Watchlist" }],
    )

    // Then the entry is the same object
    expect(store.get("c1", KEY)).toBe(entry)
  })

  it("recaptures with the new identity when the rules change, dropping the baseline", () => {
    // Given two compared runs, then a saved config with another identity
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])
    const configured = { ...second, highlightConfig: comparing("price") }

    // When the config settles
    captureResultTrends(store, restored, [second], [configured])

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
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], valueOnly)
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], valueOnly)

    // When both results settle
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])

    // Then no baseline is held, while the revision still advances the flash
    expect(store.get("c1", KEY)?.previous).toBeNull()
    expect(store.get("c1", KEY)?.revision).toBe(2)
  })

  it("keeps the previous rows for a cell whose only rule flashes new rows", () => {
    // Given a cell with a new-row rule and no comparison rule
    const newRowOnly: NotebookCell["highlightConfig"] = {
      identityColumns: ["symbol"],
      rules: [
        {
          id: "new",
          enabled: true,
          kind: "newRow",
          display: "temporary",
          color: "dataSeries2",
        },
      ],
    }
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], newRowOnly)
    const second = cell(
      "c1",
      [
        dql(QUERY, [
          ["BTC", 1],
          ["ETH", 2],
        ]),
      ],
      newRowOnly,
    )

    // When both results settle
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])

    // Then the second run reads the first run's rows, so ETH counts as new
    const previous = store.get("c1", KEY)?.previous
    expect(previous?.rows.has("BTC")).toBe(true)
    expect(previous?.rows.has("ETH")).toBe(false)
  })

  it("shows no comparison when a run is discarded and the prior result comes back", () => {
    // Given a compared two-statement cell with a baseline
    const SECOND = "select symbol, price from quotes"
    const store = createResultTrendStore()
    const earlier = cell(
      "c1",
      [dql(QUERY, [["BTC", 1]]), dql(SECOND, [["ETH", 10]])],
      comparing("symbol"),
    )
    const prior = cell(
      "c1",
      [dql(QUERY, [["BTC", 2]]), dql(SECOND, [["ETH", 20]])],
      comparing("symbol"),
    )
    captureResultTrends(store, restored, [], [earlier])
    captureResultTrends(store, restored, [earlier], [prior])

    // When a run starts, lands one statement, and is discarded
    const running = cell(
      "c1",
      [
        { type: "running", query: QUERY },
        { type: "running", query: SECOND },
      ],
      comparing("symbol"),
    )
    const landed = cell(
      "c1",
      [dql(QUERY, [["BTC", 9]]), { type: "running", query: SECOND }],
      comparing("symbol"),
    )
    const restoredCell = { ...landed, result: prior.result }
    captureResultTrends(store, restored, [prior], [running])
    captureResultTrends(store, restored, [running], [landed])
    captureResultTrends(store, restored, [landed], [restoredCell])

    // Then the restored rows are not compared against the discarded ones
    expect(store.get("c1", KEY)?.result).toBe(prior.result?.results[0])
    expect(store.get("c1", KEY)?.previous).toBeNull()
  })

  it("keeps the baseline of a released cell for its rehydrate", () => {
    // Given a compared cell with a baseline
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])

    // When the result is released back to storage and read back as new objects
    const released = { ...second, result: undefined }
    captureResultTrends(store, restored, [second], [released])
    const hidden = store.get("c1", KEY)
    const rehydrated = cell(
      "c1",
      [dql(QUERY, [["BTC", 2]])],
      comparing("symbol"),
    )
    const readBack = new WeakSet<CellResult>([rehydrated.result as CellResult])
    captureResultTrends(store, readBack, [released], [rehydrated])

    // Then nothing shows while released, and the rehydrate compares as before
    expect(hidden).toBeUndefined()
    expect(store.get("c1", KEY)?.previous?.rows.get("BTC")).toEqual(["BTC", 1])
  })

  it("does not compare a run on a released cell against the older baseline", () => {
    // Given a compared cell with a baseline that is released back to storage
    const store = createResultTrendStore()
    const first = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const second = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, restored, [], [first])
    captureResultTrends(store, restored, [first], [second])
    const released = { ...second, result: undefined }
    captureResultTrends(store, restored, [second], [released])

    // When a run lands on the released cell
    const ran = cell("c1", [dql(QUERY, [["BTC", 3]])], comparing("symbol"))
    captureResultTrends(store, restored, [released], [ran])

    // Then the run has no baseline instead of the one its released rows had
    expect(store.get("c1", KEY)?.previous).toBeNull()
  })

  it("forgets a removed cell", () => {
    // Given a captured cell
    const store = createResultTrendStore()
    const only = cell("c1", [dql(QUERY, [["BTC", 1]])])
    captureResultTrends(store, restored, [], [only])

    // When the cell is deleted
    captureResultTrends(store, restored, [only], [])

    // Then nothing remains for it
    expect(store.get("c1", KEY)).toBeUndefined()
  })
})

describe("captureResultTrends: landing time", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("times a result read back from storage from its save, and a run from now", () => {
    // Given a clock well past a saved result that the hydration engine read back
    vi.spyOn(Date, "now").mockReturnValue(5_000)
    const store = createResultTrendStore()
    const saved = cell("c1", [dql(QUERY, [["BTC", 1]])], comparing("symbol"))
    const readBack = new WeakSet<CellResult>([saved.result as CellResult])

    // When the saved result fills the empty cell, and a run then replaces it
    captureResultTrends(store, readBack, [], [saved])
    const restoredAt = store.get("c1", KEY)?.capturedAt
    const ran = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, readBack, [saved], [ran])
    const ranAt = store.get("c1", KEY)?.capturedAt

    // Then the restore keeps its save time and the run is stamped now
    expect(restoredAt).toBe(saved.result?.timestamp)
    expect(ranAt).toBe(5_000)
  })

  it("times a run that fills an empty cell from now", () => {
    // Given a clock well past the run's start, and a cell with no result in memory
    vi.spyOn(Date, "now").mockReturnValue(5_000)
    const store = createResultTrendStore()
    const empty = { ...cell("c1", [], comparing("symbol")), result: undefined }

    // When a headless run lands its result, stamped with its start
    const ran = cell("c1", [dql(QUERY, [["BTC", 2]])], comparing("symbol"))
    captureResultTrends(store, restored, [empty], [ran])

    // Then the flash is timed from now, not from the run's start
    expect(store.get("c1", KEY)?.capturedAt).toBe(5_000)
  })
})
