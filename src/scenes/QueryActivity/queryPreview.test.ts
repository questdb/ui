import { describe, expect, it } from "vitest"
import { buildQueryPreview, formatQuery } from "./queryPreview"

describe("formatQuery", () => {
  it("formats a one-line query across lines", () => {
    // Given
    const query =
      "SELECT symbol, count() FROM trades WHERE price > 10 GROUP BY symbol"

    // When / Then
    expect(formatQuery(query).split("\n").length).toBeGreaterThan(1)
  })
})

describe("buildQueryPreview", () => {
  it("keeps a short query intact", () => {
    // Given
    const formatted = formatQuery("SELECT symbol FROM trades")

    // When
    const preview = buildQueryPreview(formatted)

    // Then
    expect(preview.text).toBe(formatted)
    expect(preview.grayedOutLines).toBeNull()
  })

  it("truncates a long query and grays the elided middle", () => {
    // Given a query that formats to well over ten lines
    const columns = Array.from({ length: 30 }, (_, i) => `col_${i}`).join(", ")
    const query = `SELECT ${columns} FROM trades`

    // When
    const preview = buildQueryPreview(formatQuery(query))

    // Then
    expect(preview.text.split("\n").length).toBeLessThanOrEqual(9)
    expect(preview.text).toContain("...")
    expect(preview.grayedOutLines).not.toBeNull()
  })
})
