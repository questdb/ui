import { describe, expect, it, vi } from "vitest"
import {
  createValidateWithGlobals,
  effectiveQueryOf,
  isValidVariableName,
  mapVariablesError,
  normalizeVariables,
  parseDeclareBlock,
  renderDeclareBlock,
  renderVariablesParameter,
  stripLeadingAt,
  validateVariableShape,
} from "./declareUtils"

const vars = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, value }))

describe("isValidVariableName", () => {
  it.each(["x", "X", "_x", "symbol", "from_time", "v1", "_"])(
    "accepts %s",
    (n) => {
      expect(isValidVariableName(n)).toBe(true)
    },
  )
  it.each([
    "café",
    "日本語",
    "Σx",
    "naïve",
    "한국",
    "Москва",
    "ø",
    "θ_x",
    "x_中文",
  ])(
    "accepts Unicode identifier %s (BMP above 0x80, like QuestDB lexer)",
    (n) => {
      expect(isValidVariableName(n)).toBe(true)
    },
  )
  it.each([
    "",
    "1x", // leading digit
    "-x", // leading hyphen (would be UnaryMinus)
    "+x", // leading plus
    ".x", // leading dot
    "@x", // leading @
    " x", // leading space
    "x-y", // QuestDB Minus operator
    "x+y", // QuestDB Plus operator
    "x.y", // QuestDB Dot operator
    "x:y", // QuestDB Colon / :=
    "x y", // whitespace
    "x'y", // single-quote starts string
    'x"y', // double-quote starts identifier
    "x`y", // backtick starts identifier
    "x@y", // our reference-start marker
    "x\\y", // escape safety
  ])("rejects %s", (n) => {
    expect(isValidVariableName(n)).toBe(false)
  })
})

describe("stripLeadingAt", () => {
  it("strips a leading @", () => {
    expect(stripLeadingAt("@symbol")).toBe("symbol")
  })
  it("leaves names without @ untouched", () => {
    expect(stripLeadingAt("symbol")).toBe("symbol")
  })
})

describe("normalizeVariables", () => {
  it("preserves ordered variable arrays", () => {
    expect(
      normalizeVariables([
        { name: "base", value: "10" },
        { name: "derived", value: "@base + 1" },
      ]),
    ).toEqual(vars({ base: "10", derived: "@base + 1" }))
  })

  it("upgrades old object-shaped variables without crashing", () => {
    expect(normalizeVariables({ x: "1", y: "@x + 1" })).toEqual(
      vars({ x: "1", y: "@x + 1" }),
    )
  })
})

describe("parseDeclareBlock", () => {
  it("returns {} when no DECLARE is present", () => {
    expect(parseDeclareBlock("SELECT 1 FROM t")).toEqual([])
  })

  it("returns {} for empty / whitespace input", () => {
    expect(parseDeclareBlock("")).toEqual([])
    expect(parseDeclareBlock("   \n  ")).toEqual([])
  })

  it("parses a single assignment", () => {
    expect(parseDeclareBlock("DECLARE @x := 10")).toEqual(vars({ x: "10" }))
  })

  it("parses multiple assignments", () => {
    expect(parseDeclareBlock("DECLARE @x := 10, @y := 'BTC'")).toEqual(
      vars({ x: "10", y: "'BTC'" }),
    )
  })

  it("preserves nested function values", () => {
    expect(
      parseDeclareBlock(
        "DECLARE @from := dateadd('d', -7, now()), @to := now()",
      ),
    ).toEqual(vars({ from: "dateadd('d', -7, now())", to: "now()" }))
  })

  it("ignores trailing SELECT", () => {
    expect(
      parseDeclareBlock("DECLARE @x := 10, @y := 5 SELECT @x + @y FROM t"),
    ).toEqual(vars({ x: "10", y: "5" }))
  })

  it("ignores trailing WITH", () => {
    expect(
      parseDeclareBlock("DECLARE @x := 10 WITH cte AS (SELECT 1) SELECT @x"),
    ).toEqual(vars({ x: "10" }))
  })

  it("ignores trailing semicolon", () => {
    expect(parseDeclareBlock("DECLARE @x := 10 ;")).toEqual(vars({ x: "10" }))
  })

  it("strips OVERRIDABLE modifier", () => {
    expect(
      parseDeclareBlock("DECLARE OVERRIDABLE @x := 1, OVERRIDABLE @y := 2"),
    ).toEqual(vars({ x: "1", y: "2" }))
  })

  it("rejects assignments using `=` (server requires `:=`)", () => {
    // QuestDB's parser refuses `DECLARE @x = …` with
    //   `expected variable assignment operator ':='`.
    // We mirror that: `=` assignments are dropped from the parsed map.
    expect(parseDeclareBlock("DECLARE @x = 1, @y := 2")).toEqual(
      vars({ y: "2" }),
    )
    expect(parseDeclareBlock("DECLARE @x = 1")).toEqual([])
  })

  it("handles multi-line input", () => {
    const text = `
DECLARE
  @from := dateadd('d', -7, now()),
  @to := now(),
  @symbol := 'BTCUSD'
SELECT * FROM trades`
    expect(parseDeclareBlock(text)).toEqual(
      vars({
        from: "dateadd('d', -7, now())",
        to: "now()",
        symbol: "'BTCUSD'",
      }),
    )
  })

  it("ignores text before DECLARE", () => {
    // (Pragmatic: clipboard might have whitespace or stray content.)
    expect(parseDeclareBlock("   DECLARE @x := 1")).toEqual(vars({ x: "1" }))
  })

  it("preserves commas inside bracket subscripts (array indexing)", () => {
    // QuestDB's array-indexing syntax `bids[1,1]` has a comma at paren
    // depth 0 but bracket depth 1 — must NOT split the assignment.
    expect(parseDeclareBlock("DECLARE @best_bid := bids[1,1]")).toEqual(
      vars({ best_bid: "bids[1,1]" }),
    )
  })

  it("handles multiple bracket-indexed values from QuestDB docs", () => {
    expect(
      parseDeclareBlock(
        "DECLARE @best_bid := bids[1,1], @volume_l1 := bids[2,1]",
      ),
    ).toEqual(vars({ best_bid: "bids[1,1]", volume_l1: "bids[2,1]" }))
  })

  it("handles array slice syntax with colon", () => {
    expect(parseDeclareBlock("DECLARE @first_four := bids[1:4]")).toEqual(
      vars({ first_four: "bids[1:4]" }),
    )
  })

  it("captures a subquery value without truncating it", () => {
    expect(parseDeclareBlock("DECLARE @c := (SELECT count(*) FROM t)")).toEqual(
      vars({ c: "(SELECT count(*) FROM t)" }),
    )
  })

  it("does not swallow the next assignment when a comma is missing", () => {
    // `DECLARE @x := 5 @y := 10` is malformed — the server would reject it.
    // We should at minimum NOT capture `@y` into `@x`'s value. Whichever
    // assignment we extract should hold its own value.
    const out = parseDeclareBlock("DECLARE @x := 5 @y := 10")
    expect(out.find((v) => v.name === "x")?.value).not.toBe("5 @y := 10")
  })

  it("rejects `@x = …` for both assignments (the server only accepts `:=`)", () => {
    expect(parseDeclareBlock("DECLARE @x = 1, @y = 2")).toEqual([])
  })
})

