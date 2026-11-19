import { describe, expect, it } from "vitest"
import { orderStably } from "./liveRows"

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
