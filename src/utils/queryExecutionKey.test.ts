import { describe, expect, it } from "vitest"
import { isExplainQuery } from "./queryExecutionKey"

describe("isExplainQuery", () => {
  it.each([
    "EXPLAIN select 1",
    "\texplain select 1",
    "-- plan\nexplain select 1",
    "--c\r\nexplain select 1",
    // The SQL lexer ends a line comment at a bare carriage return too.
    "--c\rexplain select 1",
    "/*c*/explain select 1",
    "/* /* */ explain select 1",
    "explain(select 1)",
    "\u00a0explain select 1",
  ])("recognises the query plan %j", (sql) => {
    expect(isExplainQuery(sql)).toBe(true)
  })

  it.each([
    "explainx",
    "select 'explain'",
    "--c",
    "/* x",
    "/*/explain",
    // A block comment ends at its first "*/", as in SQL.
    "/* a */ x */ explain",
    "/* c */ select '*/ explain' from t",
  ])("does not treat %j as a query plan", (sql) => {
    expect(isExplainQuery(sql)).toBe(false)
  })

  // Leading comments cost linear time, however many there are.
  it("handles many leading block comments", () => {
    expect(isExplainQuery("/**/".repeat(10_000) + "select 1")).toBe(false)
    expect(isExplainQuery("/* c */ ".repeat(10_000) + "explain select 1")).toBe(
      true,
    )
  })
})
