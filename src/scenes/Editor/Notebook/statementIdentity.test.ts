import { describe, expect, it } from "vitest"
import type { CellResult, SingleQueryResult } from "../../../store/notebook"
import {
  MAX_FORMATTED_IDENTITY_LENGTH,
  derivePositionalFrame,
  deriveStatementFrame,
  reconcileCellResultForValue,
  reconcileResultsForStatements,
  resolveActiveStatementSql,
  snapshotResultsMatchQueries,
  statementIdentityOfKey,
  statementKeysFor,
  statementKeysForIdentities,
  retextResultsToStatements,
} from "./statementIdentity"

describe("snapshotResultsMatchQueries", () => {
  const dql = (query: string): SingleQueryResult => ({
    type: "dql",
    query,
    columns: [],
    dataset: [],
    count: 0,
  })

  it("matches when results line up 1-1 with the queries, ignoring whitespace and trailing semicolons", () => {
    // Given a snapshot whose result queries match the cell's statements modulo formatting
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

  it("rejects an empty snapshot", () => {
    // Given a cell with no queries and a snapshot with no results
    // When compared
    // Then there is nothing to present
    expect(snapshotResultsMatchQueries([], [])).toBe(false)
  })

  it("rejects a literal-only edit after a backslash literal", () => {
    // Given a snapshot for a statement with a `'\\'` literal, which QuestDB
    // reads as one character, not as an escaped quote
    const results = [
      dql("SELECT replace(p, '\\', '/') p FROM t WHERE owner = 'alice  smith'"),
    ]

    // When the whitespace inside a later string literal is edited
    // Then the statements differ in value and the snapshot is stale
    expect(
      snapshotResultsMatchQueries(results, [
        "SELECT replace(p, '\\', '/') p FROM t WHERE owner = 'alice smith'",
      ]),
    ).toBe(false)
  })

  it("rejects an alias case change, which QuestDB keeps in the column name", () => {
    // Given a snapshot for a statement whose alias is a lowercase keyword name
    const results = [dql("select 1 as rank")]

    // When only the alias case changes
    // Then the column name differs and the snapshot is stale
    expect(snapshotResultsMatchQueries(results, ["select 1 as Rank"])).toBe(
      false,
    )
  })

  it("rejects a spacing change inside a number literal", () => {
    // Given a snapshot for `1. e5`, which QuestDB reads as 1.0 aliased e5
    const results = [dql("select 1. e5")]

    // When the space goes away, which makes the literal 100000
    // Then the value differs and the snapshot is stale
    expect(snapshotResultsMatchQueries(results, ["select 1.e5"])).toBe(false)
  })

  it("matches across keyword casing", () => {
    // Given a snapshot for a lowercase statement
    const results = [dql("select a from t where b > 1")]

    // When only the keyword casing changes
    // Then the snapshot still represents the cell
    expect(
      snapshotResultsMatchQueries(results, ["SELECT a FROM t WHERE b > 1"]),
    ).toBe(true)
  })

  it("ignores whitespace edits only up to the formatted-identity size limit", () => {
    // Given two IN-list statements, one well under the limit and one over it
    const inList = (length: number) => {
      let sql = "select * from t where s in ("
      for (let i = 0; sql.length < length; i++) sql += `'S${i}', `
      return sql.slice(0, -2) + ")"
    }
    const under = inList(MAX_FORMATTED_IDENTITY_LENGTH / 2)
    const over = inList(MAX_FORMATTED_IDENTITY_LENGTH + 64)
    const respaced = (sql: string) => sql.replace(/, /g, ",  ")

    // When each one gets a whitespace-only edit
    // Then the small statement keeps its result and the large one is stale
    expect(snapshotResultsMatchQueries([dql(under)], [respaced(under)])).toBe(
      true,
    )
    expect(snapshotResultsMatchQueries([dql(over)], [respaced(over)])).toBe(
      false,
    )
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

describe("reconcileResultsForStatements — content carryover", () => {
  it("uses one canonical key space before reconciliation", () => {
    // Given a two-statement frame keyed under its lowercase text
    const results = [dqlResult("select 1"), dqlResult("select 2")]
    const previous = resultOf(results, {
      activeStatementKey: statementKeysFor(["select 1"])[0],
    })
    const edited = ["select 1", "SELECT\n  2"]

    // When the frame is derived for a presentation-only edit
    // The render path must attach both results immediately, even before the
    // refresh engine's debounced reconciliation runs.
    const frame = deriveStatementFrame(
      edited,
      previous,
      statementKeysFor(edited),
    )
    // Then both results attach immediately
    expect(frame?.slots.map((slot) => slot.result?.query)).toEqual([
      "select 1",
      "select 2",
    ])

    // When the same edit is reconciled
    // Reconciliation uses exactly the same identities and keeps the active
    // statement stable without needing a cache-priming render. Survivors take
    // the text of the statement they now belong to.
    const reconciled = reconcileResultsForStatements(edited, previous)
    // Then the survivors take the new text and the active key stays
    expect(reconciled?.results).toEqual(
      results.map((r, index) => ({ ...r, query: edited[index] })),
    )
    expect(reconciled?.activeStatementKey).toBe(previous.activeStatementKey)
  })

  it("keeps results for unchanged statements across whitespace and semicolon edits, under the statements' text", () => {
    // Given a two-statement frame
    const previous = resultOf([dqlResult("SELECT 1"), dqlResult("SELECT 2")])
    // When the statements only gain whitespace and semicolons
    const reconciled = reconcileResultsForStatements(
      ["  SELECT 1;", "SELECT 2  "],
      previous,
    )
    // Then both results survive in statement order, carrying the new text
    expect(reconciled?.results.map((r) => r.query)).toEqual([
      "  SELECT 1;",
      "SELECT 2  ",
    ])
  })

  it("keeps results across internal whitespace, newlines, and keyword casing", () => {
    // Given a result for a lowercase single-line statement
    const previous = resultOf([
      dqlResult("select * from trades where sym = 'A'"),
    ])

    // When the statement is reformatted
    const reconciled = reconcileResultsForStatements(
      ["SELECT  *\nFROM trades WHERE sym='A';"],
      previous,
    )

    // Then the result survives under the new text
    expect(reconciled?.results).toEqual([
      {
        ...previous.results[0],
        query: "SELECT  *\nFROM trades WHERE sym='A';",
      },
    ])
  })

  it("keeps the script summary on a presentation-only edit and drops it when a slot is lost", () => {
    // Given a settled two-statement frame with a script summary
    const script = { successCount: 2, failedCount: 0, durationMs: 12 }
    const settled = resultOf([dqlResult("select 1"), dqlResult("select 2")], {
      script,
    })

    // When only keyword casing changes, the counts still describe the frame
    const reformatted = reconcileCellResultForValue(
      settled,
      "SELECT 1;\nSELECT 2",
    )
    // Then the summary and the new text stay
    expect(reformatted?.script).toEqual(script)
    expect(reformatted?.results.map((r) => r.query)).toEqual([
      "SELECT 1",
      "SELECT 2",
    ])

    // When a statement is edited away, the counts no longer do
    const shrunk = reconcileCellResultForValue(settled, "select 1")
    // Then the summary is dropped
    expect(shrunk?.script).toBeUndefined()
  })

  it("does not fold case inside SQL string values", () => {
    // Given a result for a statement with an uppercase string literal
    const previous = resultOf([dqlResult("select 'A'")])

    // When the literal changes case
    // Then nothing survives
    expect(reconcileResultsForStatements(["SELECT 'a'"], previous)).toBeNull()
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
      statementKeysFor(["SELECT 1", "SELECT 2", "SELECT 3"]),
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
      statementKeysFor(["SELECT 1", "SELECT 99", "SELECT 2"]),
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
      statementKeysFor(["SELECT 0", "SELECT 1", "SELECT 2"]),
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
    const frame = deriveStatementFrame(
      ["SELECT 1", "SELECT 1"],
      result,
      statementKeysFor(["SELECT 1", "SELECT 1"]),
    )
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
    expect(
      deriveStatementFrame(["SELECT 1"], null, statementKeysFor(["SELECT 1"])),
    ).toBeNull()
    expect(deriveStatementFrame([], result, [])).toBeNull()
    expect(
      deriveStatementFrame(
        ["SELECT 2"],
        result,
        statementKeysFor(["SELECT 2"]),
      ),
    ).toBeNull()
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

describe("statementKeysForIdentities", () => {
  it("rebuilds a frame's keys from the identities of the keys it was written under", () => {
    // Given statements with a duplicate and presentation-only differences
    const statements = ["select 1", "SELECT  1", "select 2"]
    const keys = statementKeysFor(statements)

    // When the keys are rebuilt from their identities alone
    const rebuilt = statementKeysForIdentities(keys.map(statementIdentityOfKey))

    // Then they equal the keys built from the text, duplicates included
    expect(rebuilt).toEqual(keys)
    expect(keys[0]).not.toBe(keys[1])
  })
})

describe("retextResultsToStatements — run commit under edited text", () => {
  const dql = (query: string): SingleQueryResult => ({
    type: "dql",
    query,
    columns: [{ name: "x", type: "INT" }],
    dataset: [[1]],
    count: 1,
  })

  it("gives a result the current text of the statement that kept its identity", () => {
    // Given a run that landed under the old casing while the editor re-cased it
    const results = [dql("select 2")]

    // When the results take the editor's statements
    const retexted = retextResultsToStatements(results, [
      "select 1",
      "SELECT 2",
    ])

    // Then the result reads as the editor holds it
    expect(retexted.map((r) => r.query)).toEqual(["SELECT 2"])
  })

  it("keeps a result no statement claims, and the same array when nothing changes", () => {
    // Given one result whose statement was rewritten and one that still matches
    const results = [dql("select 2"), dql("select 3")]

    // When retexted against statements that dropped the first
    const retexted = retextResultsToStatements(results, ["select 3"])

    // Then the orphan keeps its text, the match is untouched, and an unchanged
    // set comes back as the same array
    expect(retexted.map((r) => r.query)).toEqual(["select 2", "select 3"])
    expect(retextResultsToStatements(results, ["select 2", "select 3"])).toBe(
      results,
    )
  })
})
