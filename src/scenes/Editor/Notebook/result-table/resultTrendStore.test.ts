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

describe("createResultTrendStore", () => {
  it("has no baseline on the first capture and keeps the previous index on the next", () => {
    // Given a store and two consecutive results
    const store = createResultTrendStore(() => 100)
    const first = result([["BTC", 1]])
    const second = result([["BTC", 2]])

    // When both are captured
    const firstEntry = store.capture("c1", "s1", first, ["symbol"])
    const secondEntry = store.capture("c1", "s1", second, ["symbol"])

    // Then the second compares against the first
    expect(firstEntry.previous).toBeNull()
    expect(firstEntry.revision).toBe(1)
    expect(secondEntry.previous?.rows.get("BTC")).toEqual(["BTC", 1])
    expect(secondEntry.revision).toBe(2)
  })

  it("returns the same entry for the same result and identity", () => {
    // Given a captured result
    const store = createResultTrendStore(() => 100)
    const data = result([["BTC", 1]])
    const entry = store.capture("c1", "s1", data, ["symbol"])

    // When captured again unchanged
    const again = store.capture("c1", "s1", data, ["symbol"])

    // Then nothing advances
    expect(again).toBe(entry)
  })

  it("drops the baseline when the identity columns change", () => {
    // Given two results captured under one identity
    const store = createResultTrendStore(() => 100)
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"])
    const second = result([["BTC", 2]])
    store.capture("c1", "s1", second, ["symbol"])

    // When the identity changes for the same result
    const entry = store.capture("c1", "s1", second, ["price"])

    // Then there is no previous index and the revision is unchanged
    expect(entry.previous).toBeNull()
    expect(entry.revision).toBe(2)
  })

  it("drops the baseline when the column set changes", () => {
    // Given a result, then one with a different column set
    const store = createResultTrendStore(() => 100)
    store.capture("c1", "s1", result([["BTC", 1]]), ["symbol"])
    const widened = result(
      [["BTC", 1, 2]],
      [
        { name: "symbol", type: "SYMBOL" },
        { name: "price", type: "DOUBLE" },
        { name: "amount", type: "DOUBLE" },
      ],
    )

    // When captured
    const entry = store.capture("c1", "s1", widened, ["symbol"])

    // Then the comparison starts over
    expect(entry.previous).toBeNull()
  })

  it("stamps the capture time only when the result changes", () => {
    // Given a clock that advances
    let time = 100
    const store = createResultTrendStore(() => time)
    const data = result([["BTC", 1]])
    store.capture("c1", "s1", data, ["symbol"])

    // When time passes and the identity changes without a new result
    time = 500
    const entry = store.capture("c1", "s1", data, ["price"])

    // Then the capture time stays at the first result
    expect(entry.capturedAt).toBe(100)
  })
})

describe("createResultTrendStore: cell scope", () => {
  it("keeps cells apart and clears only the asked cell", () => {
    // Given the same statement key captured for two cells
    const store = createResultTrendStore(() => 100)
    const data = result([["BTC", 1]])
    store.capture("c1", "s1", data, ["symbol"])
    store.capture("c2", "s1", data, ["symbol"])

    // When one cell is cleared and both capture a new result
    store.clearCell("c1")
    const next = result([["BTC", 2]])
    const cleared = store.capture("c1", "s1", next, ["symbol"])
    const kept = store.capture("c2", "s1", next, ["symbol"])

    // Then only the kept cell still has a baseline
    expect(cleared.previous).toBeNull()
    expect(kept.previous?.rows.get("BTC")).toEqual(["BTC", 1])
  })
})
