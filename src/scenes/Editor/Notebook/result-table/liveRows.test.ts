// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { DqlQueryResult } from "../../../../store/notebook"
import { createLiveRowsState, orderStably, useLiveRows } from "./liveRows"

describe("orderStably", () => {
  it("keeps known rows where they were and adds new ones at the end", () => {
    // Given
    const dataset = [
      ["ETH", 2],
      ["NEW", 9],
      ["BTC", 1],
    ]
    const keys = ["ETH", "NEW", "BTC"]
    const previous = new Map([
      ["BTC", 0],
      ["ETH", 1],
    ])

    // When
    const ordered = orderStably(dataset, keys, previous)

    // Then
    expect(ordered).toEqual([
      ["BTC", 1],
      ["ETH", 2],
      ["NEW", 9],
    ])
  })
})

const frame = (keys: string[], truncated = false): DqlQueryResult => ({
  type: "dql",
  query: "SELECT sym, px FROM book",
  columns: [
    { name: "sym", type: "SYMBOL" },
    { name: "px", type: "DOUBLE" },
  ],
  dataset: keys.map((key, i) => [key, i]),
  count: keys.length,
  ...(truncated ? { truncated: true } : {}),
})

describe("useLiveRows with a restored snapshot prefix", () => {
  const identity = ["sym"]

  it("keeps stable positions from the full result, not the prefix", () => {
    // Given a stable grid that showed A, B, C, then was read back from storage
    // as the saved prefix (A) after it scrolled away
    const history = createLiveRowsState()
    const { result, rerender } = renderHook(
      ({ data }) => useLiveRows(data, identity, "stable", history),
      { initialProps: { data: frame(["A", "B", "C"]) } },
    )
    rerender({ data: frame(["A"], true) })

    // When the next refresh returns every row, in a new order
    rerender({ data: frame(["C", "B", "A"]) })

    // Then the rows keep their places and none is marked new
    expect(result.current.data.dataset.map((row) => row[0])).toEqual([
      "A",
      "B",
      "C",
    ])
    expect(result.current.isNew).toBeNull()
  })

  it("marks no row of a stream new because it was past the restored prefix", () => {
    // Given a stream grid remounted on a restored prefix
    const { result, rerender } = renderHook(
      ({ data }) => useLiveRows(data, identity, "stream"),
      { initialProps: { data: frame(["A"], true) } },
    )

    // When the next refresh returns every row
    rerender({ data: frame(["A", "B", "C"]) })

    // Then no row flashes as newly arrived
    expect(result.current.isNew).toBeNull()
  })
})
