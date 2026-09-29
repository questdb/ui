import { describe, expect, it } from "vitest"
import type { CellResult, SingleQueryResult } from "../../../store/notebook"
import {
  derivePositionalFrame,
  deriveStatementFrame,
  reconcileCellResultForValue,
  reconcileResultsForStatements,
  resolveActiveStatementSql,
  snapshotResultsMatchQueries,
  statementKeysFor,
} from "./statementIdentity"

describe("snapshotResultsMatchQueries", () => {
  const dql = (query: string): SingleQueryResult => ({
    type: "dql",
    query,
    columns: [],
    dataset: [],
    count: 0,
  })

  it("matches when results line up 1-1 with the queries, ignoring surrounding whitespace and trailing semicolons", () => {
    // Given a snapshot whose result queries match the cell's statements modulo trimming
    const results = [dql("SELECT 1"), dql("SELECT 2")]

    // When compared to the cell's current queries
    // Then it faithfully represents the cell
    expect(
      snapshotResultsMatchQueries(results, ["  SELECT 1 ;", "SELECT 2"]),
    ).toBe(true)
  })

  it("rejects a snapshot whose result count differs from the query count", () => {
    // Given a snapshot with fewer results than the cell now has queries
    const results = [dql("SELECT 1")]

    // When compared to a two-statement cell
    // Then it must not be carried into the duplicate
    expect(snapshotResultsMatchQueries(results, ["SELECT 1", "SELECT 2"])).toBe(
      false,
    )
  })

  it("rejects a snapshot whose query text has since diverged", () => {
    // Given a snapshot taken before the cell's SQL was edited
    const results = [dql("SELECT 1")]

    // When compared to the edited query
    // Then the stale rows are skipped
    expect(snapshotResultsMatchQueries(results, ["SELECT 2"])).toBe(false)
  })

  it("rejects a keyword casing or inner whitespace change", () => {
    // Given a snapshot for a lowercase single-line statement
    const results = [dql("select a from t where b > 1")]

    // When the statement is re-cased or re-spaced
    // Then the snapshot no longer represents the cell
    expect(
      snapshotResultsMatchQueries(results, ["SELECT a FROM t WHERE b > 1"]),
    ).toBe(false)
    expect(
      snapshotResultsMatchQueries(results, ["select a  from t where b > 1"]),
    ).toBe(false)
  })

  it("rejects an empty snapshot", () => {
    // Given a cell with no queries and a snapshot with no results
    // When compared
    // Then there is nothing to present
    expect(snapshotResultsMatchQueries([], [])).toBe(false)
  })
})

const dqlResult = (query: string, count = 1): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [{ name: "x", type: "INT" }],
  dataset: [[count]],
  count,
})

const resultOf = (
  results: SingleQueryResult[],
  extra: Partial<CellResult> = {},
): CellResult => ({
  results,
  activeResultIndex: 0,
  timestamp: 0,
  ...extra,
})

describe("statementKeysFor", () => {
  it("keys a statement by its trimmed text and numbers duplicates by occurrence", () => {
    // Given statements that differ only by surrounding whitespace, plus a duplicate
    const keys = statementKeysFor(["select 1", "  select 1;", "select 2"])

    // Then trimming folds the first two into one identity, told apart by occurrence
    expect(keys).toEqual([
      "select 1\u00010",
      "select 1\u00011",
      "select 2\u00010",
    ])
  })

  it("keeps keyword casing and inner whitespace as part of the identity", () => {
    // Given the same SQL in two presentations
    const [lower, upper, spaced] = statementKeysFor([
      "select 1",
      "SELECT 1",
      "select  1",
    ])

    // Then each is its own statement
    expect(new Set([lower, upper, spaced]).size).toBe(3)
  })
})

