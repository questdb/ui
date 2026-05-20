// Regression corpus for `prependGlobalsDeclare`, built from the real
// QuestDB DECLARE tests extracted into mcp-bridge/src/test/fixtures.
// If you update declare-cases.json upstream, re-copy it into
// src/scenes/Editor/Notebook/__fixtures__/declare-cases.json.
import { describe, expect, it } from "vitest"
import { prependGlobalsDeclare } from "./declareUtils"
import corpus from "./__fixtures__/declare-cases.json"

type Case = {
  sourceFile: string
  testMethod: string
  lineNumber: number
  isErrorCase: boolean
  query: string
  analysis: {
    startsWithDeclare: boolean
    declareOffset: number
    beforeKeyword: string | null
    hasOverridable: boolean
    multipleDeclares: number
    lineCount: number
  }
}

const cases = (corpus as { cases: Case[] }).cases.filter((c) => !c.isErrorCase)

// Two classes of corpus cases can't be re-tokenised against our lexer:
//   - Java placeholder identifiers like `<TABLE1>` / `<IDENT>` from runtime
//     string concatenation in the original Java tests.
//   - `?` bind-variable placeholders, which are a PG-wire feature; QuestDB's
//     SQL lexer doesn't recognise them and they emit lex errors. Notebook
//     cells executed via /exec never contain `?`, so they're not in scope.
const tokenisable = cases.filter(
  (c) => !/<[A-Z][A-Z0-9_]*>/.test(c.query) && !/\?/.test(c.query),
)

const GLOBAL = [{ name: "x", value: "999" }]

describe("prependGlobalsDeclare — corpus regression (declare-cases.json)", () => {
  it("covers a meaningful sample size", () => {
    expect(tokenisable.length).toBeGreaterThan(80)
  })

  // Stronger invariant lives at the bottom: `delta` must equal the actual
  // byte change in either direction. A user query with very wide spacing
  // between assignments can shrink under merge because we re-render with
  // canonical `,\n  ` separators — that's correct behaviour, not a bug, so
  // we don't assert "never shortens" here.

  it("EXPLAIN-led statements remain EXPLAIN-led", () => {
    const explains = tokenisable.filter((c) => /^\s*EXPLAIN\b/i.test(c.query))
    expect(explains.length).toBeGreaterThan(0)
    for (const c of explains) {
      const { sql } = prependGlobalsDeclare(c.query, GLOBAL)
      expect(/^\s*EXPLAIN\b/i.test(sql)).toBe(true)
    }
  })

  it("wrapped shapes (CREATE VIEW/TABLE AS (, INSERT INTO ... SELECT * FROM () are left untouched (phase-1 fallback)", () => {
    const wrapped = tokenisable.filter(
      (c) =>
        !c.analysis.startsWithDeclare &&
        c.analysis.beforeKeyword !== null &&
        !/explain/i.test(c.analysis.beforeKeyword),
    )
    expect(wrapped.length).toBeGreaterThan(0)
    for (const c of wrapped) {
      const r = prependGlobalsDeclare(c.query, GLOBAL)
      expect(r.sql).toBe(c.query)
      expect(r.insertedRange).toBeNull()
    }
  })

  it("statements starting with DECLARE either merge `@x` once or no-op (shadowed/invalid)", () => {
    const starts = tokenisable.filter((c) => c.analysis.startsWithDeclare)
    expect(starts.length).toBeGreaterThan(40)
    for (const c of starts) {
      const { sql, insertedRange } = prependGlobalsDeclare(c.query, GLOBAL)
      const userHasX = /@x\s*:=/.test(c.query)
      if (userHasX) {
        // Shadowed: result must equal the input.
        expect(sql).toBe(c.query)
        expect(insertedRange).toBeNull()
      } else if (insertedRange === null) {
        // No-op: must be byte-identical. Reachable when the user's leading
        // DECLARE contains an `=` assignment we refuse to rewrite around.
        expect(sql).toBe(c.query)
      } else {
        // Merged: the rendered block contains exactly one `@x := 999`.
        const matches = sql.match(/@x\s*:=\s*999/g) ?? []
        expect(matches.length).toBe(1)
      }
      // Result still starts with DECLARE.
      expect(/^\s*DECLARE\b/i.test(sql)).toBe(true)
    }
  })

  it("insertedRange.delta always matches the actual byte delta", () => {
    for (const c of tokenisable) {
      const { sql, insertedRange } = prependGlobalsDeclare(c.query, GLOBAL)
      expect(sql.length - c.query.length).toBe(insertedRange?.delta ?? 0)
    }
  })

  it("insertedRange.end never exceeds the wire SQL length", () => {
    for (const c of tokenisable) {
      const { sql, insertedRange } = prependGlobalsDeclare(c.query, GLOBAL)
      if (insertedRange) {
        expect(insertedRange.start).toBeGreaterThanOrEqual(0)
        expect(insertedRange.end).toBeLessThanOrEqual(sql.length)
        expect(insertedRange.start).toBeLessThan(insertedRange.end)
      }
    }
  })
})
