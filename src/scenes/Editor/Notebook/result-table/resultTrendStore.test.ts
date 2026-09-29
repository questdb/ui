import { describe, expect, it } from "vitest"
import type { DqlQueryResult } from "../../../../store/notebook"
import { createResultTrendStore } from "./resultTrendStore"

const result = (
  dataset: (string | number)[][],
  columns = [
    { name: "symbol", type: "SYMBOL" },
    { name: "price", type: "DOUBLE" },
  ],
): DqlQueryResult => ({
  type: "dql",
  query: "select symbol, price from trades",
  columns,
  dataset,
  count: dataset.length,
})

const ran = (at: number) => ({ at, restored: false })
const readBack = (at: number) => ({ at, restored: true })

describe("createResultTrendStore", () => {
  it("has no baseline on the first capture and keeps the previous index on the next", () => {
    // Given a store and two consecutive results
    const store = createResultTrendStore()
    const first = result([["BTC", 1]])
    const second = result([["BTC", 2]])

    // When both are captured
    const firstEntry = store.capture("c1", "s1", first, ["symbol"], ran(100))
    const secondEntry = store.capture("c1", "s1", second, ["symbol"], ran(100))

    // Then the second compares against the first
    expect(firstEntry.previous).toBeNull()
    expect(firstEntry.revision).toBe(1)
    expect(secondEntry.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(secondEntry.revision).toBe(2)
  })

  it("returns the same entry for the same result and identity", () => {
    // Given a captured result
    const store = createResultTrendStore()
    const data = result([["BTC", 1]])
    const entry = store.capture("c1", "s1", data, ["symbol"], ran(100))

    // When captured again unchanged
    const again = store.capture("c1", "s1", data, ["symbol"], ran(100))

    // Then nothing advances
    expect(again).toBe(entry)
  })

  it("drops the baseline when the identity columns change", () => {
    // Given two results captured under one identity
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    const second = result([["BTC", 2]])
    store.capture("c1", "s1", second, ["symbol"], ran(100))

    // When the identity changes for the same result
    const entry = store.capture("c1", "s1", second, ["price"], ran(100))

    // Then there is no previous index and the revision is unchanged
    expect(entry.previous).toBeNull()
    expect(entry.revision).toBe(2)
  })

  it("drops the baseline when the column set changes", () => {
    // Given a result, then one with a different column set
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    const widened = result(
      [["BTC", 1, 2]],
      [
        { name: "symbol", type: "SYMBOL" },
        { name: "price", type: "DOUBLE" },
        { name: "amount", type: "DOUBLE" },
      ],
    )

    // When captured
    const entry = store.capture("c1", "s1", widened, ["symbol"], ran(100))

    // Then the comparison starts over
    expect(entry.previous).toBeNull()
  })

  it("drops the baseline when the same statement runs with other variable values", () => {
    // Given a statement run with @sym = BTC-USD
    const store = createResultTrendStore()
    const btc = {
      ...result([["2026-09-28T10:00:00.000000Z", 64000]]),
      effectiveQuery: "DECLARE @sym := 'BTC-USD' select ...",
    }
    store.capture("c1", "s1", btc, ["symbol"], ran(100))

    // When the same statement lands with @sym = ETH-USD
    const eth = {
      ...result([["2026-09-28T10:00:00.000000Z", 2600]]),
      effectiveQuery: "DECLARE @sym := 'ETH-USD' select ...",
    }
    const entry = store.capture("c1", "s1", eth, ["symbol"], ran(100))

    // Then ETH is not compared against BTC
    expect(entry.previous).toBeNull()
    expect(entry.revision).toBe(2)
  })

  it("never compares against a truncated snapshot, but compares the results after it", () => {
    // Given a restored snapshot that kept only a prefix of the rows
    const store = createResultTrendStore()
    const prefix = { ...result([["BTC", 1]]), truncated: true }
    store.capture("c1", "s1", prefix, ["symbol"], ran(100))

    // When two full results follow
    const full = result([
      ["BTC", 2],
      ["ETH", 5],
    ])
    const afterPrefix = store.capture("c1", "s1", full, ["symbol"], ran(100))
    const next = store.capture(
      "c1",
      "s1",
      result([
        ["BTC", 3],
        ["ETH", 6],
      ]),
      ["symbol"],
      ran(100),
    )

    // Then rows past the prefix are not compared, and the next result is
    expect(afterPrefix.previous).toBeNull()
    expect(next.previous?.rows.get("ETH")).toEqual(["ETH", 5])
  })

  it("brings back a replaced result as it was shown, not compared against the discarded one", () => {
    // Given a compared result, then a run whose rows are later discarded
    let time = 100
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(time))
    time = 200
    const shown = result([["BTC", 2]])
    const shownEntry = store.capture("c1", "s1", shown, ["symbol"], ran(time))
    time = 300
    store.capture("c1", "s1", result([["BTC", 9]]), ["symbol"], ran(time))

    // When the shown result is put back as the same object
    time = 400
    const restored = store.capture("c1", "s1", shown, ["symbol"], ran(time))

    // Then it is not compared, keeps its flash timing, and baselines the next run
    expect(restored.previous).toBeNull()
    expect(restored.revision).toBe(shownEntry.revision)
    expect(restored.capturedAt).toBe(200)
    const next = store.capture(
      "c1",
      "s1",
      result([["BTC", 3]]),
      ["symbol"],
      ran(time),
    )
    expect(next.previous?.rows.get("BTC")).toEqual(["BTC", 2])
  })

  it("keeps the landing time of the first capture when only the identity changes", () => {
    // Given a captured result
    const store = createResultTrendStore()
    const data = result([["BTC", 1]])
    store.capture("c1", "s1", data, ["symbol"], ran(100))

    // When the identity changes without a new result
    const entry = store.capture("c1", "s1", data, ["price"], ran(500))

    // Then the capture time stays at the first landing
    expect(entry.capturedAt).toBe(100)
  })
})

