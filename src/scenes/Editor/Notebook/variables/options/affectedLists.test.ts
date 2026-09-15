import { describe, expect, it } from "vitest"
import type {
  ListVariable,
  NotebookVariable,
} from "../../../../../store/notebook"
import {
  listsAffectedByChange,
  listsAffectedByTimeRange,
  listsRefreshedWith,
} from "./affectedLists"

const list = (
  name: string,
  query: string,
  refresh: "onLoad" | "onTimeRangeChange" = "onLoad",
): ListVariable & { source: { type: "query" } } => ({
  name,
  kind: "list",
  source: { type: "query", query, refresh },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
})

describe("listsAffectedByChange", () => {
  it("picks the redefined lists and the lists that reference a changed name, case-insensitively", () => {
    // Given
    const lists = [
      list("pair", "SELECT symbol FROM t WHERE venue = @Venue"),
      list("side", "SELECT side FROM t"),
      list("size", "SELECT size FROM t"),
    ]

    // When
    const affected = listsAffectedByChange(lists, ["venue", "Side"], ["SIDE"])

    // Then
    expect(affected.map((l) => l.name)).toEqual(["pair", "side"])
  })

  it("follows the chain through a fixed variable that references a changed name", () => {
    // Given
    const variables: NotebookVariable[] = [
      { name: "v", kind: "expression", value: "@venue" },
      list("pair", "SELECT symbol FROM t WHERE venue = @v"),
      list("size", "SELECT size FROM t"),
    ]

    // When
    const affected = listsAffectedByChange(variables, ["venue"], [])

    // Then
    expect(affected.map((l) => l.name)).toEqual(["pair"])
  })

  it("follows the chain through lists that reference an affected list", () => {
    // Given
    const lists = [
      list("venue", "SELECT venue FROM t WHERE region = @region"),
      list("pair", "SELECT symbol FROM t WHERE venue = @venue"),
      list("side", "SELECT side FROM t WHERE symbol = @pair"),
      list("size", "SELECT size FROM t"),
    ]

    // When
    const affected = listsAffectedByChange(lists, ["region"], [])

    // Then
    expect(affected.map((l) => l.name)).toEqual(["venue", "pair", "side"])
  })
})

describe("listsAffectedByTimeRange", () => {
  it("picks the lists that refresh on the range or reference a time variable", () => {
    // Given
    const lists = [
      list("pair", "SELECT symbol FROM t WHERE ts > @timeFrom"),
      list("side", "SELECT side FROM t", "onTimeRangeChange"),
      list("size", "SELECT size FROM t"),
    ]

    // When
    const affected = listsAffectedByTimeRange(lists)

    // Then
    expect(affected.map((l) => l.name)).toEqual(["pair", "side"])
  })

  it("follows the chain from a time-dependent list", () => {
    // Given
    const lists = [
      list("venue", "SELECT venue FROM t", "onTimeRangeChange"),
      list("pair", "SELECT symbol FROM t WHERE venue = @venue"),
      list("size", "SELECT size FROM t"),
    ]

    // When
    const affected = listsAffectedByTimeRange(lists)

    // Then
    expect(affected.map((l) => l.name)).toEqual(["venue", "pair"])
  })
})

describe("listsRefreshedWith", () => {
  it("refreshes the list itself and every list below that depends on it", () => {
    // Given
    const lists = [
      list("venue", "SELECT venue FROM t"),
      list("pair", "SELECT symbol FROM t WHERE venue = @venue"),
      list("size", "SELECT size FROM t WHERE symbol = @pair"),
      list("side", "SELECT side FROM t"),
    ]

    // When
    const refreshed = listsRefreshedWith(lists, "venue")

    // Then
    expect(refreshed.map((l) => l.name)).toEqual(["venue", "pair", "size"])
  })
})
