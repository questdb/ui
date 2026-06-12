import { describe, it, expect } from "vitest"
import type { ColumnDefinition } from "../../utils/questdb/types"
import { buildResultPageMarkdown } from "./resultPageMarkdown"

const col = (
  name: string,
  type: string,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({ name, type, ...extra })

describe("buildResultPageMarkdown", () => {
  it("renders a pipe-aligned table padded to the widest cell per column", () => {
    // Given a two-column result and two loaded rows
    const columns = [col("symbol", "SYMBOL"), col("price", "DOUBLE")]
    const rows = [
      ["BTC", 65000],
      ["ETH", 3200],
    ]

    // When building the markdown
    const md = buildResultPageMarkdown(columns, rows)

    // Then each column is padded to fit its header and values
    expect(md).toBe(
      [
        "| symbol | price   |",
        "| ------ | ------- |",
        "| BTC    | 65000.0 |",
        "| ETH    | 3200.0  |",
      ].join("\n"),
    )
  })

  it("formats nulls and integer-valued floats like the grid does", () => {
    // Given a float column with a null and an integer-valued float
    const columns = [col("x", "DOUBLE")]
    const rows = [[null], [1]]

    // When building the markdown
    const md = buildResultPageMarkdown(columns, rows)

    // Then null renders as "null" and the float keeps its ".0"
    expect(md).toBe(["| x    |", "| ---- |", "| null |", "| 1.0  |"].join("\n"))
  })

  it("renders a QUERY PLAN result as a fenced code block", () => {
    // Given a single QUERY PLAN column with two plan lines
    const columns = [col("QUERY PLAN", "STRING")]
    const rows = [["Async JIT Filter"], ["    Row forward scan"]]

    // When building the markdown
    const md = buildResultPageMarkdown(columns, rows)

    // Then it is a fenced block, one line per row, no table pipes
    expect(md).toBe(
      ["```", "Async JIT Filter", "    Row forward scan", "```"].join("\n"),
    )
  })

  it("returns the header and separator only when no rows are loaded", () => {
    // Given columns but an empty (unloaded) page
    const columns = [col("a", "INT"), col("b", "INT")]
    const rows: (string | number | boolean | null)[][] = []

    // When building the markdown
    const md = buildResultPageMarkdown(columns, rows)

    // Then only the header and separator are emitted
    expect(md).toBe(["| a | b |", "| - | - |"].join("\n"))
  })

  it("unescapes HTML entities so exported text matches the grid", () => {
    // Given a string column whose value carries HTML entities
    const columns = [col("note", "VARCHAR")]
    const rows = [["price&gt;100"]]

    // When building the markdown
    const md = buildResultPageMarkdown(columns, rows)

    // Then the cell is unescaped, matching what the grid displays
    expect(md).toBe(
      ["| note      |", "| --------- |", "| price>100 |"].join("\n"),
    )
  })

  it("returns an empty string when there are no columns", () => {
    // Given an empty result
    // When building the markdown
    // Then the output is empty
    expect(buildResultPageMarkdown([], [])).toBe("")
  })
})
