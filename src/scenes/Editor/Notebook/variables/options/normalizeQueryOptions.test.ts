import { describe, expect, it } from "vitest"
import type { ListVariable } from "../../../../../store/notebook"
import { normalizeQueryOptions, type QueryRows } from "./normalizeQueryOptions"

const queryList = (
  source: Partial<Extract<ListVariable["source"], { type: "query" }>> = {},
  overrides: Partial<Omit<ListVariable, "source">> = {},
): ListVariable & { source: { type: "query" } } => ({
  name: "symbol",
  kind: "list",
  source: {
    type: "query",
    query: "SELECT symbol FROM t",
    refresh: "onLoad",
    ...source,
  },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
  ...overrides,
})

const rows = (
  columns: { name: string; type: string }[],
  data: (string | number | null)[][],
  truncated = false,
): QueryRows => ({ columns, rows: data, truncated })

describe("normalizeQueryOptions", () => {
  it("quotes text values as SQL literals and keeps the plain text as label", () => {
    // Given
    const result = rows(
      [
        { name: "symbol", type: "SYMBOL" },
        { name: "name", type: "VARCHAR" },
      ],
      [
        ["EURUSD", "Euro"],
        ["GBPUSD", "Cable"],
      ],
    )

    // When
    const normalized = normalizeQueryOptions(result, queryList())

    // Then
    expect(normalized.options).toEqual([
      { value: "'EURUSD'", label: "EURUSD" },
      { value: "'GBPUSD'", label: "GBPUSD" },
    ])
  })

  it("keeps numeric values bare and uses the chosen column as label", () => {
    // Given
    const result = rows(
      [
        { name: "id", type: "LONG" },
        { name: "name", type: "VARCHAR" },
      ],
      [
        [1, "one"],
        [2, "two"],
      ],
    )

    // When
    const normalized = normalizeQueryOptions(
      result,
      queryList({ labelColumn: "name" }),
    )

    // Then
    expect(normalized.options).toEqual([
      { value: "1", label: "one" },
      { value: "2", label: "two" },
    ])
  })

  it("doubles a quote inside a text value", () => {
    // Given
    const result = rows([{ name: "s", type: "STRING" }], [["O'Hara"]])

    // Then
    expect(normalizeQueryOptions(result, queryList()).options).toEqual([
      { value: "'O''Hara'", label: "O'Hara" },
    ])
  })

  it("drops nulls, dedupes, and reports each as a warning with truncation", () => {
    // Given
    const result = rows(
      [{ name: "s", type: "STRING" }],
      [["a"], [null], ["a"], ["b"]],
      true,
    )

    // When
    const normalized = normalizeQueryOptions(result, queryList())

    // Then
    expect(normalized.options.map((o) => o.label)).toEqual(["a", "b"])
    expect(normalized.warnings).toHaveLength(3)
    expect(normalized.warnings[0]).toContain("More than 10,000 values")
    expect(normalized.warnings[1]).toContain("1 duplicate value removed")
    expect(normalized.warnings[2]).toContain("1 null value skipped")
  })

  it("applies the regex and sort of the variable", () => {
    // Given
    const result = rows(
      [{ name: "s", type: "SYMBOL" }],
      [["GBPUSD"], ["EURUSD"], ["USDJPY"]],
    )

    // When
    const normalized = normalizeQueryOptions(
      result,
      queryList({ regex: "USD$" }, { sort: "alphaAsc" }),
    )

    // Then
    expect(normalized.options.map((o) => o.value)).toEqual([
      "'EURUSD'",
      "'GBPUSD'",
    ])
  })
})