describe("renderDeclareBlock", () => {
  it("returns empty string for empty input", () => {
    expect(renderDeclareBlock([])).toBe("")
  })
  it("emits a multi-line DECLARE statement", () => {
    expect(renderDeclareBlock(vars({ x: "10", y: "'BTC'" }))).toBe(
      "DECLARE\n  @x := 10,\n  @y := 'BTC'",
    )
  })
  it("indents a single assignment on its own line", () => {
    expect(renderDeclareBlock(vars({ x: "10" }))).toBe("DECLARE\n  @x := 10")
  })
  it("drops invalid identifier names silently", () => {
    expect(renderDeclareBlock(vars({ "bad-name": "1", good: "2" }))).toBe(
      "DECLARE\n  @good := 2",
    )
  })
  it("round-trips through parseDeclareBlock", () => {
    const input = {
      from: "dateadd('d', -7, now())",
      to: "now()",
      symbol: "'BTCUSD'",
    }
    expect(parseDeclareBlock(renderDeclareBlock(vars(input)))).toEqual(
      vars(input),
    )
  })
})

describe("validateVariableShape", () => {
  it("accepts a plain integer literal", () => {
    expect(validateVariableShape({ name: "x", value: "1" })).toBeNull()
  })

  it("accepts a function call value", () => {
    expect(validateVariableShape({ name: "from", value: "now()" })).toBeNull()
  })

  it("accepts a string literal value", () => {
    expect(validateVariableShape({ name: "symbol", value: "'BTC'" })).toBeNull()
  })

  it("accepts a value referencing another @variable", () => {
    expect(
      validateVariableShape({ name: "derived", value: "@base + 1" }),
    ).toBeNull()
  })

  it("accepts parenthesised commas (row expression)", () => {
    expect(validateVariableShape({ name: "x", value: "(1, 2)" })).toBeNull()
  })

  it("accepts a string literal containing := and ,", () => {
    expect(
      validateVariableShape({ name: "x", value: "'a := b, c'" }),
    ).toBeNull()
  })

  it("rejects multi-assignment injection via top-level comma", () => {
    const err = validateVariableShape({
      name: "x",
      value: "1, @evil := 999",
    })
    expect(err).toEqual({ kind: "count", actual: 2 })
  })

  it("rejects multi-assignment injection with newlines", () => {
    const err = validateVariableShape({
      name: "x",
      value: "1,\n  @evil := 999",
    })
    expect(err).toEqual({ kind: "count", actual: 2 })
  })

  it("rejects multi-assignment injection with a subquery payload", () => {
    const err = validateVariableShape({
      name: "x",
      value: "1, @api_key := (select 1)",
    })
    expect(err).toEqual({ kind: "count", actual: 2 })
  })

  it("rejects an empty value", () => {
    const err = validateVariableShape({ name: "x", value: "" })
    expect(err).not.toBeNull()
  })

  it("rejects an invalid variable name", () => {
    const err = validateVariableShape({ name: "bad-name", value: "1" })
    expect(err).toEqual({ kind: "parse" })
  })
})

