import { describe, expect, it } from "vitest"
import { normalizeVariableList, normalizeVariables } from "./normalizeVariables"

describe("normalizeVariables", () => {
  it("reads legacy {name, value} rows as expression variables", () => {
    // Given
    const persisted = [{ name: "from", value: "dateadd('d', -7, now())" }]

    // When
    const variables = normalizeVariables(persisted)

    // Then
    expect(variables).toEqual([
      {
        name: "from",
        kind: "expression",
        value: "dateadd('d', -7, now())",
        label: undefined,
        description: undefined,
      },
    ])
  })

  it("reads the legacy name-to-value map", () => {
    // Given
    const persisted = { side: "'BUY'", limit: "10" }

    // When
    const names = normalizeVariables(persisted).map(
      (v) => `${v.name}:${v.kind}`,
    )

    // Then
    expect(names).toEqual(["side:expression", "limit:expression"])
  })

  it("fills list defaults and keeps the selection when All is allowed", () => {
    // Given
    const persisted = [
      {
        name: "symbol",
        kind: "list",
        source: { type: "custom", entries: "a, b" },
        includeAll: true,
      },
    ]

    // When
    const [variable] = normalizeVariables(persisted)

    // Then
    expect(variable).toMatchObject({
      kind: "list",
      source: { type: "custom", entries: "a, b" },
      sort: "none",
      multi: false,
      includeAll: true,
      all: { mode: "list" },
      selected: "all",
    })
  })

  it("drops an All selection when All is not allowed", () => {
    // Given
    const persisted = [
      {
        name: "symbol",
        kind: "list",
        source: { type: "query", query: "SELECT DISTINCT symbol FROM trades" },
        selected: "all",
      },
    ]

    // When
    const [variable] = normalizeVariables(persisted)

    // Then
    expect(variable).toMatchObject({
      source: { type: "query", refresh: "onLoad" },
      selected: [],
    })
  })

  it("drops rows with an unknown kind or a missing source", () => {
    // Given
    const persisted = [
      { name: "a", kind: "interval", value: "5m" },
      { name: "b", kind: "list" },
      { name: "c", kind: "text", value: "x" },
    ]

    // When
    const names = normalizeVariables(persisted).map((v) => v.name)

    // Then
    expect(names).toEqual(["c"])
  })
})

describe("normalizeVariableList", () => {
  it("returns the readable variables and names the dropped entries", () => {
    // When
    const result = normalizeVariableList([
      { name: "venue", kind: "text", value: "'LSE'" },
      { name: "broken", kind: "list", source: {} },
      { kind: "text", value: "x" },
    ])

    // Then
    expect(result.variables.map((v) => v.name)).toEqual(["venue"])
    expect(result.dropped).toEqual(["broken", "unnamed"])
  })
})
