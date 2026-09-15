import { describe, expect, it } from "vitest"
import type { ListVariable, NotebookVariable } from "../../../../store/notebook"
import {
  changedVariableNames,
  firstRedefinedIndex,
  redefinedVariableNames,
  variablesEqual,
} from "./variableChanges"

const text = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "text",
  value,
})

describe("changedVariableNames", () => {
  it("marks reordered variables for saving and dependency updates", () => {
    // Given
    const before = [text("a", "1"), text("b", "@a + 1"), text("c", "3")]
    const after = [before[1], before[0], before[2]]

    // When
    const changed = changedVariableNames(before, after)
    const redefined = redefinedVariableNames(before, after)

    // Then
    expect(changed).toEqual(["b", "a"])
    expect(redefined).toEqual(["b", "a"])
  })

  it("lists edited, added and removed names once", () => {
    // Given
    const before = [text("a", "1"), text("b", "2"), text("gone", "3")]
    const after = [text("a", "1"), text("b", "changed"), text("added", "4")]

    // When
    const changed = changedVariableNames(before, after)

    // Then
    expect(changed.sort()).toEqual(["added", "b", "gone"])
  })
})

const list = (
  source: ListVariable["source"],
  selected: ListVariable["selected"],
): ListVariable => ({
  name: "l",
  kind: "list",
  source,
  sort: "none",
  multi: true,
  includeAll: true,
  all: { mode: "list" },
  selected,
})

describe("variablesEqual", () => {
  it("ignores key order and flags a different value", () => {
    const a: NotebookVariable = {
      name: "x",
      kind: "text",
      value: "1",
    }
    const b: NotebookVariable = {
      value: "1",
      kind: "text",
      name: "x",
    }
    expect(variablesEqual([a], [b])).toBe(true)
    expect(variablesEqual([a], [text("x", "2")])).toBe(false)
  })

  it("sees a change inside the source or the selection", () => {
    // Given
    const custom = list({ type: "custom", entries: "a, b" }, "all")
    const query = list(
      { type: "query", query: "SELECT a", refresh: "onLoad" },
      "all",
    )
    const picked = list({ type: "custom", entries: "a, b" }, [
      { value: "a", label: "a" },
    ])

    // Then
    expect(variablesEqual([custom], [query])).toBe(false)
    expect(variablesEqual([custom], [picked])).toBe(false)
    expect(changedVariableNames([custom], [picked])).toEqual(["l"])
  })
})

describe("redefinedVariableNames", () => {
  it("ignores a changed selection but sees a changed definition", () => {
    // Given
    const pair: ListVariable = {
      name: "pair",
      kind: "list",
      source: { type: "custom", entries: "'EURUSD', 'GBPUSD'" },
      sort: "none",
      multi: true,
      includeAll: true,
      all: { mode: "list" },
      selected: "all",
    }
    const before = [pair]
    const reselected = [
      { ...pair, selected: [{ value: "'EURUSD'", label: "EURUSD" }] },
    ]
    const resorted = [{ ...pair, sort: "alphaAsc" as const }]

    // Then
    expect(redefinedVariableNames(before, reselected)).toEqual([])
    expect(redefinedVariableNames(before, resorted)).toEqual(["pair"])
  })
})

describe("firstRedefinedIndex", () => {
  it("points at the first position whose definition differs", () => {
    // Given
    const before = [text("a", "1"), text("b", "2"), text("c", "3")]

    // When / Then
    expect(firstRedefinedIndex(before, before)).toBe(3)
    expect(
      firstRedefinedIndex(before, [
        text("a", "1"),
        text("c", "3"),
        text("b", "2"),
      ]),
    ).toBe(1)
    expect(firstRedefinedIndex(before, [text("b", "2"), text("c", "3")])).toBe(
      0,
    )
    expect(firstRedefinedIndex(before, [text("a", "1"), text("b", "2")])).toBe(
      2,
    )
    expect(firstRedefinedIndex(before, [...before, text("d", "4")])).toBe(3)
  })

  it("ignores a changed selection", () => {
    // Given
    const before = [list({ type: "custom", entries: "x" }, "all")]
    const after = [
      list({ type: "custom", entries: "x" }, [{ value: "'x'", label: "x" }]),
    ]

    // When / Then
    expect(firstRedefinedIndex(before, after)).toBe(1)
  })
})
