import { describe, expect, it } from "vitest"
import type { NotebookVariable } from "../../../../store/notebook"
import {
  findVariableReferences,
  referencedDeclareEntries,
  referencesAny,
  variableReferences,
} from "./references"

describe("findVariableReferences", () => {
  it("collects referenced names in lower case", () => {
    // Given
    const sql = "SELECT * FROM t WHERE ts IN @TimeFilter AND s IN @symbol"

    // When
    const names = findVariableReferences(sql)

    // Then
    expect([...names]).toEqual(["timefilter", "symbol"])
  })

  it("ignores names inside strings and comments", () => {
    // Given
    const sql = "SELECT '@notAVar' FROM t -- @alsoNot\nWHERE x = @real"

    // When
    const names = findVariableReferences(sql)

    // Then
    expect([...names]).toEqual(["real"])
  })
})

describe("referencesAny", () => {
  it("matches case-insensitively against the given names", () => {
    expect(referencesAny("SELECT @timeFrom", ["TIMEFROM"])).toBe(true)
    expect(referencesAny("SELECT 1", ["timeFrom"])).toBe(false)
  })
})

describe("variableReferences", () => {
  it("reads a list's query and its custom All value", () => {
    // Given
    const list: NotebookVariable = {
      name: "pair",
      kind: "list",
      source: {
        type: "query",
        query: "SELECT symbol FROM t",
      },
      sort: "none",
      multi: true,
      includeAll: true,
      all: { mode: "custom", value: "@venue" },
      selected: "all",
    }

    // When / Then
    expect([...variableReferences(list)]).toEqual(["venue"])
  })
})

describe("referencedDeclareEntries", () => {
  it("keeps the referenced entries and the entries their values reference, in order", () => {
    // Given
    const entries = [
      { name: "timeTo", value: "now()" },
      { name: "timeFrom", value: "dateadd('h', -1, @timeTo)" },
      { name: "timeFilter", value: "interval(@timeFrom, @timeTo)" },
      { name: "pair", value: "('EURUSD', 'GBPUSD')" },
      { name: "venue", value: "'LSE'" },
    ]

    // When
    const kept = referencedDeclareEntries(
      "SELECT symbol FROM t WHERE ts IN @TimeFilter AND venue = @venue",
      entries,
    )

    // Then
    expect(kept.map((e) => e.name)).toEqual([
      "timeTo",
      "timeFrom",
      "timeFilter",
      "venue",
    ])
  })

  it("returns nothing for a query without references", () => {
    expect(
      referencedDeclareEntries("SELECT 1", [{ name: "pair", value: "1" }]),
    ).toEqual([])
  })
})
