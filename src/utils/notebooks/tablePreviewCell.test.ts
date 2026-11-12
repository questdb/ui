import { describe, expect, it } from "vitest"
import {
  buildTablePreviewCell,
  TABLE_PREVIEW_AUTO_REFRESH,
  tablePreviewSql,
} from "./tablePreviewCell"

describe("tablePreviewSql", () => {
  it("reads newest rows first when the table has a designated timestamp", () => {
    expect(tablePreviewSql("trades", "timestamp")).toBe(
      "SELECT * FROM trades ORDER BY timestamp DESC",
    )
  })

  it("falls back to a plain select without a designated timestamp", () => {
    expect(tablePreviewSql("lookup")).toBe("SELECT * FROM lookup")
  })

  it("double-quotes table names that are not plain identifiers", () => {
    expect(tablePreviewSql("my table", "ts")).toBe(
      'SELECT * FROM "my table" ORDER BY ts DESC',
    )
    expect(tablePreviewSql("it's", "ts")).toBe(
      `SELECT * FROM "it's" ORDER BY ts DESC`,
    )
    expect(tablePreviewSql("sys.metrics", "ts")).toBe(
      'SELECT * FROM "sys.metrics" ORDER BY ts DESC',
    )
  })

  it("double-quotes a designated timestamp that is not a plain identifier", () => {
    expect(tablePreviewSql("t", "my ts")).toBe(
      'SELECT * FROM t ORDER BY "my ts" DESC',
    )
    expect(tablePreviewSql("t", "zeit_ü")).toBe(
      'SELECT * FROM t ORDER BY "zeit_ü" DESC',
    )
    expect(tablePreviewSql("t", 'a"b')).toBe(
      'SELECT * FROM t ORDER BY "a""b" DESC',
    )
  })

  it("double-quotes names that are SQL keywords", () => {
    // QuestDB rejects `SELECT * FROM order`; keywords must be quoted
    expect(tablePreviewSql("order", "ts")).toBe(
      'SELECT * FROM "order" ORDER BY ts DESC',
    )
    expect(tablePreviewSql("Select")).toBe('SELECT * FROM "Select"')
    expect(tablePreviewSql("t", "limit")).toBe(
      'SELECT * FROM t ORDER BY "limit" DESC',
    )
  })

  it("leaves names that are only data type words bare", () => {
    expect(tablePreviewSql("trades", "timestamp")).toBe(
      "SELECT * FROM trades ORDER BY timestamp DESC",
    )
  })
})

describe("buildTablePreviewCell", () => {
  it("leaves refresh to the notebook, shows the SQL, and colours rows by side", () => {
    const cell = buildTablePreviewCell("trades", "timestamp")
    // Auto comes from the notebook default, so the cell is no override
    expect(cell.autoRefresh).toBeUndefined()
    expect(TABLE_PREVIEW_AUTO_REFRESH).toBe(true)
    expect(cell.paneView).toBe("editor_result")
    expect(cell.name).toBe("Latest rows of trades")
    expect(cell.highlightConfig?.identityColumns).toEqual(["timestamp"])
    expect(cell.highlightConfig?.rules.map((r) => r.kind)).toEqual([
      "value",
      "value",
    ])
    expect(cell.highlightConfig?.rules[0]).toMatchObject({
      target: { kind: "column", name: "side" },
      appliesTo: "row",
      condition: { op: "eq", value: "buy" },
    })
  })

  it("uses no range-relative rules (no gradients, no new-row flash)", () => {
    const rules = buildTablePreviewCell("lookup").highlightConfig?.rules ?? []
    expect(rules.every((r) => r.kind === "value")).toBe(true)
    expect(
      rules.some((r) => r.kind === "value" && r.condition.op === "between"),
    ).toBe(false)
  })
})
