import { describe, expect, it } from "vitest"
import "./monacoPolyfill"
import * as monaco from "monaco-editor/esm/vs/editor/editor.api"
import { language } from "./language"

monaco.languages.register({ id: "questdb-sql-highlight-test" })
monaco.languages.setMonarchTokensProvider(
  "questdb-sql-highlight-test",
  language,
)

// Returns "text|type" for each token of a one-line input, without whitespace.
function tokens(sql: string): string[] {
  const [line] = monaco.editor.tokenize(sql, "questdb-sql-highlight-test")
  return line
    .map((t, i) => {
      const text = sql.slice(t.offset, line[i + 1]?.offset ?? sql.length)
      return `${text}|${t.type.replace(/\.sql$/, "")}`
    })
    .filter((t) => !t.endsWith("|white"))
}

describe("questdb-sql highlighting", () => {
  it("block comments nest", () => {
    expect(tokens("/* a /* b */ c */ select")).toEqual([
      "/*|comment.quote",
      " a |comment",
      "/*|comment.quote",
      " b |comment",
      "*/|comment.quote",
      " c |comment",
      "*/|comment.quote",
      "select|keyword",
    ])
  })

  it("colors a backtick-quoted name as an identifier", () => {
    expect(tokens("select * from `order`")).toEqual([
      "select|keyword",
      "*|operator",
      "from|keyword",
      "`|identifier.quote",
      "order|identifier",
      "`|identifier.quote",
    ])
  })

  it.each([
    "0x1F",
    "1.5f",
    "10f",
    "1e36d",
    "100000L",
    "10.5m",
    "1.5e3m",
    "100ns",
    "250ms",
    "1h",
    "1.5d",
    "1_000_000",
    "0.0",
    "3.14",
    ".5",
    "1e-3",
  ])("colors %s as one number", (literal) => {
    expect(tokens(`select ${literal}`)).toEqual([
      "select|keyword",
      `${literal}|number`,
    ])
  })

  it("colors the sign as an operator, as the parser does", () => {
    expect(tokens("select v+10, -1")).toEqual([
      "select|keyword",
      "v|identifier",
      "+|operator",
      "10|number",
      ",|delimiter",
      "-|operator",
      "1|number",
    ])
  })

  it("colors E'...' as a string", () => {
    expect(tokens("select E'a\\nb'")).toEqual([
      "select|keyword",
      "E'a\\nb'|string",
    ])
  })

  it("colors bind variables", () => {
    expect(tokens("select $1, :sym, x::int")).toEqual([
      "select|keyword",
      "$1|variable",
      ",|delimiter",
      ":sym|variable",
      ",|delimiter",
      "x|identifier",
      "::|operator",
      "int|dataType",
    ])
  })

  it("keeps array slices as slices", () => {
    expect(tokens("select arr[1:n], arr[i:j]")).toEqual([
      "select|keyword",
      "arr|identifier",
      "[|delimiter.square",
      "1|number",
      ":|operator",
      "n|identifier",
      "]|delimiter.square",
      ",|delimiter",
      "arr|identifier",
      "[|delimiter.square",
      "i|identifier",
      ":|operator",
      "j|identifier",
      "]|delimiter.square",
    ])
  })

  it("distinguishes array binds from slice bounds", () => {
    const result = tokens(
      "select arr[:1], arr[: 5], arr[i:j], arr[f(:a)] from t",
    )
    expect(result).toContain(":1|variable")
    expect(result).toContain(":a|variable")
    expect(result).toContain("5|number")
    expect(result).toContain("i|identifier")
    expect(result).toContain("j|identifier")
    expect(result.filter((t) => t === ":|operator")).toHaveLength(2)
  })

  it("colors CASE binds inside brackets and the slice after END", () => {
    const result = tokens(
      "select arr[CASE WHEN x THEN :lo ELSE :hi END:n] from t",
    )
    expect(result).toContain(":lo|variable")
    expect(result).toContain(":hi|variable")
    expect(result).toContain(":|operator")
    expect(result).toContain("n|identifier")
  })

  it("colors keyword-named slice bounds as identifiers", () => {
    const result = tokens(
      "select arr[when:n], arr[then:n], arr[else :n], arr[window :n] from t",
    )
    for (const name of ["when", "then", "else", "window"])
      expect(result).toContain(`${name}|identifier`)
    expect(result.filter((t) => t.endsWith("|variable"))).toEqual([])
  })

  it("keeps binds in nested delimiters and after array operators", () => {
    const result = tokens(
      "select ARRAY[row_number() OVER (PARTITION BY :k), :x + :y], arr[(f(:z)):n] from t",
    )
    for (const name of ["k", "x", "y", "z"])
      expect(result).toContain(`:${name}|variable`)
    expect(result).toContain(":|operator")
  })

  it("keeps quoted and dollar-containing names as identifiers", () => {
    const result = tokens(
      "select `order`, `BTC-USD_buy`, a1$_, _a1$, select$x from `my--table` where `a/*b` > 1",
    )
    for (const name of [
      "order",
      "BTC-USD_buy",
      "a1$_",
      "_a1$",
      "select$x",
      "my--table",
      "a/*b",
    ])
      expect(result).toContain(`${name}|identifier`)
    expect(result.some((t) => t.endsWith("|comment"))).toBe(false)
  })

  it("colors expressions inside ARRAY[...]", () => {
    expect(
      tokens("select ARRAY[abs(x), CASE WHEN a THEN 1 END, [y + 1]] z"),
    ).toEqual([
      "select|keyword",
      "ARRAY[|keyword",
      "abs|predefined",
      "(|delimiter.parenthesis",
      "x|identifier",
      ")|delimiter.parenthesis",
      ",|delimiter",
      "CASE|keyword.block",
      "WHEN|keyword.choice",
      "a|identifier",
      "THEN|keyword.choice",
      "1|number",
      "END|keyword.block",
      ",|delimiter",
      "[|delimiter.square",
      "y|identifier",
      "+|operator",
      "1|number",
      // adjacent tokens of the same type are reported merged
      "]]|delimiter.square",
      "z|identifier",
    ])
  })
})
