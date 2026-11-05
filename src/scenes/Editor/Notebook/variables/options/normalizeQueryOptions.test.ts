import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  ListVariable,
  VariableOption,
} from "../../../../../store/notebook"
import { compileRegex, matchOption } from "../listOptions"
import { normalizeQueryOptions, type QueryRows } from "./normalizeQueryOptions"

const { filterOptionsWithRegex } = vi.hoisted(() => ({
  filterOptionsWithRegex: vi.fn(),
}))

vi.mock("./regexFilter", () => ({ filterOptionsWithRegex }))

const filterOnTestThread = (options: VariableOption[], pattern?: string) => {
  const regex = pattern ? compileRegex(pattern) : null
  return Promise.resolve({
    kind: "ready",
    options: regex
      ? options.flatMap((option) => matchOption(option, regex) ?? [])
      : options,
  })
}

beforeEach(() => {
  filterOptionsWithRegex.mockImplementation(filterOnTestThread)
})

const queryList = (
  source: Partial<Extract<ListVariable["source"], { type: "query" }>> = {},
  overrides: Partial<Omit<ListVariable, "source">> = {},
): ListVariable & { source: { type: "query" } } => ({
  name: "symbol",
  kind: "list",
  source: {
    type: "query",
    query: "SELECT symbol FROM t",
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

const normalize = async (
  result: QueryRows,
  variable: ListVariable & { source: { type: "query" } },
) => {
  const normalized = await normalizeQueryOptions(
    result,
    variable,
    new AbortController().signal,
  )
  if (normalized.kind === "error") throw new Error(normalized.error)
  return normalized
}

describe("normalizeQueryOptions", () => {
  it("quotes text values as SQL literals and keeps the plain text as label", async () => {
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
    const normalized = await normalize(result, queryList())

    // Then
    expect(normalized.options).toEqual([
      { value: "'EURUSD'", label: "EURUSD" },
      { value: "'GBPUSD'", label: "GBPUSD" },
    ])
  })

  it("keeps numeric values bare and uses the chosen column as label", async () => {
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
    const normalized = await normalize(
      result,
      queryList({ labelColumn: "name" }),
    )

    // Then
    expect(normalized.options).toEqual([
      { value: "1", label: "one" },
      { value: "2", label: "two" },
    ])
  })

  it("doubles a quote inside a text value", async () => {
    // Given
    const result = rows([{ name: "s", type: "STRING" }], [["O'Hara"]])

    // Then
    expect((await normalize(result, queryList())).options).toEqual([
      { value: "'O''Hara'", label: "O'Hara" },
    ])
  })

  it("drops nulls, dedupes, and reports each as a warning with truncation", async () => {
    // Given
    const result = rows(
      [{ name: "s", type: "STRING" }],
      [["a"], [null], ["a"], ["b"]],
      true,
    )

    // When
    const normalized = await normalize(result, queryList())

    // Then
    expect(normalized.options.map((o) => o.label)).toEqual(["a", "b"])
    expect(normalized.warnings).toHaveLength(3)
    expect(normalized.warnings[0]).toContain("More than 10,000 values")
    expect(normalized.warnings[1]).toContain("1 duplicate value removed")
    expect(normalized.warnings[2]).toContain("1 null value skipped")
  })

  it("applies the regex and sort of the variable", async () => {
    // Given
    const result = rows(
      [{ name: "s", type: "SYMBOL" }],
      [["GBPUSD"], ["EURUSD"], ["USDJPY"]],
    )

    // When
    const normalized = await normalize(
      result,
      queryList({ regex: "USD$" }, { sort: "alphaAsc" }),
    )

    // Then
    expect(normalized.options.map((o) => o.value)).toEqual([
      "'EURUSD'",
      "'GBPUSD'",
    ])
  })

  it("returns the filter error and skips the remaining steps", async () => {
    // Given
    filterOptionsWithRegex.mockResolvedValue({
      kind: "error",
      error: "too slow",
    })
    const result = rows([{ name: "s", type: "SYMBOL" }], [["EURUSD"]])

    // When
    const normalized = await normalizeQueryOptions(
      result,
      queryList({ regex: "USD$" }),
      new AbortController().signal,
    )

    // Then
    expect(normalized).toEqual({ kind: "error", error: "too slow" })
  })
})