describe("reconcileResultsForStatements — content carryover", () => {
  it("keeps results for unchanged statements across surrounding whitespace and semicolon edits", () => {
    // Given a two-statement frame
    const previous = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")])

    // When the statements only gain surrounding whitespace and semicolons
    const reconciled = reconcileResultsForStatements(
      ["  SELECT 1;", "SELECT 2  "],
      previous,
    )

    // Then both results survive untouched, in statement order
    expect(reconciled?.results).toEqual(previous.results)
    expect(reconciled?.allResultsKept).toBe(true)
  })

  it("drops the result of a statement whose casing or inner whitespace changed", () => {
    // Given a result for a lowercase single-line statement
    const previous = resultOf([
      dqlResult("select * from trades where sym = 'A'"),
    ])

    // When the statement is reformatted
    // Then nothing survives: the statement must run again
    expect(
      reconcileResultsForStatements(
        ["SELECT  *\nFROM trades WHERE sym='A';"],
        previous,
      ),
    ).toBeNull()
  })

  it("keeps the script summary when every result survives and drops it when a slot is lost", () => {
    // Given a settled two-statement frame with a script summary
    const script = { successCount: 2, failedCount: 0, durationMs: 12 }
    const settled = resultOf([dqlResult("select 1"), dqlResult("select 2")], {
      script,
    })

    // When only a trailing semicolon is added, the counts still describe the frame
    const kept = reconcileCellResultForValue(settled, "select 1;\nselect 2;")
    // Then the summary stays
    expect(kept?.script).toEqual(script)

    // When a statement is edited away, the counts no longer do
    const shrunk = reconcileCellResultForValue(settled, "select 1")
    // Then the summary is dropped
    expect(shrunk?.script).toBeUndefined()
  })

  it("drops an edited statement's result and keeps its siblings", () => {
    // Given results for two statements
    const previous = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")])
    // When the second statement is edited
    const reconciled = reconcileResultsForStatements(
      ["SELECT 1", "SELECT 999"],
      previous,
    )
    // Then only the untouched statement keeps its result
    expect(reconciled?.results.map((r) => r.query)).toEqual(["SELECT 1"])
    expect(reconciled?.allResultsKept).toBe(false)
  })

  it("matches duplicate statements by occurrence order", () => {
    // Given two identical statements with distinct results
    const previous = resultOf([
      dqlResult("SELECT 1", 10),
      dqlResult("SELECT 1", 20),
    ])
    // When one duplicate is removed
    const reconciled = reconcileResultsForStatements(["SELECT 1"], previous)
    // Then the first occurrence's result survives
    expect(reconciled?.results).toHaveLength(1)
    expect(reconciled?.results[0]).toMatchObject({ count: 10 })
  })

  it("returns null when no result survives (the cell collapses)", () => {
    // Given a frame whose only statement is rewritten
    const previous = resultOf([dqlResult("SELECT 1")])
    // When reconciled against entirely new SQL
    // Then there is no frame
    expect(reconcileResultsForStatements(["SELECT 2"], previous)).toBeNull()
    expect(reconcileResultsForStatements([], previous)).toBeNull()
  })

  it("preserves the active statement by content across a reorder", () => {
    // Given the second statement is active
    const previous = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 1,
      activeStatementKey: statementKeysFor(["SELECT 2"])[0],
    })
    // When the statements are reordered
    const reconciled = reconcileResultsForStatements(
      ["SELECT 2", "SELECT 1"],
      previous,
    )
    // Then the active key still points at the same statement
    expect(reconciled?.activeStatementKey).toBe(
      statementKeysFor(["SELECT 2"])[0],
    )
    expect(reconciled?.allResultsKept).toBe(false)
  })

  it("falls back to the nearest surviving statement when the active one is removed", () => {
    // Given three results with the middle one active
    const previous = resultOf(
      [dqlResult("SELECT 1"), dqlResult("SELECT 2"), dqlResult("SELECT 3")],
      { activeResultIndex: 1 },
    )
    // When the active statement is removed
    const reconciled = reconcileResultsForStatements(
      ["SELECT 1", "SELECT 3"],
      previous,
    )
    // Then the previous neighbor becomes active
    expect(reconciled?.activeStatementKey).toBe(
      statementKeysFor(["SELECT 1"])[0],
    )
  })

  it("anchors on activeResultIndex for records without an active key", () => {
    // Given a legacy record with only a positional active index
    const previous = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 1,
    })
    // When the statement list is unchanged
    const reconciled = reconcileResultsForStatements(
      ["SELECT 1", "SELECT 2"],
      previous,
    )
    // Then the active key resolves to the indexed statement
    expect(reconciled?.activeStatementKey).toBe(
      statementKeysFor(["SELECT 2"])[0],
    )
  })

  it("never carries a running or queued placeholder as a result", () => {
    // Given a frame a crash left behind: one settled result, one placeholder
    const previous = resultOf([
      dqlResult("SELECT 1"),
      { type: "running", query: "SELECT 2" },
    ])
    // When reconciled against the unchanged statements
    const reconciled = reconcileResultsForStatements(
      ["SELECT 1", "SELECT 2"],
      previous,
    )
    // Then only the settled result survives — the placeholder slot
    // regenerates as "Not run" at display time, never as a ghost spinner
    expect(reconciled?.results.map((r) => r.query)).toEqual(["SELECT 1"])
  })

  it("returns null for a frame holding only placeholders", () => {
    // Given a snapshot that captured a run mid-flight
    const previous = resultOf([
      { type: "running", query: "SELECT 1" },
      { type: "queued", query: "SELECT 2" },
    ])
    // When reconciled
    // Then no result survives and the frame collapses
    expect(
      reconcileResultsForStatements(["SELECT 1", "SELECT 2"], previous),
    ).toBeNull()
  })
})

