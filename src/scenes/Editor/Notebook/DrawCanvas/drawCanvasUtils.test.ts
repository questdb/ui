import { describe, it, expect } from "vitest"
import {
  resolveDraw,
  resultMatchesQueries,
  resultsEquivalent,
  successResults,
  toExecResult,
} from "./drawCanvasUtils"
import type { QueryExecResult } from "../../../../hooks/useQueryExecution"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { ChartConfig } from "../CellChart/chartTypes"

const dql = (
  columns: ColumnDefinition[],
  dataset: (number | string | boolean | null)[][],
  query = "q",
): QueryExecResult => ({
  type: "dql",
  query,
  columns,
  dataset,
  count: dataset.length,
})

const errorResult = (error: string, query = "q"): QueryExecResult => ({
  type: "error",
  query,
  columns: [],
  dataset: [],
  count: 0,
  error,
})

const cellResult = (queries: string[]): CellResult => ({
  results: queries.map((query) => ({
    type: "dql",
    query,
    columns: [],
    dataset: [],
    count: 0,
  })),
  activeResultIndex: 0,
  timestamp: 0,
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

  it("returns false when normalized query identity differs", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1]], "SELECT 1 AS x")]
    const b = [dql([{ name: "x", type: "INT" }], [[1]], "SELECT 2 AS x")]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("ignores parser-only query formatting differences", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1]], " SELECT 1;\n")]
    const b = [dql([{ name: "x", type: "INT" }], [[1]], "SELECT 1")]
    expect(resultsEquivalent(a, b)).toBe(true)
  })

  it("returns false when result counts differ", () => {
    const a = dql([{ name: "x", type: "INT" }], [[1]])
    const b = { ...a, count: 2 }
    expect(resultsEquivalent([a], [b])).toBe(false)
  })

  it("returns false when column names differ", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1]])]
    const b = [dql([{ name: "y", type: "INT" }], [[1]])]
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns false when column metadata differs", () => {
    const rows = [[1]]
    const base = dql([{ name: "x", type: "INT", dim: 1 }], rows)
    expect(
      resultsEquivalent(
        [base],
        [dql([{ name: "x", type: "LONG", dim: 1 }], rows)],
      ),
    ).toBe(false)
    expect(
      resultsEquivalent(
        [base],
        [dql([{ name: "x", type: "INT", dim: 2 }], rows)],
      ),
    ).toBe(false)
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

  it("returns false when a middle row differs (full deep compare)", () => {
    const a = [dql([{ name: "x", type: "INT" }], [[1], [2], [3]])]
    const b = [dql([{ name: "x", type: "INT" }], [[1], [99], [3]])]
    expect(resultsEquivalent(a, b)).toBe(false)
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

  it("returns false when one frame is DQL and the other is an error", () => {
    // Given a DQL frame and an error frame (both with no rows)
    const a = [dql([{ name: "x", type: "INT" }], [])]
    const b = [errorResult("boom")]
    // When compared
    // Then they are not equivalent — the type differs, so the mirror must update
    expect(resultsEquivalent(a, b)).toBe(false)
  })

  it("returns false when two error frames carry different messages", () => {
    // Given two error frames with the same (empty) shape but different messages
    // When compared
    // Then a changed error message is not treated as equivalent
    expect(
      resultsEquivalent([errorResult("boom")], [errorResult("bang")]),
    ).toBe(false)
  })

  it("returns true for two identical error frames", () => {
    // Given two error frames with the same message
    // Then they are equivalent (no redundant mirror write)
    expect(
      resultsEquivalent([errorResult("boom")], [errorResult("boom")]),
    ).toBe(true)
  })
})

describe("resultMatchesQueries", () => {
  it("matches when count and per-statement query text are identical", () => {
    // Given a result produced by exactly these two queries
    const result = cellResult(["select a", "select b"])
    // When checked against the same query list
    // Then it matches — safe to transfer into the chart without re-querying
    expect(resultMatchesQueries(result, ["select a", "select b"])).toBe(true)
  })

  it("rejects a result left over from edited-but-not-rerun SQL", () => {
    // Given a result for the previous query text
    const result = cellResult(["select a"])
    // When the current SQL differs
    // Then it does not match — the chart must re-fetch
    expect(resultMatchesQueries(result, ["select a WHERE x > 0"])).toBe(false)
  })

  it("matches when the stored query carries a trailing semicolon/whitespace the parse drops", () => {
    // Given a grid result that stored the raw cell value verbatim
    // When compared against the parsed (trimmed, semicolon-stripped) query
    // Then it still matches — the chart transfers instead of re-querying
    expect(resultMatchesQueries(cellResult(["SELECT 1;"]), ["SELECT 1"])).toBe(
      true,
    )
    expect(
      resultMatchesQueries(cellResult(["  SELECT 1\n"]), ["SELECT 1"]),
    ).toBe(true)
  })

  it("rejects on statement-count mismatch", () => {
    // Given a single-statement result
    const result = cellResult(["select a"])
    // When the current SQL has two statements
    // Then it does not match
    expect(resultMatchesQueries(result, ["select a", "select b"])).toBe(false)
  })

  it("rejects a byte-truncated result even when its query matches", () => {
    const result = cellResult(["select a"])
    const first = result.results[0]
    if (first.type !== "dql") throw new Error("expected dql")
    first.truncated = true
    expect(resultMatchesQueries(result, ["select a"])).toBe(false)
  })

  it("rejects a null/undefined result", () => {
    // Given no existing result
    // Then there is nothing to transfer
    expect(resultMatchesQueries(null, ["select a"])).toBe(false)
    expect(resultMatchesQueries(undefined, ["select a"])).toBe(false)
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

describe("toExecResult", () => {
  it("maps a DQL snapshot entry to a chartable QueryExecResult", () => {
    const snap: SingleQueryResult = {
      type: "dql",
      query: "select x",
      columns: [{ name: "x", type: "INT" }],
      dataset: [[1], [2]],
      count: 2,
    }
    const exec = toExecResult(snap)
    expect(exec.type).toBe("dql")
    expect(exec.dataset).toEqual([[1], [2]])
    expect(exec.columns).toEqual([{ name: "x", type: "INT" }])
    // round-trips through successResults (DQL with rows survives)
    expect(successResults([exec])).toHaveLength(1)
  })

  it("maps non-DQL/transient entries to empty results that successResults drops", () => {
    const entries: SingleQueryResult[] = [
      { type: "ddl", query: "create table t (x int)" },
      { type: "error", query: "bad", error: "boom" },
      { type: "cancelled", query: "c" },
    ]
    const execs = entries.map(toExecResult)
    expect(execs.every((e) => e.dataset.length === 0)).toBe(true)
    expect(successResults(execs)).toHaveLength(0)
  })
})
