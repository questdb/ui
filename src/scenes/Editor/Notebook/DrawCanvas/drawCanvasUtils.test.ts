import { describe, it, expect } from "vitest"
import {
  resolveDraw,
  resultsEquivalent,
  successResults,
} from "./drawCanvasUtils"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { ChartConfig } from "../CellChart/chartTypes"

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

describe("resolveDraw — unresolved statements use a null slot, not an inert config", () => {
  const tsPrice = (query: string) =>
    dql(
      [
        { name: "ts", type: "TIMESTAMP" },
        { name: "price", type: "DOUBLE" },
      ],
      [[1000, 5]],
      query,
    )

  it("writes null (not {type:'line',yColumns:[]}) for a statement that hasn't resolved", () => {
    const statements = ["SELECT ts, price FROM a", "SELECT ts, price FROM b"]
    // Only the 2nd statement resolved; the 1st is still awaiting a result.
    const results = [tsPrice("SELECT ts, price FROM b")]
    const { effectiveConfig } = resolveDraw(statements, results, undefined)
    // Slot 0 has no result and nothing saved → null, so a Save can't bake in a
    // blank placeholder that would later suppress inference.
    expect(effectiveConfig.queries[0]).toBeNull()
    expect(effectiveConfig.queries[1]).not.toBeNull()
  })

  it("a saved null does not suppress inference once the statement resolves", () => {
    const statements = ["SELECT ts, price FROM a", "SELECT ts, price FROM b"]
    // Config saved earlier while statement 0 was unresolved → its slot is null.
    const saved: ChartConfig = {
      xColumn: "ts",
      queries: [null, { type: "line", yColumns: ["price"] }],
    }
    // Both statements now return rows.
    const results = [
      tsPrice("SELECT ts, price FROM a"),
      tsPrice("SELECT ts, price FROM b"),
    ]
    const { renderQueries } = resolveDraw(statements, results, saved)
    const q0 = renderQueries.find((q) => q.index === 0)
    // Inference ran for slot 0 (yColumns populated) — not a blank render.
    expect(q0?.yColumns).toEqual(["price"])
  })
})