describe("reconcileCellResultForValue — run ownership", () => {
  it("returns a pending frame untouched — the run owns it", () => {
    // Given a run in flight: one statement settled, one still running
    const pending = resultOf([
      dqlResult("SELECT 1"),
      { type: "running", query: "SELECT 2" },
    ])

    // When the SQL is edited mid-run
    const reconciled = reconcileCellResultForValue(pending, "SELECT 1")

    // Then the frame comes back as the SAME object: the run's positional
    // writes stay aligned, and the carryover applies after the run settles
    expect(reconciled).toBe(pending)
  })

  it("reconciles a settled frame by content", () => {
    // Given a settled two-statement frame
    const settled = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")])

    // When the second statement is edited away
    const reconciled = reconcileCellResultForValue(settled, "SELECT 1")

    // Then only the surviving statement keeps its result
    expect(reconciled?.results.map((r) => r.query)).toEqual(["SELECT 1"])
  })
})

describe("deriveStatementFrame — display slots", () => {
  it("gives every statement a slot and marks resultless slots as not run", () => {
    // Given a compact result missing the middle statement
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 3")])
    // When the frame is derived for three statements
    const frame = deriveStatementFrame(
      ["SELECT 1", "SELECT 2", "SELECT 3"],
      result,
    )
    // Then slots follow editor order and the unmatched slot is empty
    expect(frame?.slots.map((s) => s.result?.query ?? null)).toEqual([
      "SELECT 1",
      null,
      "SELECT 3",
    ])
  })

  it("resolves the active slot from the active statement key", () => {
    // Given the frame's active key points at the last statement
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeStatementKey: statementKeysFor(["SELECT 2"])[0],
    })
    // When the frame is derived with a placeholder in between
    const frame = deriveStatementFrame(
      ["SELECT 1", "SELECT 99", "SELECT 2"],
      result,
    )
    // Then the active slot index follows the statement, not the result index
    expect(frame?.activeSlotIndex).toBe(2)
  })

  it("maps a legacy active index through the result's own statement", () => {
    // Given a legacy record whose second result is active
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 1,
    })
    // When a new statement is inserted before it
    const frame = deriveStatementFrame(
      ["SELECT 0", "SELECT 1", "SELECT 2"],
      result,
    )
    // Then the active slot follows the statement content
    expect(frame?.activeSlotIndex).toBe(2)
  })

  it("distinguishes duplicate statements by occurrence", () => {
    // Given two identical statements with distinct results
    const result = resultOf([
      dqlResult("SELECT 1", 10),
      dqlResult("SELECT 1", 20),
    ])
    // When the frame is derived
    const frame = deriveStatementFrame(["SELECT 1", "SELECT 1"], result)
    // Then each slot keeps its own occurrence's result
    expect(frame?.slots.map((s) => s.result)).toMatchObject([
      { count: 10 },
      { count: 20 },
    ])
  })

  it("returns null without a result or without a single surviving slot", () => {
    // Given no result, or a result that matches no statement
    const result = resultOf([dqlResult("SELECT 1")])
    // When the frame is derived
    // Then there is no frame
    expect(deriveStatementFrame(["SELECT 1"], null)).toBeNull()
    expect(deriveStatementFrame([], result)).toBeNull()
    expect(deriveStatementFrame(["SELECT 2"], result)).toBeNull()
  })
})