describe("renderVariablesParameter", () => {
  it("renders the assignments in order and records the range of each", () => {
    // Given two variables, the second reading the first
    const variables = vars({ from: "'2026-01-01'", to: "@from + 1d" })

    // When rendered as the variables parameter
    const parameter = renderVariablesParameter(variables)!

    // Then each assignment's range covers exactly its text
    expect(parameter.text).toBe("@from := '2026-01-01'\n, @to := @from + 1d")
    expect(
      parameter.assignments.map(({ name, start, end }) => [
        name,
        parameter.text.slice(start, end),
      ]),
    ).toEqual([
      ["from", "@from := '2026-01-01'"],
      ["to", "@to := @from + 1d"],
    ])
  })

  it("ends a value's line comment before the next assignment", () => {
    // Given a value that ends in a line comment
    const variables = vars({ a: "1 -- one", b: "2" })

    // When rendered
    const { text } = renderVariablesParameter(variables)!

    // Then the comment does not swallow the next assignment
    expect(text.split("\n")).toEqual(["@a := 1 -- one", ", @b := 2"])
  })

  it("accepts the stored map form of the variables", () => {
    // Given variables stored as a name-to-value map
    // When rendered
    // Then they are rendered like the list form
    expect(renderVariablesParameter({ a: "1" })?.text).toBe("@a := 1")
  })

  it("skips invalid names, and renders nothing without a valid one", () => {
    // Given variables with invalid names
    // When rendered
    // Then only the valid ones are rendered
    expect(
      renderVariablesParameter(vars({ "bad name": "1", ok: "2" }))?.text,
    ).toBe("@ok := 2")
    expect(renderVariablesParameter(vars({ "bad name": "1" }))).toBe(undefined)
    expect(renderVariablesParameter([])).toBe(undefined)
    expect(renderVariablesParameter(undefined)).toBe(undefined)
  })
})

describe("effectiveQueryOf", () => {
  it("tells apart the runs of one statement with other variable values", () => {
    // Given one statement and two values of the variable it reads
    const sql = "select @sym"
    const btc = renderVariablesParameter(vars({ sym: "'BTC-USD'" }))
    const eth = renderVariablesParameter(vars({ sym: "'ETH-USD'" }))

    // When the effective queries are compared
    // Then they differ, and are the statement itself without variables
    expect(effectiveQueryOf(sql, btc)).not.toBe(effectiveQueryOf(sql, eth))
    expect(effectiveQueryOf(sql, btc)).toContain("'BTC-USD'")
    expect(effectiveQueryOf(sql, undefined)).toBe(sql)
  })
})

describe("mapVariablesError", () => {
  const variables = renderVariablesParameter(vars({ a: "1", b: "nope()" }))

  it("names the variable an error in the variables falls in", () => {
    // Given an error inside the second assignment of the parameter
    const position = variables!.text.indexOf("nope")

    // When mapped to the statement
    const mapped = mapVariablesError(variables, {
      query: "select @b from t",
      error: "unknown function name",
      position,
      errorSource: "variables" as const,
    })

    // Then it names the variable and points at the start of the statement
    expect(mapped).toEqual({
      query: "select @b from t",
      error: "unknown function name (in variable @b)",
      position: 0,
    })
  })

  it("keeps an error in the statement as reported", () => {
    // Given an error in the statement itself
    const error = { error: "table does not exist", position: 15 }

    // When mapped
    // Then it is unchanged
    expect(mapVariablesError(variables, error)).toBe(error)
  })
})

describe("createValidateWithGlobals", () => {
  // The client-side parser cannot parse this statement (questdb/ui#631).
  const unparsable = "select @a, ??? from t"

  it("validates the statement as written, with the variables beside it", async () => {
    // Given a server that reports an error in the variables
    const validateQuery = vi.fn().mockResolvedValue({
      query: unparsable,
      error: "unknown function name",
      position: 6,
      errorSource: "variables",
    })
    const validate = createValidateWithGlobals({ validateQuery }, () =>
      vars({ a: "nope()" }),
    )

    // When a statement the parser cannot parse is validated
    const result = await validate(unparsable)

    // Then the server gets the statement unchanged and the variables apart,
    // and the error names the variable
    expect(validateQuery).toHaveBeenCalledWith(
      unparsable,
      undefined,
      "@a := nope()",
    )
    expect(result).toEqual({
      query: unparsable,
      error: "unknown function name (in variable @a)",
      position: 0,
    })
  })

  it("sends no variables when the notebook has none", async () => {
    // Given a notebook without variables
    const validateQuery = vi.fn().mockResolvedValue({ query: "", columns: [] })
    const validate = createValidateWithGlobals({ validateQuery }, () => [])

    // When a statement is validated
    await validate("select 1")

    // Then only the statement is sent
    expect(validateQuery).toHaveBeenCalledWith("select 1", undefined, undefined)
  })
})
