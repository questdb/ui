import { describe, expect, it } from "vitest"
import { defaultIdentityColumns } from "./defaultIdentity"

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
