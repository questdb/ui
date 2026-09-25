import { describe, expect, it } from "vitest"
import { buildIdentityIndex, identityColumnIndexes } from "./identityIndex"
import { defaultIdentityColumns } from "./defaultIdentity"

describe("identityColumnIndexes", () => {
  it("resolves names to indexes and rejects a missing column", () => {
    // Given three result columns
    const columns = [
      { name: "symbol", type: "SYMBOL" },
      { name: "side", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
    ]

    // When resolving present and missing names
    const present = identityColumnIndexes(columns, ["side", "symbol"])
    const missing = identityColumnIndexes(columns, ["symbol", "venue"])

    // Then present names map in order and a missing name gives null
    expect(present).toEqual([1, 0])
    expect(missing).toBeNull()
    expect(identityColumnIndexes(columns, [])).toBeNull()
  })
})

describe("buildIdentityIndex", () => {
  it("keeps unique keys and drops duplicated keys as ambiguous", () => {
    // Given rows where BTC/buy repeats
    const rows = [
      ["BTC", "buy", 1],
      ["BTC", "sell", 2],
      ["BTC", "buy", 3],
    ]

    // When indexed by symbol and side
    const index = buildIdentityIndex(rows, [0, 1])

    // Then only the unique key remains and the duplicate is reported
    expect(index.rows.size).toBe(1)
    expect(index.rows.get("BTC\u0000sell")).toEqual(["BTC", "sell", 2])
    expect(index.ambiguous).toEqual(new Set(["BTC\u0000buy"]))
  })
})

describe("defaultIdentityColumns", () => {
  it("prefers symbol and string columns over the designated timestamp", () => {
    // Given a result with a symbol, a string and a designated timestamp
    const columns = [
      { name: "ts", type: "TIMESTAMP" },
      { name: "symbol", type: "SYMBOL" },
      { name: "venue", type: "VARCHAR" },
      { name: "price", type: "DOUBLE" },
    ]

    // When picking the default
    const identity = defaultIdentityColumns(columns, 0)

    // Then the text columns are used
    expect(identity).toEqual(["symbol", "venue"])
  })

  it("falls back to the designated timestamp, then to nothing", () => {
    // Given numeric-only results with and without a designated timestamp
    const columns = [
      { name: "ts", type: "TIMESTAMP" },
      { name: "price", type: "DOUBLE" },
    ]

    // When picking the default
    // Then the timestamp is used only when designated
    expect(defaultIdentityColumns(columns, 0)).toEqual(["ts"])
    expect(defaultIdentityColumns(columns, -1)).toEqual([])
  })
})
