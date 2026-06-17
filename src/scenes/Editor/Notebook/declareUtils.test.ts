import { describe, expect, it } from "vitest"
import {
  isValidVariableName,
  mapWireErrorPosition,
  normalizeVariables,
  parseDeclareBlock,
  prependGlobalsDeclare,
  renderDeclareBlock,
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

describe("prependGlobalsDeclare", () => {
  it("is a no-op when globals are empty", () => {
    const sql = "SELECT @x FROM t"
    expect(prependGlobalsDeclare(sql, [])).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("is a no-op for empty / whitespace / comment-only input", () => {
    const globals = vars({ x: "1" })
    expect(prependGlobalsDeclare("", globals).insertedRange).toBeNull()
    expect(prependGlobalsDeclare("   \n  ", globals).insertedRange).toBeNull()
    expect(
      prependGlobalsDeclare("-- only a comment", globals).insertedRange,
    ).toBeNull()
    expect(
      prependGlobalsDeclare("/* block only */", globals).insertedRange,
    ).toBeNull()
  })

  it("prepends DECLARE before a bare SELECT", () => {
    const original = "SELECT @x FROM t"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "1" }),
    )
    expect(sql).toBe("DECLARE\n  @x := 1\nSELECT @x FROM t")
    const blockLen = "DECLARE\n  @x := 1\n".length
    expect(insertedRange).toEqual({
      start: 0,
      end: blockLen,
      delta: blockLen,
    })
  })

  it("prepends DECLARE before a bare WITH", () => {
    const { sql } = prependGlobalsDeclare(
      "WITH cte AS (SELECT 1) SELECT @x FROM cte",
      vars({ x: "1" }),
    )
    expect(sql.startsWith("DECLARE\n  @x := 1\nWITH ")).toBe(true)
  })

  it("preserves a leading line comment, with insertion offset AFTER the comment", () => {
    const { sql, insertedRange } = prependGlobalsDeclare(
      "-- header\nSELECT @x",
      vars({ x: "1" }),
    )
    expect(sql).toBe("-- header\nDECLARE\n  @x := 1\nSELECT @x")
    // Start must point at the first non-trivia char (the 'S' of SELECT),
    // not at 0. Otherwise marker classification of trivia-area errors breaks.
    expect(insertedRange?.start).toBe("-- header\n".length)
  })

  it("preserves a leading block comment and inserts DECLARE after it", () => {
    const { sql } = prependGlobalsDeclare(
      "/* header */ SELECT @x",
      vars({ x: "1" }),
    )
    expect(sql).toBe("/* header */ DECLARE\n  @x := 1\nSELECT @x")
  })

  it("no-ops when every global is shadowed by a user local", () => {
    const sql = "DECLARE @x := 99 SELECT @x"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("merges non-shadowed globals into the user's DECLARE block (globals first)", () => {
    const original = "DECLARE @y := 99 SELECT @x + @y"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "1", y: "10" }),
    )
    // Globals listed first; `y` is dropped because the user declared it.
    expect(sql).toBe("DECLARE\n  @x := 1,\n  @y := 99 SELECT @x + @y")
    expect(insertedRange?.start).toBe(0)
    // The wire-block range covers the FULL merged DECLARE; `delta` is just
    // the size change (used for the body shift after the block ends).
    const wireBlock = "DECLARE\n  @x := 1,\n  @y := 99"
    expect(insertedRange?.end).toBe(wireBlock.length)
    expect(insertedRange?.delta).toBe(sql.length - original.length)
  })

  it("merge with multiple user assignments: wire block covers all locals, delta = total byte change", () => {
    // The merge case where the simple `position - delta` math would mis-map
    // positions inside the user's @a — the canonical `,\n  ` separator we
    // emit doesn't match the user's `, ` separator, so shifts vary.
    // `insertedRange.end` extending past the last user assignment ensures
    // the validator wrapper treats any error inside the block as
    // "in DECLARE block" rather than back-mapping incorrectly.
    const original = "DECLARE @a := 1, @b := 2 SELECT @a + @b"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "99" }),
    )
    const wireBlock = "DECLARE\n  @x := 99,\n  @a := 1,\n  @b := 2"
    expect(sql).toBe(`${wireBlock} SELECT @a + @b`)
    expect(insertedRange).toEqual({
      start: 0,
      end: wireBlock.length,
      delta: sql.length - original.length,
    })
    // A position INSIDE @a (in wire coords) must be inside [start, end) so
    // the validator wrapper falls through to the "in DECLARE block" branch
    // — back-mapping with `delta` would point at the wrong column.
    const wireAtPosOfA = wireBlock.indexOf("@a")
    expect(wireAtPosOfA).toBeGreaterThanOrEqual(insertedRange!.start)
    expect(wireAtPosOfA).toBeLessThan(insertedRange!.end)
  })

  it("preserves OVERRIDABLE on a user assignment when merging in a new global", () => {
    // P1 fix: the merge must not re-render the user's assignment from a plain
    // name/value map — that would silently drop OVERRIDABLE and change view
    // semantics (caller-can-override flag).
    const { sql } = prependGlobalsDeclare(
      "DECLARE OVERRIDABLE @y := 99 SELECT @x + @y",
      vars({ x: "1" }),
    )
    expect(sql).toBe(
      "DECLARE\n  @x := 1,\n  OVERRIDABLE @y := 99 SELECT @x + @y",
    )
  })

  it("preserves OVERRIDABLE across multiple user assignments in a merge", () => {
    const { sql } = prependGlobalsDeclare(
      "DECLARE OVERRIDABLE @a := 1, @b := 2 SELECT @a + @b + @c",
      vars({ c: "3" }),
    )
    expect(sql).toBe(
      "DECLARE\n  @c := 3,\n  OVERRIDABLE @a := 1,\n  @b := 2 SELECT @a + @b + @c",
    )
  })

  it("no-ops when the user's leading DECLARE contains an invalid `=` assignment", () => {
    // P1 fix: don't silently rewrite the user's broken SQL into something
    // executable just because we have a global. Let the server emit
    // `expected variable assignment operator ':='`.
    const sql = "DECLARE @x = 1 SELECT @x"
    expect(prependGlobalsDeclare(sql, vars({ x: "10" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("no-ops when ANY user assignment is invalid, even if globals are non-shadowed", () => {
    const sql = "DECLARE @x := 1, @y = 2 SELECT @x + @y + @z"
    expect(prependGlobalsDeclare(sql, vars({ z: "3" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("EXPLAIN: recurses into the suffix and inserts before the inner SELECT", () => {
    const original = "EXPLAIN SELECT @x"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "1" }),
    )
    expect(sql).toBe("EXPLAIN DECLARE\n  @x := 1\nSELECT @x")
    const blockLen = "DECLARE\n  @x := 1\n".length
    expect(insertedRange).toEqual({
      start: "EXPLAIN ".length,
      end: "EXPLAIN ".length + blockLen,
      delta: blockLen,
    })
  })

  it("EXPLAIN with user DECLARE: drops shadowed global, no-op when all shadowed", () => {
    const sql = "EXPLAIN DECLARE @x := 99 SELECT @x"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("EXPLAIN with user DECLARE: merges non-shadowed globals", () => {
    const { sql } = prependGlobalsDeclare(
      "EXPLAIN DECLARE @y := 99 SELECT @x + @y",
      vars({ x: "1" }),
    )
    expect(sql).toBe("EXPLAIN DECLARE\n  @x := 1,\n  @y := 99 SELECT @x + @y")
  })

  it("INSERT INTO is a no-op (phase-1 fallback)", () => {
    const sql = "INSERT INTO t SELECT @x"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("WITH cte ... INSERT INTO is a no-op (WITH-led but not a SELECT body)", () => {
    // `WITH ... INSERT INTO ... SELECT ...` is valid user SQL but is NOT a
    // valid DECLARE target — the grammar is `DECLARE ... [WITH ...] SELECT`.
    // Prepending would produce a server error.
    const sql = "WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("EXPLAIN WITH ... INSERT is a no-op (recursion delegates to analyzer)", () => {
    const sql = "EXPLAIN WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("WITH cte ... SELECT IS prepended (valid DECLARE target)", () => {
    const original = "WITH cte AS (SELECT 1 AS v) SELECT @x + v FROM cte"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "1" }),
    )
    expect(sql).toBe(
      `DECLARE\n  @x := 1\nWITH cte AS (SELECT 1 AS v) SELECT @x + v FROM cte`,
    )
    expect(insertedRange?.start).toBe(0)
  })

  it("DECLARE @x := 1 INSERT INTO ... is a no-op (parse-recovery sham)", () => {
    // Parser recovery produces a declareClause + an orphan insertStatement.
    // We must NOT silently rewrite the user's invalid SQL into something
    // executable just because `x` doesn't shadow.
    const sql = "DECLARE @x := 1 INSERT INTO t SELECT @x"
    // Use a non-shadowing global so the merge would otherwise try to fire.
    expect(prependGlobalsDeclare(sql, vars({ y: "2" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("DECLARE @x := 1 (no body) is a no-op (parser error, not a SELECT)", () => {
    const sql = "DECLARE @x := 1"
    expect(prependGlobalsDeclare(sql, vars({ y: "2" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("CREATE TABLE AS is a no-op (phase-1 fallback)", () => {
    const sql = "CREATE TABLE foo AS (DECLARE @x := 99 SELECT @x)"
    expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
      sql,
      insertedRange: null,
    })
  })

  it("UPDATE / DROP / ALTER / SHOW: all no-ops", () => {
    for (const sql of [
      "UPDATE t SET v = 1",
      "DROP TABLE t",
      "ALTER TABLE t ADD COLUMN c INT",
      "SHOW TABLES",
    ]) {
      expect(prependGlobalsDeclare(sql, vars({ x: "1" }))).toEqual({
        sql,
        insertedRange: null,
      })
    }
  })

  it("drops globals with invalid identifier names without affecting valid ones", () => {
    const { sql, insertedRange } = prependGlobalsDeclare(
      "SELECT @x, @good FROM t",
      vars({ x: "1", "bad-name": "2", good: "3" }),
    )
    expect(sql).toBe(
      "DECLARE\n  @x := 1,\n  @good := 3\nSELECT @x, @good FROM t",
    )
    expect(insertedRange?.delta).toBeGreaterThan(0)
  })

  it("insertedRange.delta matches the actual byte difference", () => {
    const original = "SELECT @x"
    const { sql, insertedRange } = prependGlobalsDeclare(
      original,
      vars({ x: "1" }),
    )
    expect(sql.length - original.length).toBe(insertedRange?.delta)
  })

  it("does not substitute @x in string literals or comments (server resolves it)", () => {
    // We don't do substitution anymore — the server handles @x reference resolution.
    // Just confirm we don't accidentally rewrite comments / string literals.
    const { sql } = prependGlobalsDeclare(
      "SELECT @x, 'has @x in string', /* @x in comment */ @x",
      vars({ x: "1" }),
    )
    expect(sql).toContain("'has @x in string'")
    expect(sql).toContain("/* @x in comment */")
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

describe("mapWireErrorPosition", () => {
  const range = { start: 10, end: 30, delta: 20 }

  it("passes a position before the insertion point straight through", () => {
    // Given a wire error positioned before the injected DECLARE block
    // When mapped
    // Then the original position is returned unchanged
    expect(mapWireErrorPosition(range, 4)).toEqual({
      kind: "passthrough",
      position: 4,
    })
  })

  it("clamps a position inside the DECLARE block to the block start", () => {
    // Given a wire error landing within the injected block
    // When mapped
    // Then it is clamped to the block start and flagged as in-block
    expect(mapWireErrorPosition(range, 20)).toEqual({
      kind: "inDeclareBlock",
      position: 10,
    })
  })

  it("shifts a position after the DECLARE block back by delta", () => {
    // Given a wire error positioned after the injected block
    // When mapped
    // Then it is shifted back into user-SQL coordinates by delta
    expect(mapWireErrorPosition(range, 35)).toEqual({
      kind: "shifted",
      position: 15,
    })
  })

  it("treats position === start as inside the block (lower boundary)", () => {
    // Given a wire error exactly at the block start
    // When mapped
    // Then it is treated as inside the block, not as passthrough
    expect(mapWireErrorPosition(range, 10)).toEqual({
      kind: "inDeclareBlock",
      position: 10,
    })
  })

  it("treats position === end as after the block (upper boundary)", () => {
    // Given a wire error exactly at the block end
    // When mapped
    // Then it is shifted, since end is exclusive for the in-block range
    expect(mapWireErrorPosition(range, 30)).toEqual({
      kind: "shifted",
      position: 10,
    })
  })

  it("treats position === end-1 as inside the block (last in-block offset)", () => {
    // Given a wire error one position before the block end
    // When mapped
    // Then it is still inside the block
    expect(mapWireErrorPosition(range, 29)).toEqual({
      kind: "inDeclareBlock",
      position: 10,
    })
  })
})
