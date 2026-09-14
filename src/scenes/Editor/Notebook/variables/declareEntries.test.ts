import { describe, expect, it } from "vitest"
import type { ListVariable, NotebookVariable } from "../../../../store/notebook"
import {
  buildDeclareEntries,
  declareEntriesAbove,
  variableToDeclareEntry,
} from "./declareEntries"

const customList = (overrides: Partial<ListVariable>): ListVariable => ({
  name: "symbol",
  kind: "list",
  source: { type: "custom", entries: "'EURUSD', 'GBPUSD', 'O''Hara'" },
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected: "all",
  ...overrides,
})

const queryList = (overrides: Partial<ListVariable>): ListVariable =>
  customList({
    name: "id",
    source: { type: "query", query: "SELECT id FROM t", refresh: "onLoad" },
    ...overrides,
  })

const entry = (variable: NotebookVariable) =>
  variableToDeclareEntry(variable, {})

describe("variableToDeclareEntry", () => {
  it("passes an expression through and omits an empty one", () => {
    expect(
      entry({
        name: "from",
        kind: "expression",
        value: "dateadd('d', -7, now())",
      }),
    ).toEqual({ name: "from", value: "dateadd('d', -7, now())" })
    expect(entry({ name: "from", kind: "expression", value: "  " })).toBeNull()
  })

  it("inserts a text value exactly as written and omits an empty one", () => {
    expect(entry({ name: "who", kind: "text", value: "'O''Hara'" })).toEqual({
      name: "who",
      value: "'O''Hara'",
    })
    expect(entry({ name: "iv", kind: "text", value: "5m" })).toEqual({
      name: "iv",
      value: "5m",
    })
    expect(entry({ name: "iv", kind: "text", value: "  " })).toBeNull()
  })

  it("renders a single selection as a scalar", () => {
    // Given
    const variable = customList({
      selected: [{ value: "'EURUSD'", label: "EURUSD" }],
    })

    // When / Then
    expect(entry(variable)).toEqual({ name: "symbol", value: "'EURUSD'" })
  })

  it("renders several selections as a bracket list", () => {
    // Given
    const variable = customList({
      selected: [
        { value: "'EURUSD'", label: "EURUSD" },
        { value: "'O''Hara'", label: "O'Hara" },
      ],
    })

    // When / Then
    expect(entry(variable)).toEqual({
      name: "symbol",
      value: "('EURUSD', 'O''Hara')",
    })
  })

  it("renders All as the full custom option list", () => {
    expect(entry(customList({ selected: "all" }))).toEqual({
      name: "symbol",
      value: "('EURUSD', 'GBPUSD', 'O''Hara')",
    })
  })

  it("renders All as the custom value exactly as written", () => {
    expect(
      entry(
        customList({ selected: "all", all: { mode: "custom", value: "'.*'" } }),
      ),
    ).toEqual({ name: "symbol", value: "'.*'" })
    expect(
      entry(
        customList({ selected: "all", all: { mode: "custom", value: " " } }),
      ),
    ).toBeNull()
  })

  it("omits a list with nothing selected", () => {
    expect(entry(customList({ selected: [] }))).toBeNull()
  })

  it("omits a query list whose options are not loaded", () => {
    expect(entry(queryList({ selected: "all" }))).toBeNull()
  })

  it("renders a query list from its loaded literals exactly as fetched", () => {
    // Given
    const variable = queryList({ selected: "all" })
    const listOptions = {
      id: {
        options: [
          { value: "'EURUSD'", label: "EURUSD" },
          { value: "42", label: "42" },
        ],
      },
    }

    // When
    const declared = variableToDeclareEntry(variable, listOptions)

    // Then
    expect(declared).toEqual({ name: "id", value: "('EURUSD', 42)" })
  })
})

describe("buildDeclareEntries", () => {
  it("puts the time built-ins before user variables and skips omitted ones", () => {
    // Given
    const settings = {
      timeRange: { from: "now-1h", to: "now" },
      variables: [
        { name: "side", kind: "text" as const, value: "'BUY'" },
        customList({ selected: [] }),
      ],
    }

    // When
    const names = buildDeclareEntries(settings).map((e) => e.name)

    // Then
    expect(names).toEqual(["timeTo", "timeFrom", "timeFilter", "side"])
  })

  it("returns nothing without a time range or variables", () => {
    expect(buildDeclareEntries({})).toEqual([])
  })

  it("declares globals after the time built-ins and lets a notebook variable override one", () => {
    // Given
    const globalEntries = [
      { name: "side", value: "'SELL'" },
      { name: "venue", value: "'LSE'" },
    ]
    const settings = {
      timeRange: { from: "now-1h", to: "now" },
      variables: [{ name: "side", kind: "text" as const, value: "'BUY'" }],
    }

    // When
    const entries = buildDeclareEntries(settings, {}, globalEntries)

    // Then
    expect(entries.map((e) => e.name)).toEqual([
      "timeTo",
      "timeFrom",
      "timeFilter",
      "venue",
      "side",
    ])
    expect(entries.find((e) => e.name === "side")?.value).toBe("'BUY'")
  })
})

describe("declareEntriesAbove", () => {
  it("declares the time built-ins, the globals and only the variables defined before the name", () => {
    // Given
    const settings = {
      timeRange: { from: "now-1h", to: "now" },
      variables: [
        { name: "side", kind: "text" as const, value: "'BUY'" },
        queryList({ name: "pair" }),
        { name: "after", kind: "text" as const, value: "'x'" },
      ],
    }
    const listOptions = {
      pair: { options: [{ value: "'EURUSD'", label: "EURUSD" }] },
    }
    const globalEntries = [{ name: "venue", value: "'LSE'" }]

    // When
    const names = declareEntriesAbove(
      settings,
      listOptions,
      globalEntries,
      "pair",
    ).map((e) => e.name)

    // Then
    expect(names).toEqual(["timeTo", "timeFrom", "timeFilter", "venue", "side"])
  })
})
