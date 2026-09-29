import { describe, expect, it } from "vitest"
import {
  buildIdentityIndex,
  duplicateRowCount,
  identityColumnIndexes,
  identityKeyOf,
} from "./identityIndex"
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
    expect(index.rows.get(identityKeyOf(["BTC", "sell"], [0, 1]))).toEqual([
      "BTC",
      "sell",
      2,
    ])
    expect(index.ambiguous).toEqual(
      new Set([identityKeyOf(["BTC", "buy"], [0, 1])]),
    )
  })
})

describe("duplicateRowCount", () => {
  it("counts the rows past the first of each key for a chosen identity", () => {
    // Given six rows where k repeats and id is unique
    const columns = [
      { name: "k", type: "LONG" },
      { name: "id", type: "LONG" },
    ]
    const rows = [1, 2, 3, 4, 5, 6].map((id) => [id % 2, id])

    // When counted by k, by id, and by a column the result lacks
    const byK = duplicateRowCount(columns, rows, ["k"])
    const byId = duplicateRowCount(columns, rows, ["id"])
    const byMissing = duplicateRowCount(columns, rows, ["venue"])

    // Then only the repeating key reports duplicates
    expect(byK).toBe(4)
    expect(byId).toBe(0)
    expect(byMissing).toBe(0)
  })
})

describe("identityKeyOf", () => {
  it("keeps SQL NULL apart from the text 'null'", () => {
    // Given one row with a NULL symbol and one with the text 'null'
    const nullRow = [null, 1]
    const textRow = ["null", 5]

    // When both are keyed by the symbol column
    const nullKey = identityKeyOf(nullRow, [0])
    const textKey = identityKeyOf(textRow, [0])

    // Then the keys differ
    expect(nullKey).not.toBe(textKey)
  })

  it("keeps a number apart from its text form and a boolean apart from its text form", () => {
    // Given rows whose identity values print the same
    const numberKey = identityKeyOf([1], [0])
    const numberTextKey = identityKeyOf(["1"], [0])
    const booleanKey = identityKeyOf([true], [0])
    const booleanTextKey = identityKeyOf(["true"], [0])

    // Then each typed value gets its own key
    expect(numberKey).not.toBe(numberTextKey)
    expect(booleanKey).not.toBe(booleanTextKey)
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
