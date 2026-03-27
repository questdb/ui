import { describe, it, expect } from "vitest"
import {
  extractJsonWithExpectedFields,
  parseCustomProviderResponse,
  safeJsonParse,
} from "./shared"

type SqlResponse = { sql: string | null; explanation: string }
type TitleResponse = { title: string }
type ExplainResponse = { explanation: string }

const sqlFields = ["sql", "explanation"]
const titleFields = ["title"]
const explainFields = ["explanation"]

const sqlFallback = (raw: string): SqlResponse => ({
  explanation: raw,
  sql: null,
})
const titleFallback = (raw: string): TitleResponse => ({
  title: raw.trim().slice(0, 40),
})
const explainFallback = (raw: string): ExplainResponse => ({
  explanation: raw,
})

describe("parseCustomProviderResponse", () => {
  // ─── Step 1: Direct JSON.parse ───────────────────────────────────

  describe("step 1: valid JSON string", () => {
    it("parses valid JSON with sql and explanation", () => {
      const text = JSON.stringify({
        sql: "SELECT * FROM trades",
        explanation: "Fetches all trades",
      })
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({
        sql: "SELECT * FROM trades",
        explanation: "Fetches all trades",
      })
    })

    it("parses valid JSON with title", () => {
      const text = JSON.stringify({ title: "My Chat" })
      const result = parseCustomProviderResponse<TitleResponse>(
        text,
        titleFields,
        titleFallback,
      )
      expect(result).toEqual({ title: "My Chat" })
    })

    it("parses valid JSON with explanation only", () => {
      const text = JSON.stringify({ explanation: "This is an explanation" })
      const result = parseCustomProviderResponse<ExplainResponse>(
        text,
        explainFields,
        explainFallback,
      )
      expect(result).toEqual({ explanation: "This is an explanation" })
    })

    it("parses valid JSON with null sql", () => {
      const text = JSON.stringify({
        sql: null,
        explanation: "No SQL needed",
      })
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: null, explanation: "No SQL needed" })
    })

    it("returns full parsed object even with extra fields in step 1", () => {
      const text = JSON.stringify({
        sql: "SELECT 1",
        explanation: "test",
        extra: "ignored by caller but present",
      })
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      // Step 1 returns JSON.parse(text) as-is, including extra fields
      expect(result.sql).toBe("SELECT 1")
      expect(result.explanation).toBe("test")
    })
  })

  // ─── Step 2: JSON in ```json ``` block ───────────────────────────

  describe("step 2: JSON in ```json block", () => {
    it("extracts JSON from ```json block", () => {
      const text =
        'Here is the result:\n\n```json\n{"sql": "SELECT 1", "explanation": "Returns 1"}\n```'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "Returns 1" })
    })

    it("extracts JSON from ```json block with pretty-printed JSON", () => {
      const text = `Some preamble text.

\`\`\`json
{
  "sql": "SELECT * FROM t",
  "explanation": "Gets all rows"
}
\`\`\``
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({
        sql: "SELECT * FROM t",
        explanation: "Gets all rows",
      })
    })

    it("handles ```json block with nested markdown code blocks in explanation", () => {
      const explanation =
        "# ASOF JOIN\n\n```sql\nSELECT * FROM t1 ASOF JOIN t2\n```\n\nMore text\n\n```sql\nSELECT 1\n```"
      const json = JSON.stringify({
        sql: "SELECT * FROM t1 ASOF JOIN t2",
        explanation,
      })
      const text = `Here is the response:\n\n\`\`\`json\n${json}\n\`\`\``
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT * FROM t1 ASOF JOIN t2")
      expect(result.explanation).toBe(explanation)
    })

    it("extracts title from ```json block", () => {
      const text =
        'Generated title:\n\n```json\n{"title": "Trade Analysis"}\n```'
      const result = parseCustomProviderResponse<TitleResponse>(
        text,
        titleFields,
        titleFallback,
      )
      expect(result).toEqual({ title: "Trade Analysis" })
    })

    it("only includes expected fields from ```json block", () => {
      const text =
        '```json\n{"sql": "SELECT 1", "explanation": "test", "confidence": 0.9}\n```'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
      expect((result as Record<string, unknown>).confidence).toBeUndefined()
    })
  })

  // ─── Step 2: Bare JSON with preamble ─────────────────────────────

  describe("step 2: bare JSON without ```json wrapper", () => {
    it("extracts bare JSON after preamble text", () => {
      const text =
        'Excellent! Here is the response:\n\n{"sql": "SELECT 1", "explanation": "Returns one"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "Returns one" })
    })

    it("extracts bare JSON with preamble and epilogue", () => {
      const text =
        'Here:\n{"sql": null, "explanation": "No query needed"}\nHope this helps!'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: null, explanation: "No query needed" })
    })

    it("handles preamble text that contains curly braces", () => {
      const text =
        'Using {ASOF JOIN} syntax:\n\n{"sql": "SELECT 1", "explanation": "test"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("extracts bare pretty-printed JSON after preamble", () => {
      const text = `Let me provide the final response:

{
  "sql": "SELECT * FROM trades LIMIT 10",
  "explanation": "Fetches recent trades"
}`
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({
        sql: "SELECT * FROM trades LIMIT 10",
        explanation: "Fetches recent trades",
      })
    })
  })

  // ─── Step 2: JSON with complex content ───────────────────────────

  describe("step 2: complex content in JSON values", () => {
    it("handles explanation with curly braces inside strings", () => {
      const text =
        'Result:\n\n{"sql": "SELECT 1", "explanation": "Use {curly braces} in templates"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.explanation).toBe("Use {curly braces} in templates")
    })

    it("handles explanation with escaped quotes", () => {
      const json = JSON.stringify({
        sql: 'SELECT * FROM "my table"',
        explanation: 'Use "double quotes" for identifiers',
      })
      const text = `Here:\n${json}`
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe('SELECT * FROM "my table"')
      expect(result.explanation).toBe('Use "double quotes" for identifiers')
    })

    it("handles SQL with complex nested queries", () => {
      const sql =
        "SELECT t.*, m.bids[1,1] FROM trades t ASOF JOIN market_data m ON (t.symbol = m.symbol) WHERE t.timestamp IN yesterday()"
      const json = JSON.stringify({ sql, explanation: "Complex join query" })
      const text = `\`\`\`json\n${json}\n\`\`\``
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe(sql)
    })

    it("handles real-world DeepSeek response with nested markdown code blocks", () => {
      // Simulates the actual failing case from DeepSeek via OpenRouter
      const explanation =
        "# ASOF JOIN\n\n## Basic Syntax\n\n```sql\nSELECT columns\nFROM left_table\nASOF JOIN right_table ON (matching_columns)\n```\n\n## Example\n\n```sql\nSELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)\n```\n\nMore details here."
      const innerJson = JSON.stringify({
        sql: "SELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)",
        explanation,
      })
      const text = `Perfect! Now I'll provide you with a comprehensive response.\n\n\`\`\`json\n${innerJson}\n\`\`\``
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe(
        "SELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)",
      )
      expect(result.explanation).toBe(explanation)
    })

    it("handles real-world DeepSeek response with bare JSON (no ```json wrapper)", () => {
      // Simulates the actual failing case from DeepSeek via DeepInfra
      const explanation =
        "# ASOF JOIN in QuestDB\n\n## Example\n\n```sql\nSELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)\n```"
      const innerJson = JSON.stringify({
        sql: "SELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)",
        explanation,
      })
      const text = `Excellent! Now let me provide the final response with examples:\n\n${innerJson}`
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe(
        "SELECT t.*, m.bids[1,1]\nFROM trades t\nASOF JOIN market_data m ON (symbol)",
      )
      expect(result.explanation).toBe(explanation)
    })
  })

  // ─── Step 2: Missing expected fields ─────────────────────────────

  describe("step 2: missing expected fields", () => {
    it("falls back when JSON in ```json block has wrong fields", () => {
      const text = '```json\n{"query": "SELECT 1", "description": "test"}\n```'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      // Falls to fallback because "sql" and "explanation" are missing
      expect(result).toEqual({
        explanation: text,
        sql: null,
      })
    })

    it("falls back when bare JSON has wrong fields", () => {
      const text = 'Here:\n{"answer": "SELECT 1", "reasoning": "because"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({
        explanation: text,
        sql: null,
      })
    })

    it("falls back when JSON has only some expected fields", () => {
      const text = '{"explanation": "test"}'
      // Step 1 parses it successfully — this is valid JSON
      // But wait, step 1 returns JSON.parse as-is without field checking
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      // Step 1 returns it as-is (no field validation in step 1)
      expect(result.explanation).toBe("test")
      expect(result.sql).toBeUndefined()
    })
  })

  // ─── Step 2: Invalid JSON repaired by jsonrepair ────────────────

  describe("step 2: malformed JSON repaired by jsonrepair", () => {
    it("repairs trailing commas in ```json block", () => {
      const text = '```json\n{"sql": "SELECT 1", "explanation": "test",}\n```'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("repairs single-quoted strings in bare JSON", () => {
      const text = "Here:\n{'sql': 'SELECT 1', 'explanation': 'test'}"
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("repairs unquoted keys", () => {
      const text = '{sql: "SELECT 1", explanation: "test"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("repairs Python boolean/null constants (True, False, None)", () => {
      const text = '{"sql": None, "explanation": "No query needed"}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBeNull()
      expect(result.explanation).toBe("No query needed")
    })

    it("repairs trailing comma + unquoted keys combined", () => {
      const text = "Preamble:\n{sql: 'SELECT 1', explanation: 'works',}"
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "works" })
    })

    it("repairs missing closing brace (truncated JSON)", () => {
      // jsonrepair can add the missing brace
      const text = '{"sql": "SELECT 1", "explanation": "truncated'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT 1")
      expect(result.explanation).toBe("truncated")
    })
  })

  // ─── Step 2: Unrepairable invalid JSON ─────────────────────────

  describe("step 2: unrepairable invalid JSON", () => {
    it("falls back when ```json block contains gibberish", () => {
      const text = "```json\n{invalid json here}\n```"
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: text, sql: null })
    })
  })

  // ─── Step 3: jsonrepair on full text ───────────────────────────

  describe("step 3: jsonrepair on full text", () => {
    it("repairs full-text malformed JSON (no preamble)", () => {
      const text = "{'title': 'My Chat',}"
      const result = parseCustomProviderResponse<TitleResponse>(
        text,
        titleFields,
        titleFallback,
      )
      expect(result).toEqual({ title: "My Chat" })
    })

    it("repairs JSON with comments", () => {
      // jsonrepair strips JS comments
      const text =
        '{\n  "sql": "SELECT 1", // the query\n  "explanation": "test"\n}'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT 1")
      expect(result.explanation).toBe("test")
    })
  })

  // ─── Step 4: Fallback to raw text ────────────────────────────────

  describe("step 4: fallback", () => {
    it("returns fallback for plain text response", () => {
      const text = "I can help you write a query for that."
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: text, sql: null })
    })

    it("returns fallback for empty string", () => {
      const result = parseCustomProviderResponse<SqlResponse>(
        "",
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: "", sql: null })
    })

    it("returns title fallback for plain text", () => {
      const text = "Trade Analysis Overview"
      const result = parseCustomProviderResponse<TitleResponse>(
        text,
        titleFields,
        titleFallback,
      )
      expect(result).toEqual({ title: "Trade Analysis Overview" })
    })

    it("truncates long title in fallback", () => {
      const text =
        "This is a very long title that should be truncated to forty characters maximum"
      const result = parseCustomProviderResponse<TitleResponse>(
        text,
        titleFields,
        titleFallback,
      )
      expect(result.title.length).toBeLessThanOrEqual(40)
    })

    it("returns fallback for markdown without JSON", () => {
      const text =
        "# Query Help\n\nYou can use `SELECT * FROM trades` to get all trades."
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: text, sql: null })
    })

    it("returns fallback when text has braces but no valid JSON", () => {
      const text =
        "Use the following syntax: if (x > 0) { return x; } else { return -x; }"
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: text, sql: null })
    })
  })

  // ─── Edge cases ──────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty expectedFields (matches any valid JSON object)", () => {
      const text = 'Preamble\n{"foo": "bar"}'
      const result = parseCustomProviderResponse<Record<string, unknown>>(
        text,
        [],
        (raw) => ({ raw }),
      )
      // Empty expectedFields means every() is vacuously true,
      // but only expected fields are extracted → empty object
      expect(result).toEqual({})
    })

    it("handles JSON array (not object) — falls back", () => {
      const text = '[{"sql": "SELECT 1"}]'
      // Step 1: JSON.parse succeeds and returns the array
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      // Arrays are returned as-is from step 1
      expect(Array.isArray(result)).toBe(true)
    })

    it("handles multiple JSON objects in text — picks first with expected fields", () => {
      const text =
        '{"wrong": true}\n\n{"sql": "SELECT 1", "explanation": "test"}'
      // Step 1: JSON.parse fails (two objects aren't valid single JSON)
      // Step 2: first { → {"wrong": true} → valid but wrong fields → next {
      //         second { → finds the correct one
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("handles deeply nested JSON braces", () => {
      const sql = "SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t"
      const text = `Result:\n${JSON.stringify({ sql, explanation: "CASE expression" })}`
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe(sql)
    })

    it("handles unicode content", () => {
      const text = JSON.stringify({
        sql: "SELECT * FROM données",
        explanation: "Récupère toutes les données 日本語テスト",
      })
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT * FROM données")
      expect(result.explanation).toContain("日本語テスト")
    })

    it("handles whitespace-only content", () => {
      const result = parseCustomProviderResponse<SqlResponse>(
        "   \n\n  ",
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ explanation: "   \n\n  ", sql: null })
    })

    it("handles ``` block without json language tag", () => {
      const text =
        'Here:\n\n```\n{"sql": "SELECT 1", "explanation": "test"}\n```'
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    })

    it("handles JSON with very long explanation containing multiple code blocks", () => {
      const explanation = [
        "# Complex Query",
        "",
        "First, create the table:",
        "```sql",
        "CREATE TABLE trades (symbol STRING, price DOUBLE, ts TIMESTAMP) timestamp(ts);",
        "```",
        "",
        "Then insert data:",
        "```sql",
        "INSERT INTO trades VALUES('BTC', 50000, now());",
        "```",
        "",
        "Finally, query it:",
        "```sql",
        "SELECT * FROM trades WHERE symbol = 'BTC';",
        "```",
      ].join("\n")
      const json = JSON.stringify({
        sql: "SELECT * FROM trades WHERE symbol = 'BTC'",
        explanation,
      })
      const text = `\`\`\`json\n${json}\n\`\`\``
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT * FROM trades WHERE symbol = 'BTC'")
      expect(result.explanation).toBe(explanation)
    })

    it("handles JSON where explanation contains JSON-like text", () => {
      const json = JSON.stringify({
        sql: "SELECT 1",
        explanation:
          'The response format is {"key": "value"} and you can nest {objects: {inside}} as needed.',
      })
      const text = `Response:\n${json}`
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT 1")
      expect(result.explanation).toContain('{"key": "value"}')
    })

    it("handles JSON with escaped backslashes and special chars", () => {
      const text = JSON.stringify({
        sql: "SELECT '\\n' FROM t",
        explanation: "Selects a backslash-n string\ttab",
      })
      const result = parseCustomProviderResponse<SqlResponse>(
        text,
        sqlFields,
        sqlFallback,
      )
      expect(result.sql).toBe("SELECT '\\n' FROM t")
      expect(result.explanation).toBe("Selects a backslash-n string\ttab")
    })
  })
})

