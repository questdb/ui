import { describe, it, expect } from "vitest"
import { resultsEquivalent, successResults } from "./drawCanvasUtils"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"

const dql = (
  columns: { name: string; type: string }[],
  dataset: (number | string | boolean | null)[][],
  query = "q",
): QueryExecResult => ({
  type: "dql",
  query,
  columns,
  dataset,
  count: dataset.length,
})

describe("successResults", () => {
  it("keeps only DQL with non-empty datasets", () => {
    const rows: (QueryExecResult | null)[] = [
      dql([{ name: "x", type: "INT" }], [[1]]),
      null,
      { type: "error", query: "bad", columns: [], dataset: [], count: 0 },
      dql([{ name: "y", type: "INT" }], []),
      {
        type: "ddl",
        query: "CREATE TABLE x (y INT)",
        columns: [],
        dataset: [],
        count: 0,
      },
    ]
    expect(successResults(rows)).toHaveLength(1)
    expect(successResults(rows)[0].columns[0].name).toBe("x")
  })

  it("returns empty when nothing qualifies", () => {
    expect(successResults([null, null])).toEqual([])
    expect(successResults([])).toEqual([])
  })
})

describe("resultsEquivalent", () => {
  it("returns false on length mismatch", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1]])]
    const b: QueryExecResult[] = []
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns true for identical shape + values", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [2], [3]])]
    const b = [dql([{ name: "x", type: "INT" }], [[1], [2], [3]])]
    expect(resultsEquivalent(a, b)).toBe(true)
  })

  it("returns false when column names differ", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1]])]
    const b = [dql([{ name: "y", type: "INT" }], [[1]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns false when column count differs", () => {
    const a = [
      dql(
        [
          { name: "x", type: "INT" },
          { name: "y", type: "INT" },
        ],
        [[1, 2]],
      ),
    ]
    const b = [dql([{ name: "x", type: "INT" }], [[1]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns false when dataset length differs", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [2]])]
    const b = [dql([{ name: "x", type: "INT" }], [[1]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns true when both datasets are empty (no rows to compare)", () => {
    const a = [dql([{ name: "x", type: "INT" }], [])]
    const b = [dql([{ name: "x", type: "INT" }], [])]
    expect(resultsEquivalent(a, b)).toBe(true)
  })

  it("returns false when first row differs but length matches", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [9]])]
    const b = [dql([{ name: "x", type: "INT" }], [[2], [9]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns false when last row differs", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [2], [9]])]
    const b = [dql([{ name: "x", type: "INT" }], [[1], [2], [10]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("does not compare middle rows (shape+endpoints heuristic)", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [2], [3]])]
    const b = [dql([{ name: "x", type: "INT" }], [[1], [99], [3]])]
    expect(resultsEquivalent(a, b)).toBe(true)
  })

  it("compares multiple results side-by-side", () => {
    const a = [
      dql([{ name: "x", type: "INT" }], [[1]]),
      dql([{ name: "y", type: "INT" }], [[2]]),
    ]
    const b = [
      dql([{ name: "x", type: "INT" }], [[1]]),
      dql([{ name: "y", type: "INT" }], [[2]]),
    ]
    expect(resultsEquivalent(a, b)).toBe(true)
  })

  it("handles null cell values", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[null], [null]])]
    const b = [dql([{ name: "x", type: "INT" }], [[null], [null]])]
    expect(resultsEquivalent(a, b)).toBe(true)

    const c = [dql([{ name: "x", type: "INT" }], [[null], [null]])]
    const d = [dql([{ name: "x", type: "INT" }], [[null], [1]])]
    expect(resultsEquivalent(c, d)).toBe(false)
  })
})
