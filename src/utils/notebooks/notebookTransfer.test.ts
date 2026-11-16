import { describe, expect, it } from "vitest"
import { Type, type QueryRawResult } from "../questdb"
import {
  appendTransferredCells,
  buildBatchTransfer,
  createTransferCells,
  createTransferView,
  splitEditorScript,
  toTransferResult,
} from "./notebookTransfer"
import { createCell } from "../../store/notebook"
import { getQueriesFromText } from "../../scenes/Editor/Monaco/utils"
import {
  computeCellHeights,
  computeResultBottomHeight,
  DEFAULT_CHART_BOTTOM_HEIGHT,
  patchCellRunResult,
} from "../../scenes/Editor/Notebook/cellSizing"

const raw = (query: string, dataset: number[][] = [[1]]) => ({
  type: Type.DQL as const,
  query,
  dataset,
  error: undefined,
  notice: undefined,
  columns: [{ name: "x", type: "LONG" }],
  count: dataset.length,
  timings: { compiler: 0, authentication: 0, count: 0, execute: 0, fetch: 0 },
})

describe("notebook transfer", () => {
  it("splits on SQL statement boundaries without losing comments or literal whitespace", () => {
    const sql =
      "-- first\nDECLARE @a := ';' SELECT @a;\n/* explanation; */\nSELECT 'it''s;fine'; -- trailing\n"
    const cells = splitEditorScript(sql)
    expect(cells).toHaveLength(2)
    expect(cells).toEqual([
      "-- first\nDECLARE @a := ';' SELECT @a;",
      "/* explanation; */\nSELECT 'it''s;fine'; -- trailing",
    ])
    expect(cells[0]).toContain("DECLARE @a")
    expect(cells[1]).toContain("/* explanation; */")
    expect(cells[1]).toContain("-- trailing")
    expect(cells.flatMap(getQueriesFromText)).toEqual(getQueriesFromText(sql))
    expect(splitEditorScript("-- only a comment")).toEqual([])
  })

  it("trims separator whitespace instead of adding blank lines to converted cells", () => {
    expect(splitEditorScript("select 1;\n\nselect 2;\n\nselect 3;")).toEqual([
      "select 1;",
      "select 2;",
      "select 3;",
    ])
    expect(
      splitEditorScript("\r\n  select 'a\r\n\r\nb';\r\n\r\n  select 2;\r\n"),
    ).toEqual(["select 'a\r\n\r\nb';", "select 2;"])
  })

  it("captures only read results from a successful mixed batch, including empty results", () => {
    const batch = buildBatchTransfer(
      3,
      [
        { success: true, result: { type: Type.DDL } as QueryRawResult },
        { success: true, result: raw("select 1"), fetchedAt: 123 },
        {
          success: true,
          result: raw("select 2 where false", []),
          fetchedAt: 456,
        },
      ],
      3,
    )!
    expect(batch.writeCount).toBe(1)
    expect(batch.hasAllResults).toBe(true)
    expect(batch.queries.map((q) => q.sql)).toEqual([
      "select 1",
      "select 2 where false",
    ])
    expect(batch.queries[0].result?.fetchedAt).toBe(123)
    expect(batch.queries[1].result?.dataset).toEqual([])
  })

  it("does not offer partial, failed, single-result or write-only batches", () => {
    const results = [{ success: true, result: raw("select 1") }]
    expect(buildBatchTransfer(1, results, 2)).toBeUndefined()
    expect(buildBatchTransfer(1, results, 1)).toBeUndefined()
    expect(
      buildBatchTransfer(1, [...results, { success: false }], 2),
    ).toBeUndefined()
    expect(
      buildBatchTransfer(
        1,
        [{ success: true, result: { type: Type.DDL } as QueryRawResult }],
        1,
      ),
    ).toBeUndefined()
  })

  it("keeps oversized batch SQL without pretending its results were captured", () => {
    const large = { ...raw("select huge"), dataset: [["x".repeat(2_000_001)]] }
    const batch = buildBatchTransfer(
      1,
      [
        { success: true, result: large },
        { success: true, result: raw("select 2") },
      ],
      2,
    )!
    expect(batch.hasAllResults).toBe(false)
    expect(batch.queries).toEqual([{ sql: "select huge" }, { sql: "select 2" }])
  })

  it("carries the executed SQL and fetch time with refresh explicitly off", () => {
    const result = toTransferResult(raw("select 1"), 123)
    const [cell] = createTransferCells([{ sql: result.query, result }])
    expect(cell.value).toBe("select 1")
    expect(cell.autoRefresh).toBe(false)
    expect(cell.result?.results[0]).toBe(result)
    expect(cell.result?.timestamp).toBe(123)
    expect(cell.mode).toBeUndefined()
  })

  it("appends below the existing layout without changing cells, variables or refresh defaults", () => {
    const existing = createCell(0, "select 7")
    const layout = [{ i: existing.id, x: 6, y: 20, w: 6, h: 16 }]
    const variables = [{ name: "a", value: "42" }]
    const incoming = createTransferCells([
      { sql: "select 1", result: toTransferResult(raw("select 1"), 1) },
    ])
    const { parts } = appendTransferredCells(
      {
        cells: [existing],
        settings: {
          layoutMode: "grid",
          layout,
          autoRefreshDefault: true,
          variables,
        },
        focusedCellId: existing.id,
        maximizedCellId: null,
      },
      incoming,
      false,
    )
    expect(parts.cells[0]).toBe(existing)
    expect(parts.settings.layout?.[0]).toBe(layout[0])
    expect(parts.settings.layout?.[1]).toMatchObject({ x: 0, y: 36, w: 12 })
    expect(parts.settings.variables).toBe(variables)
    expect(parts.settings.autoRefreshDefault).toBe(true)
    expect(parts.cells[1].autoRefresh).toBe(false)
    expect(parts.focusedCellId).toBe(existing.id)
  })

  it("aligns editors and result panes in each comparison row", () => {
    const sql = ["select 1", "-- note\n-- details\nselect 2", "select 3"]
    const cells = createTransferCells(
      sql.map((query) => ({
        sql: query,
        result: toTransferResult(raw(query), 1),
      })),
    )
    const view = createTransferView(cells, true)
    expect(view.cells[0].topHeight).toBe(view.cells[1].topHeight)
    expect(view.cells[0].bottomHeight).toBe(view.cells[1].bottomHeight)
    expect(view.settings?.layout?.[0]).toMatchObject({ x: 0, y: 0, w: 6 })
    expect(view.settings?.layout?.[1]).toMatchObject({
      x: 6,
      y: 0,
      w: 6,
      h: view.settings?.layout?.[0].h,
    })
    expect(view.settings?.layout?.[2].y).toBe(view.settings?.layout?.[0].h)
  })

  it("sizes transferred grids to their rows, keeps charts tall and leaves results automatic", () => {
    const [grid] = createTransferCells([
      { sql: "select 1", result: toTransferResult(raw("select 1"), 1) },
    ])
    expect(computeCellHeights(grid).bottomHeight).toBe(154)
    expect(grid.bottomResized).not.toBe(true)
    const [chart] = createTransferCells([
      {
        sql: "select 1",
        result: toTransferResult(raw("select 1"), 1),
        chartConfig: { xColumn: null, queries: [] },
      },
    ])
    expect(computeCellHeights(chart).bottomHeight).toBe(
      DEFAULT_CHART_BOTTOM_HEIGHT,
    )

    const larger = {
      results: [toTransferResult(raw("select 1", [[1], [2], [3]]), 2)],
      activeResultIndex: 0,
      timestamp: 2,
    }
    const [rerun] = patchCellRunResult([grid], grid.id, larger)
    expect(rerun.bottomHeight).toBe(214)
  })

  it("fits comparison rows to the taller result and caps large results at ten visible rows", () => {
    const counts = [0, 1, 3, 30, 1]
    const cells = createTransferCells(
      counts.map((count, i) => ({
        sql: `select ${i}`,
        result: toTransferResult(
          raw(
            `select ${i}`,
            Array.from({ length: count }, () => [i]),
          ),
          1,
        ),
      })),
    )
    const view = createTransferView(cells, true)
    expect(view.cells.map((c) => computeCellHeights(c).bottomHeight)).toEqual([
      154, 154, 424, 424, 154,
    ])
    expect(view.cells.every((c) => !c.bottomResized)).toBe(true)
    expect(view.cells[3].bottomHeight).toBe(
      computeResultBottomHeight(cells[3].result, cells[3].value),
    )
    const layout = view.settings!.layout!
    expect(layout[0].h).toBe(layout[1].h)
    expect(layout[2].h).toBe(layout[3].h)
    expect(layout[2].y).toBe(layout[0].h)
    expect(layout[4].y).toBe(layout[0].h + layout[2].h)
  })

  it("preserves a whole script without running it, and rejects capacity overflow", () => {
    const sql =
      "CREATE TABLE t(x int); INSERT INTO t VALUES(1); SELECT * FROM t;"
    const [cell] = createTransferCells([{ sql }])
    expect(cell.value).toBe(sql)
    expect(cell.result).toBeUndefined()
    expect(cell.mode).toBeUndefined()
    expect(() =>
      createTransferCells(
        Array.from({ length: 201 }, () => ({ sql: "select 1" })),
      ),
    ).toThrow("200")
    expect(() =>
      appendTransferredCells(
        {
          cells: Array.from({ length: 200 }, (_, i) => createCell(i)),
          settings: {},
          focusedCellId: null,
          maximizedCellId: null,
        },
        [cell],
        false,
      ),
    ).toThrow("200")
  })
})
