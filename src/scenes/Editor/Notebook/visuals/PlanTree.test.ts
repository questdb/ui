import { describe, expect, it } from "vitest"
import { parsePlan } from "./PlanTree"

describe("parsePlan", () => {
  it("nests operators by indent and attaches attributes to the operator above", () => {
    // Given
    const lines = [
      "SelectedRecord",
      "    Async JIT Group By workers: 14",
      "      keys: [symbol]",
      "      filter: 10<price",
      "        PageFrame",
      "            Row forward scan",
      "            Frame forward scan on: trades",
    ]

    // When
    const [root] = parsePlan(lines)

    // Then
    expect(root.name).toBe("SelectedRecord")
    const group = root.children[0]
    expect(group.name).toBe("Async JIT Group By workers: 14")
    expect(group.attributes).toEqual([
      { key: "keys", value: "[symbol]" },
      { key: "filter", value: "10<price" },
    ])
    expect(group.children[0].children.map((c) => c.name)).toEqual([
      "Row forward scan",
      "Frame forward scan on: trades",
    ])
  })
})
