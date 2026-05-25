import { describe, expect, it } from "vitest"
import { prependGlobalsDeclare } from "./declareUtils"
import queries from "./__fixtures__/declare-cases.json"

const cases: string[] = queries

const startsWithDeclare = (q: string) => /^\s*DECLARE\b/i.test(q)
const startsWithExplain = (q: string) => /^\s*EXPLAIN\b/i.test(q)
const hasInnerDeclare = (q: string) => /\bDECLARE\b/i.test(q)

const GLOBAL = [{ name: "x", value: "999" }]

describe("prependGlobalsDeclare — corpus regression (declare-cases.json)", () => {
  it("EXPLAIN-led statements remain EXPLAIN-led", () => {
    const explains = cases.filter(startsWithExplain)
    expect(explains.length).toBeGreaterThan(0)
    for (const c of explains) {
      const { sql } = prependGlobalsDeclare(c, GLOBAL)
      expect(/^\s*EXPLAIN\b/i.test(sql)).toBe(true)
    }
  })

  it("wrapped shapes (CREATE VIEW/TABLE AS (, INSERT INTO ... SELECT * FROM () are left untouched", () => {
    const wrapped = cases.filter(
      (c) =>
        !startsWithDeclare(c) && !startsWithExplain(c) && hasInnerDeclare(c),
    )
    expect(wrapped.length).toBeGreaterThan(0)
    for (const c of wrapped) {
      const r = prependGlobalsDeclare(c, GLOBAL)
      expect(r.sql).toBe(c)
      expect(r.insertedRange).toBeNull()
    }
  })

  it("statements starting with DECLARE either merge `@x` once or no-op (shadowed/invalid)", () => {
    const starts = cases.filter(startsWithDeclare)
    expect(starts.length).toBeGreaterThan(40)
    for (const c of starts) {
      const { sql, insertedRange } = prependGlobalsDeclare(c, GLOBAL)
      const userHasX = /@x\s*:=/.test(c)
      if (userHasX) {
        expect(sql).toBe(c)
        expect(insertedRange).toBeNull()
      } else if (insertedRange === null) {
        expect(sql).toBe(c)
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
    for (const c of cases) {
      const { sql, insertedRange } = prependGlobalsDeclare(c, GLOBAL)
      expect(sql.length - c.length).toBe(insertedRange?.delta ?? 0)
    }
  })
})