describe("derivePositionalFrame — orphan results (selection runs)", () => {
  it("builds tabs from the results themselves when no statement claims them", () => {
    // Given a selection-fragment result no editor statement matches
    const result = resultOf([dqlResult("SELECT 1")])
    // When the positional frame is derived
    const frame = derivePositionalFrame(result)
    // Then the fragment gets its own visible slot with its rows attached
    expect(frame?.slots).toHaveLength(1)
    expect(frame?.slots[0].sql).toBe("SELECT 1")
    expect(frame?.slots[0].result).toBe(result.results[0])
  })

  it("keeps the active tab and clamps an out-of-range index", () => {
    // Given a two-result frame viewed on its second tab
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 1,
    })
    // Then the active slot follows the index, clamped when out of range
    expect(derivePositionalFrame(result)?.activeSlotIndex).toBe(1)
    expect(
      derivePositionalFrame({ ...result, activeResultIndex: 9 })
        ?.activeSlotIndex,
    ).toBe(1)
  })

  it("returns null without a result or with an empty one", () => {
    expect(derivePositionalFrame(null)).toBeNull()
    expect(derivePositionalFrame(resultOf([]))).toBeNull()
  })
})

describe("resolveActiveStatementSql — the single-run target", () => {
  it("resolves a selected 'Not run' tab to its own SQL, not the stale result index", () => {
    // Given a two-result frame whose active tab is an appended, never-run
    // statement — activeResultIndex still points at the first result
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 0,
      activeStatementKey: statementKeysFor([
        "SELECT 1",
        "SELECT 2",
        "SELECT 3",
      ])[2],
    })
    // When the single-run target is resolved with the editor unavailable
    const sql = resolveActiveStatementSql(
      "SELECT 1; SELECT 2; SELECT 3",
      result,
    )
    // Then the selected statement runs — never the stale index's query
    expect(sql).toBe("SELECT 3")
  })

  it("falls back to the result index for a legacy snapshot without a key", () => {
    // Given an old record that only carries the active index
    const result = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")], {
      activeResultIndex: 1,
    })
    // Then the index's own statement resolves
    expect(resolveActiveStatementSql("SELECT 1; SELECT 2", result)).toBe(
      "SELECT 2",
    )
  })

  it("resolves a selection-fragment frame positionally", () => {
    // Given a fragment result no editor statement claims
    const result = resultOf([dqlResult("SELECT 99")])
    // Then the fragment's own query resolves
    expect(resolveActiveStatementSql("SELECT 1; SELECT 2", result)).toBe(
      "SELECT 99",
    )
  })

  it("returns undefined without a result, so the caller can fall back", () => {
    expect(resolveActiveStatementSql("SELECT 1", null)).toBeUndefined()
  })
})
