import { describe, it, expect } from "vitest"
import { safeJsonParse } from "./shared"

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
