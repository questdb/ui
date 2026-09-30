import { describe, expect, it, vi } from "vitest"
import type { ColumnDefinition } from "../../../utils/questdb/types"
import { columnRangeOf } from "./columnRange"

const columns = [
  { name: "ts", type: "TIMESTAMP" },
  { name: "price", type: "DOUBLE" },
  { name: "sym", type: "SYMBOL" },
] as ColumnDefinition[]

describe("columnRangeOf", () => {
  it("scans a column once and serves later calls from the cache", () => {
    // Given a dataset whose rows record every read
    const reads = vi.fn()
    const dataset = [
      ["2026-01-01T00:00:00.000000Z", 3, "a"],
      ["2026-01-03T00:00:00.000000Z", 1, "b"],
    ].map(
      (values) =>
        new Proxy(values, {
          get(target, key) {
            reads()
            return Reflect.get(target, key) as unknown
          },
        }),
    )
    const rangeOf = columnRangeOf(columns, dataset)

    // When the same column is read twice and another column once
    const first = rangeOf("ts")
    const readsAfterFirst = reads.mock.calls.length
    const second = rangeOf("ts")
    const readsAfterSecond = reads.mock.calls.length
    const price = rangeOf("price")

    // Then the second read costs nothing and each column keeps its own range
    expect(first).toEqual({
      from: "2026-01-01T00:00:00.000000000",
      to: "2026-01-03T00:00:00.000000000",
    })
    expect(second).toBe(first)
    expect(readsAfterSecond).toBe(readsAfterFirst)
    expect(price).toEqual({ from: 1, to: 3 })
  })

  it("caches the absence of a range for text and unknown columns", () => {
    // Given a text column and a column that is not in the result
    const rangeOf = columnRangeOf(columns, [
      ["2026-01-01T00:00:00.000000Z", 1, "a"],
    ])

    // When both are read
    const text = rangeOf("sym")
    const missing = rangeOf("missing")

    // Then neither has a range
    expect(text).toBeNull()
    expect(missing).toBeNull()
  })
})