describe("createResultTrendStore: release and rehydrate", () => {
  it("hides a released statement and brings its baseline back for the same rows", () => {
    // Given a compared result that is released back to storage
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    store.capture("c1", "s1", result([["BTC", 2]]), ["symbol"], ran(200))
    store.releaseCell("c1")

    // When the same rows are read back later as a new object
    const hidden = store.get("c1", "s1")
    const rehydrated = store.capture(
      "c1",
      "s1",
      result([["BTC", 2]]),
      ["symbol"],
      readBack(900),
    )

    // Then nothing shows while released, and the rehydrate compares as before, timed from the run
    expect(hidden).toBeUndefined()
    expect(rehydrated.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(rehydrated.capturedAt).toBe(200)
    expect(rehydrated.revision).toBe(2)
  })

  it("baselines the result after a rehydrate on the rehydrated rows", () => {
    // Given a released and rehydrated statement
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    store.capture("c1", "s1", result([["BTC", 2]]), ["symbol"], ran(200))
    store.releaseCell("c1")
    store.capture("c1", "s1", result([["BTC", 2]]), ["symbol"], readBack(900))

    // When a new result lands
    const next = store.capture(
      "c1",
      "s1",
      result([["BTC", 3]]),
      ["symbol"],
      ran(1000),
    )

    // Then it compares against the rehydrated rows
    expect(next.previous?.rows.get("BTC")).toEqual(["BTC", 2])
    expect(next.capturedAt).toBe(1000)
  })

  it("starts over when a run lands on a released statement", () => {
    // Given a compared result that is released, so its rows are gone
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    store.capture("c1", "s1", result([["BTC", 2]]), ["symbol"], ran(200))
    store.releaseCell("c1")

    // When a run lands with the same shape before any rehydrate
    const entry = store.capture(
      "c1",
      "s1",
      result([["BTC", 3]]),
      ["symbol"],
      ran(900),
    )

    // Then nothing is compared against the older baseline, and the flash is timed from the run
    expect(entry.previous).toBeNull()
    expect(entry.revision).toBe(3)
    expect(entry.capturedAt).toBe(900)
  })

  it("forgets a released statement that had no baseline", () => {
    // Given a first result with nothing to compare against
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    store.releaseCell("c1")

    // When rows are read back
    const rehydrated = store.capture(
      "c1",
      "s1",
      result([["BTC", 1]]),
      ["symbol"],
      readBack(900),
    )

    // Then the rehydrate starts over, timed from its save
    expect(rehydrated.previous).toBeNull()
    expect(rehydrated.revision).toBe(1)
    expect(rehydrated.capturedAt).toBe(900)
  })

  it("starts over when the rehydrated result has another shape", () => {
    // Given a compared result that is released
    const store = createResultTrendStore()
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"], ran(100))
    store.capture("c1", "s1", result([["BTC", 2]]), ["symbol"], ran(200))
    store.releaseCell("c1")

    // When rows with other columns come back under the same key
    const otherColumns = [
      { name: "symbol", type: "SYMBOL" },
      { name: "size", type: "LONG" },
    ]
    const rehydrated = store.capture(
      "c1",
      "s1",
      result([["BTC", 7]], otherColumns),
      ["symbol"],
      readBack(900),
    )

    // Then the old baseline is not used
    expect(rehydrated.previous).toBeNull()
    expect(rehydrated.revision).toBe(3)
    expect(rehydrated.capturedAt).toBe(900)
  })
})

describe("createResultTrendStore: retained statements", () => {
  it("forgets the statements a cell no longer has", () => {
    // Given a cell with two captured statements
    const store = createResultTrendStore()
    store.capture("c1", "old", result([["BTC", 1]]), [], ran(100))
    store.capture("c1", "kept", result([["ETH", 1]]), [], ran(100))

    // When only one of them is retained
    store.retainStatements("c1", ["kept"])

    // Then the other statement and its rows are gone
    expect(store.get("c1", "old")).toBeUndefined()
    expect(store.get("c1", "kept")?.result.dataset).toEqual([["ETH", 1]])
  })
})

describe("createResultTrendStore: cell scope", () => {
  it("keeps cells apart and clears only the asked cell", () => {
    // Given the same statement key captured for two cells
    const store = createResultTrendStore()
    const data = result([["BTC", 1]])
    store.capture("c1", "s1", data, ["symbol"], ran(100))
    store.capture("c2", "s1", data, ["symbol"], ran(100))

    // When one cell is cleared and both capture a new result
    store.clearCell("c1")
    const next = result([["BTC", 2]])
    const cleared = store.capture("c1", "s1", next, ["symbol"], ran(100))
    const kept = store.capture("c2", "s1", next, ["symbol"], ran(100))

    // Then only the kept cell still has a baseline
    expect(cleared.previous).toBeNull()
    expect(kept.previous?.rows.get("BTC")).toEqual(["BTC", 1])
  })
})