describe("extractJsonWithExpectedFields", () => {
  // ─── Basic extraction ───────────────────────────────────────────

  it("extracts valid JSON with all expected fields", () => {
    const text = '{"sql": "SELECT 1", "explanation": "test"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("returns only expected fields, stripping extras", () => {
    const text = '{"sql": "SELECT 1", "explanation": "test", "confidence": 0.9}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
    expect(result).not.toHaveProperty("confidence")
  })

  it("returns null when no JSON found", () => {
    const result = extractJsonWithExpectedFields("plain text", ["sql"])
    expect(result).toBeNull()
  })

  it("returns null for empty string", () => {
    const result = extractJsonWithExpectedFields("", ["sql"])
    expect(result).toBeNull()
  })

  it("returns null when no opening brace exists", () => {
    const result = extractJsonWithExpectedFields("no braces here", ["sql"])
    expect(result).toBeNull()
  })

  // ─── Field matching ─────────────────────────────────────────────

  it("returns null when JSON is valid but missing expected fields", () => {
    const text = '{"query": "SELECT 1", "description": "test"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toBeNull()
  })

  it("returns null when only some expected fields present", () => {
    const text = '{"sql": "SELECT 1"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toBeNull()
  })

  it("matches with empty expectedFields (vacuously true)", () => {
    const text = '{"anything": "works"}'
    const result = extractJsonWithExpectedFields(text, [])
    expect(result).toEqual({})
  })

  it("includes fields with null values", () => {
    const text = '{"sql": null, "explanation": "No query needed"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: null, explanation: "No query needed" })
  })

  it("includes fields with falsy values (0, false, empty string)", () => {
    const text = '{"count": 0, "active": false, "name": ""}'
    const result = extractJsonWithExpectedFields(text, [
      "count",
      "active",
      "name",
    ])
    expect(result).toEqual({ count: 0, active: false, name: "" })
  })

  // ─── Preamble and epilogue ──────────────────────────────────────

  it("extracts JSON after preamble text", () => {
    const text =
      'Here is the result:\n\n{"sql": "SELECT 1", "explanation": "test"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("extracts JSON with both preamble and epilogue", () => {
    const text = 'Result:\n{"title": "My Chat"}\nHope that helps!'
    const result = extractJsonWithExpectedFields(text, ["title"])
    expect(result).toEqual({ title: "My Chat" })
  })

  it("extracts JSON from ```json code block", () => {
    const text = '```json\n{"sql": "SELECT 1", "explanation": "test"}\n```'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  // ─── Multiple JSON objects ──────────────────────────────────────

  it("skips first JSON object if it lacks expected fields", () => {
    const text = '{"wrong": true}\n\n{"sql": "SELECT 1", "explanation": "test"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("when multiple matching objects exist, jsonrepair merges them (last wins)", () => {
    const text =
      '{"sql": "SELECT 1", "explanation": "first"}\n{"sql": "SELECT 2", "explanation": "second"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    // jsonrepair merges concatenated objects, later keys overwrite earlier ones
    expect(result).toEqual({ sql: "SELECT 2", explanation: "second" })
  })

  it("skips non-JSON brace text to find real JSON", () => {
    const text =
      'Use {curly braces} for templates\n{"sql": "SELECT 1", "explanation": "found"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "found" })
  })

  // ─── jsonrepair fallback ────────────────────────────────────────

  it("repairs trailing commas via jsonrepair", () => {
    const text = '{"sql": "SELECT 1", "explanation": "test",}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("repairs single-quoted strings via jsonrepair", () => {
    const text = "{'sql': 'SELECT 1', 'explanation': 'test'}"
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("repairs unquoted keys via jsonrepair", () => {
    const text = '{sql: "SELECT 1", explanation: "test"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("repairs Python None to null via jsonrepair", () => {
    const text = '{"sql": None, "explanation": "No query"}'
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: null, explanation: "No query" })
  })

  // ─── Complex content ────────────────────────────────────────────

  it("handles nested braces inside string values", () => {
    const text = JSON.stringify({
      sql: "SELECT 1",
      explanation: "Use {curly braces} in {templates}",
    })
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result!.explanation).toBe("Use {curly braces} in {templates}")
  })

  it("handles escaped quotes inside string values", () => {
    const text = JSON.stringify({
      sql: 'SELECT * FROM "my table"',
      explanation: 'Use "double quotes" for identifiers',
    })
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result!.sql).toBe('SELECT * FROM "my table"')
  })

  it("handles newlines inside string values", () => {
    const text = JSON.stringify({
      sql: "SELECT *\nFROM trades\nLIMIT 10",
      explanation: "Multi-line query",
    })
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result!.sql).toBe("SELECT *\nFROM trades\nLIMIT 10")
  })

  it("handles pretty-printed JSON", () => {
    const text = `{
  "sql": "SELECT 1",
  "explanation": "test"
}`
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({ sql: "SELECT 1", explanation: "test" })
  })

  it("handles unicode content", () => {
    const text = JSON.stringify({
      sql: "SELECT * FROM données",
      explanation: "日本語テスト",
    })
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result!.sql).toBe("SELECT * FROM données")
    expect(result!.explanation).toBe("日本語テスト")
  })

  it("returns null when text has braces but no valid JSON", () => {
    const text = "if (x > 0) { return x; } else { return -x; }"
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toBeNull()
  })

  it("returns null for nested non-JSON braces", () => {
    const text = "function() { if (true) { console.log('hi') } }"
    const result = extractJsonWithExpectedFields(text, ["sql"])
    expect(result).toBeNull()
  })

  it("handles single expected field", () => {
    const text = '{"title": "My Chat"}'
    const result = extractJsonWithExpectedFields(text, ["title"])
    expect(result).toEqual({ title: "My Chat" })
  })

  it("handles many expected fields", () => {
    const text = JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 })
    const result = extractJsonWithExpectedFields(text, [
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
    expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 })
  })

  it("handles JSON embedded deep in markdown", () => {
    const text = `# Response

Here is the analysis:

Some preamble with {random} braces.

\`\`\`json
{"sql": "SELECT count() FROM trades", "explanation": "Counts all trades"}
\`\`\`

And some epilogue text.`
    const result = extractJsonWithExpectedFields(text, ["sql", "explanation"])
    expect(result).toEqual({
      sql: "SELECT count() FROM trades",
      explanation: "Counts all trades",
    })
  })
})

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    const result = safeJsonParse<{ a: number }>('{"a": 1}')
    expect(result).toEqual({ a: 1 })
  })

  it("returns jsonrepair result for non-JSON text", () => {
    // jsonrepair turns plain text into a JSON string
    const result = safeJsonParse("not json at all")
    expect(result).toBe("not json at all")
  })

  it("returns empty object for empty input", () => {
    const result = safeJsonParse("{")
    expect(result).toEqual({})
  })

  it("repairs truncated JSON (missing closing brace)", () => {
    // Real-world Qwen case: tool call arguments with missing }
    const text =
      '{"category": "functions", "items": ["today", "tomorrow", "yesterday"]'
    const result = safeJsonParse<{
      category: string
      items: string[]
    }>(text)
    expect(result).toEqual({
      category: "functions",
      items: ["today", "tomorrow", "yesterday"],
    })
  })

  it("repairs trailing commas", () => {
    const result = safeJsonParse<{ table_name: string }>(
      '{"table_name": "trades",}',
    )
    expect(result).toEqual({ table_name: "trades" })
  })

  it("repairs single-quoted strings", () => {
    const result = safeJsonParse<{ query: string }>("{'query': 'SELECT 1'}")
    expect(result).toEqual({ query: "SELECT 1" })
  })

  it("repairs unquoted keys", () => {
    const result = safeJsonParse<{ table_name: string }>(
      '{table_name: "trades"}',
    )
    expect(result).toEqual({ table_name: "trades" })
  })

  it("handles empty string arguments", () => {
    const result = safeJsonParse("")
    expect(result).toEqual({})
  })
})
