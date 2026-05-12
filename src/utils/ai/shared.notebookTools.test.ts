import { describe, it, expect, vi } from "vitest"
import { dispatchTool } from "../tools/dispatch"
import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import { NotebookToolError } from "../notebookAIBridge"
import { dispatchMCPTool } from "../mcp/dispatchMCPTool"
import { EXPECTED_BRIDGE_VERSION } from "../mcp/protocolVersion"

const makeClient = (
  overrides: Partial<ModelToolsClient> = {},
): ModelToolsClient => ({
  validateQuery: () => Promise.resolve({ valid: true }),
  validateSqlRaw: () =>
    Promise.resolve({ query: "", columns: [], timestamp: 0 }),
  runQueryRaw: () =>
    Promise.resolve({
      type: "dql" as const,
      columns: [],
      dataset: [],
      count: 0,
    }),
  createNotebook: vi.fn(() =>
    Promise.resolve({ bufferId: 1, label: "Notebook 1" }),
  ),
  listCells: vi.fn(() => Promise.resolve([])),
  getCell: vi.fn(() =>
    Promise.resolve({ id: "c", type: "sql", value: "", position: 0 }),
  ),
  getNotebookState: vi.fn(() =>
    Promise.resolve({
      status: "ok" as const,
      buffer_id: 1,
      label: "x",
      layout_mode: "list" as const,
      maximized_cell_id: null,
      cells: [],
    }),
  ),
  addCell: vi.fn(() => Promise.resolve({ cellId: "new-cell" })),
  updateCell: vi.fn(() => Promise.resolve()),
  deleteCell: vi.fn(() => Promise.resolve()),
  moveCellUp: vi.fn(() => Promise.resolve()),
  moveCellDown: vi.fn(() => Promise.resolve()),
  duplicateCell: vi.fn(() => Promise.resolve({ cellId: "dup" })),
  runCell: vi.fn(() => Promise.resolve({ success: true })),
  setLayoutMode: vi.fn(() => Promise.resolve()),
  setCellLayout: vi.fn(() => Promise.resolve()),
  setCellMode: vi.fn(() => Promise.resolve()),
  setCellChartConfig: vi.fn(() => Promise.resolve()),
  setCellAutoRefresh: vi.fn(() => Promise.resolve()),
  setCellChartMaximized: vi.fn(() => Promise.resolve()),
  setCellMaximized: vi.fn(() => Promise.resolve()),
  applyNotebookState: vi.fn(() =>
    Promise.resolve({ applied: { added: [], updated: [], deleted: [] } }),
  ),
  ...overrides,
})

const noopStatus: StatusCallback = () => undefined

describe("dispatchTool — notebook tools (happy path)", () => {
  it("create_notebook forwards label and returns the new buffer id", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "create_notebook",
      { label: "My notebook" },
      client,
      noopStatus,
    )
    expect(client.createNotebook).toHaveBeenCalledWith("My notebook")
    expect(res.is_error).toBeUndefined()
    expect(JSON.parse(res.content)).toEqual({
      bufferId: 1,
      label: "Notebook 1",
    })
  })

  it("add_cell without run returns { cellId }", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1" },
      client,
      noopStatus,
    )
    expect(client.addCell).toHaveBeenCalledWith(1, "SELECT 1", undefined)
    expect(JSON.parse(res.content)).toEqual({ cellId: "new-cell" })
  })

  it("add_cell with run:true chains runCell and reports status", async () => {
    const client = makeClient({
      runCell: vi.fn(() => Promise.resolve({ success: false, error: "boom" })),
    })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1", run: true },
      client,
      noopStatus,
    )
    expect(client.runCell).toHaveBeenCalledWith(1, "new-cell", undefined)
    expect(JSON.parse(res.content)).toEqual({
      cellId: "new-cell",
      ran: false,
      error: "boom",
    })
  })

  it("update_cell sends only the value update", async () => {
    const client = makeClient()
    await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      value: "SELECT 2",
    })
  })

  it("run_cell serialises { success, error? } and never leaks data keys", async () => {
    const client = makeClient({
      runCell: vi.fn(() =>
        Promise.resolve({ success: false, error: "syntax" }),
      ),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed).toEqual({ success: false, error: "syntax" })
    // No data fields under any circumstance.
    expect(res.content).not.toMatch(/columns|dataset|count|rows/)
  })

  it("set_cell_chart_config forwards only fields the AI supplied (patch semantics)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        type: "line",
        x_column: "ts",
        y_columns: ["price", "volume"],
        partition_by_column: "symbol",
        name: "Trades",
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      type: "line",
      xColumn: "ts",
      yColumns: ["price", "volume"],
      partitionByColumn: "symbol",
      name: "Trades",
    })
  })

  it("set_cell_chart_config with only `type` does NOT send x/y defaults (no clobber)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", type: "bar" },
      client,
      noopStatus,
    )
    // Only `type` goes over the wire; client-side merge preserves the cell's
    // existing xColumn/yColumns. Missing fields must not appear as defaults.
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      type: "bar",
    })
  })

  it("forwards explicit ohlc for candlestick", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        type: "candlestick",
        x_column: "ts",
        ohlc: { open: "o", high: "h", low: "l", close: "cl" },
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      type: "candlestick",
      xColumn: "ts",
      ohlc: { open: "o", high: "h", low: "l", close: "cl" },
    })
  })

  it("auto-derives ohlc when candlestick + y_columns of length 4 and no explicit ohlc", async () => {
    // Rationale: buildEchartsOption dispatches candlestick on config.ohlc,
    // not yColumns. Without this conversion the AI's "set candlestick with
    // [open,high,low,close]" produces a non-candlestick chart.
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        type: "candlestick",
        x_column: "ts",
        y_columns: ["open", "high", "low", "close"],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      type: "candlestick",
      xColumn: "ts",
      yColumns: ["open", "high", "low", "close"],
      ohlc: { open: "open", high: "high", low: "low", close: "close" },
    })
  })

  it("treats null fields on set_cell_chart_config as 'omit' (not overwrite)", async () => {
    // Strict tool schemas (OpenAI Structured Outputs) require every property
    // in `required`; optional-ness is expressed via nullable types. The
    // handler must treat null as "leave the cell's current value alone".
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        type: "line",
        x_column: null,
        y_columns: null,
        partition_by_column: null,
        name: null,
        ohlc: null,
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      type: "line",
    })
  })

  it("does NOT auto-derive ohlc when y_columns has a different length", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        type: "candlestick",
        y_columns: ["a", "b"],
      },
      client,
      noopStatus,
    )
    const mockFn = client.setCellChartConfig as unknown as ReturnType<
      typeof vi.fn
    >
    const call = mockFn.mock.calls[0][2] as Record<string, unknown>
    expect(call).not.toHaveProperty("ohlc")
  })

  it("apply_notebook_state translates snake_case wire shape to camelCase request", async () => {
    const client = makeClient({
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["a"], updated: ["b"], deleted: ["c"] },
        }),
      ),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: "grid",
        maximized_cell_id: null,
        cells: [
          {
            id: "b",
            value: "SELECT 1",
            mode: "draw",
            auto_refresh: true,
            is_chart_maximized: true,
            chart_config: {
              type: "line",
              x_column: "ts",
              y_columns: ["price"],
              partition_by_column: "symbol",
              name: "Trades",
              ohlc: null,
            },
            grid: { x: 0, y: 0, w: 6, h: 6 },
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBeUndefined()
    expect(client.applyNotebookState).toHaveBeenCalledWith(1, {
      layoutMode: "grid",
      maximizedCellId: null,
      cells: [
        {
          id: "b",
          value: "SELECT 1",
          mode: "draw",
          autoRefresh: true,
          isChartMaximized: true,
          chartConfig: {
            type: "line",
            xColumn: "ts",
            yColumns: ["price"],
            partitionByColumn: "symbol",
            name: "Trades",
          },
          grid: { x: 0, y: 0, w: 6, h: 6 },
        },
      ],
    })
    expect(JSON.parse(res.content)).toEqual({
      applied: { added: ["a"], updated: ["b"], deleted: ["c"] },
      runs: [],
    })
  })

  it("apply_notebook_state auto-derives ohlc for candlestick when y_columns has 4 entries", async () => {
    const client = makeClient()
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: null,
            value: "SELECT * FROM trades",
            mode: "draw",
            auto_refresh: null,
            is_chart_maximized: null,
            chart_config: {
              type: "candlestick",
              x_column: "ts",
              y_columns: ["o", "h", "l", "c"],
              partition_by_column: null,
              name: null,
              ohlc: null,
            },
            grid: null,
          },
        ],
      },
      client,
      noopStatus,
    )
    const mockFn = client.applyNotebookState as unknown as ReturnType<
      typeof vi.fn
    >
    const req = mockFn.mock.calls[0][1] as {
      cells: Array<{ chartConfig?: { ohlc?: unknown } }>
    }
    expect(req.cells[0].chartConfig?.ohlc).toEqual({
      open: "o",
      high: "h",
      low: "l",
      close: "c",
    })
  })

  it("apply_notebook_state surfaces ApplyNotebookStateError as VALIDATION_ERROR", async () => {
    const client = makeClient({
      applyNotebookState: vi.fn(() => {
        const e = new Error('Duplicate cell id "x" in request.')
        e.name = "ApplyNotebookStateError"
        return Promise.reject(e)
      }),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: "x",
            value: "a",
            mode: null,
            auto_refresh: null,
            is_chart_maximized: null,
            chart_config: null,
            grid: null,
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("validation")
    expect(parsed.message).toMatch(/VALIDATION_ERROR/)
  })

  it("set_cell_maximized allows null to clear the spotlight", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_maximized",
      { buffer_id: 1, cell_id: null },
      client,
      noopStatus,
    )
    expect(client.setCellMaximized).toHaveBeenCalledWith(1, null)
  })

  it("denies run_cell when SQL cannot be resolved for permission classification", async () => {
    const client = makeClient({
      getCellSql: vi.fn(() => null),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "inactive" },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: false },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/could not resolve SQL/)
    expect(client.runCell).not.toHaveBeenCalled()
  })

  it("denies set_cell_mode draw when cell SQL contains DDL/DML, even with write granted", async () => {
    const client = makeClient({
      getCellSql: vi.fn(() => "DROP TABLE victim"),
    })
    const res = await dispatchTool(
      "set_cell_mode",
      { buffer_id: 1, cell_id: "c", mode: "draw" },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
    expect(client.setCellMode).not.toHaveBeenCalled()
  })

  it("denies update_cell on a draw cell when new SQL contains DDL/DML, even with write granted", async () => {
    const client = makeClient({
      getCell: vi.fn(() =>
        Promise.resolve({
          id: "c",
          value: "SELECT 1",
          position: 0,
          mode: "draw" as const,
        }),
      ),
    })
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "DROP TABLE victim" },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
    expect(client.updateCell).not.toHaveBeenCalled()
  })

  it("denies apply_notebook_state with a draw cell containing DDL/DML, even with write granted", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: null,
            value: "DROP TABLE victim",
            mode: "draw",
            auto_refresh: null,
            is_chart_maximized: null,
            chart_config: { type: "line", x_column: "ts", y_columns: ["x"] },
            grid: null,
          },
        ],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("allows run_cell with SELECT when read and write are both denied", async () => {
    const client = makeClient({
      getCellSql: vi.fn(() => "SELECT 1"),
      runCell: vi.fn(() => Promise.resolve({ success: true })),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
      { grantSchemaAccess: false, read: false, write: false },
      vi.fn().mockResolvedValue({
        query: "SELECT 1",
        columns: [{ name: "c1", type: "LONG" }],
        timestamp: -1,
      }),
    )
    expect(res.is_error).toBeFalsy()
    expect(client.runCell).toHaveBeenCalledWith(1, "c", undefined)
  })

  it("allows add_cell with run=true and SELECT when read and write are both denied", async () => {
    const client = makeClient({
      runCell: vi.fn(() => Promise.resolve({ success: true })),
    })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1", run: true },
      client,
      noopStatus,
      { grantSchemaAccess: false, read: false, write: false },
      vi.fn().mockResolvedValue({
        query: "SELECT 1",
        columns: [{ name: "c1", type: "LONG" }],
        timestamp: -1,
      }),
    )
    expect(res.is_error).toBeFalsy()
    const parsed = JSON.parse(res.content) as { ran?: boolean }
    expect(parsed.ran).toBe(true)
  })
})

describe("dispatchTool — apply_notebook_state auto-run", () => {
  const dqlValidate = vi.fn().mockResolvedValue({
    query: "SELECT 1",
    columns: [{ name: "c1", type: "LONG" }],
    timestamp: -1,
  })

  it("runs new cells with mode='run' (explicit) after apply", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "SELECT 1", mode: "run" }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(1, "new-1", undefined)
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean }>
    }
    expect(parsed.runs).toEqual([{ cellId: "new-1", success: true }])
  })

  it("defaults omitted mode to 'run' for new cells and runs them", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "SELECT 1" }],
      },
      client,
      noopStatus,
    )
    expect(runCell).toHaveBeenCalledWith(1, "new-1", undefined)
  })

  it("skips cells whose resolved mode is 'draw'", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: null,
            value: "SELECT 1",
            mode: "draw",
            chart_config: { type: "line", x_column: "ts", y_columns: ["c1"] },
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(runCell).not.toHaveBeenCalled()
  })

  it("skips cells with empty SQL", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "   ", mode: "run" }],
      },
      client,
      noopStatus,
    )
    expect(runCell).not.toHaveBeenCalled()
  })

  it("denies execution of DDL/DML run cells when write permission is absent", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "DROP TABLE victim", mode: "run" }],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: false },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean; error?: string }>
    }
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0].success).toBe(false)
    expect(parsed.runs[0].error).toMatch(/'write' permission/)
  })

  it("preserves existing mode when mode is omitted on an existing cell (draw stays draw, run stays run)", async () => {
    const runCell = vi.fn(() => Promise.resolve({ success: true }))
    const getCell = vi.fn(
      (
        _buf: number,
        id: string,
      ): Promise<{
        id: string
        mode?: "run" | "draw"
        value: string
        position: number
      }> =>
        Promise.resolve({
          id,
          value: "",
          position: 0,
          mode: id === "draw-id" ? "draw" : "run",
        }),
    )
    const client = makeClient({
      runCell,
      getCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: [], updated: ["run-id", "draw-id"], deleted: [] },
        }),
      ),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          { id: "run-id", value: "SELECT 1" },
          {
            id: "draw-id",
            value: "SELECT 2",
            chart_config: { type: "line", x_column: "ts", y_columns: ["c1"] },
          },
        ],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      dqlValidate,
    )
    expect(runCell).toHaveBeenCalledTimes(1)
    expect(runCell).toHaveBeenCalledWith(1, "run-id", undefined)
  })

  it("reports per-cell runCell failure in the runs array", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({ success: false, error: "boom" }),
    )
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: [], deleted: [] },
        }),
      ),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "SELECT 1", mode: "run" }],
      },
      client,
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean; error?: string }>
    }
    expect(parsed.runs).toEqual([
      { cellId: "new-1", success: false, error: "boom" },
    ])
  })
})

describe("dispatchTool — NotebookToolError envelope", () => {
  it("archived → { error_code: 'archived', hint, message }", async () => {
    const client = makeClient({
      runCell: vi.fn(() =>
        Promise.reject(
          new NotebookToolError("archived", 'Notebook "x" is archived.'),
        ),
      ),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("archived")
    expect(parsed.hint).toMatch(/unarchive|create_notebook/)
  })

  it("deleted → error_code 'deleted'", async () => {
    const client = makeClient({
      listCells: vi.fn(() =>
        Promise.reject(new NotebookToolError("deleted", "gone")),
      ),
    })
    const res = await dispatchTool(
      "list_cells",
      { buffer_id: 1 },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(
      (JSON.parse(res.content) as Record<string, unknown>).error_code,
    ).toBe("deleted")
  })

  it("unknown_cell → error_code 'unknown_cell' with resync hint", async () => {
    const client = makeClient({
      deleteCell: vi.fn(() =>
        Promise.reject(new NotebookToolError("unknown_cell", "no cell abc123")),
      ),
    })
    const res = await dispatchTool(
      "delete_cell",
      { buffer_id: 1, cell_id: "abc123" },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("unknown_cell")
    expect(parsed.hint).toMatch(/list_cells/)
  })
})

describe("dispatchTool — non-NotebookToolError falls through to default handler", () => {
  it("is captured as a generic tool execution error", async () => {
    const client = makeClient({
      runCell: vi.fn(() => Promise.reject(new Error("network boom"))),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/network boom/)
  })
})

// Data-leak regression — guards the no-data-fields invariant when notebook
// tools are routed through the MCP path (browser ← bridge ← agent). The
// MCP adapter (`dispatchMCPTool`) wraps `dispatchTool`'s output verbatim, so
// the invariant is structural; this test locks it in case anyone ever
// inlines a richer payload there.
describe("dispatchMCPTool — data-leak invariant", () => {
  const callOf = (name: string, args: Record<string, unknown> = {}) => ({
    v: EXPECTED_BRIDGE_VERSION,
    type: "tool_call" as const,
    requestId: "r-" + name,
    name,
    arguments: args,
    deadlineMs: 60_000,
  })

  const ctxFor = (client: ModelToolsClient) => ({
    modelToolsClient: client,
    freshness: {
      get: () => "fresh" as const,
      set: () => undefined,
    },
    metaToolContext: {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => null,
      runQuery: null,
    },
  })

  it("run_cell happy-path response carries no data field keys", async () => {
    const client = makeClient({
      runCell: vi.fn(() => Promise.resolve({ success: true })),
    })
    const result = await dispatchMCPTool(
      callOf("run_cell", { buffer_id: 1, cell_id: "c" }),
      ctxFor(client),
    )
    const wireText = JSON.stringify(result)
    expect(wireText).not.toMatch(/columns|dataset|count|rows/)
  })

  it("run_cell error-path response carries no data field keys", async () => {
    const client = makeClient({
      runCell: vi.fn(() =>
        Promise.resolve({ success: false, error: "syntax near (1)" }),
      ),
    })
    const result = await dispatchMCPTool(
      callOf("run_cell", { buffer_id: 1, cell_id: "c" }),
      ctxFor(client),
    )
    const wireText = JSON.stringify(result)
    expect(wireText).toMatch(/syntax/)
    expect(wireText).not.toMatch(/columns|dataset|count|rows/)
  })

  it("add_cell with run:true similarly never leaks data fields", async () => {
    const client = makeClient({
      addCell: vi.fn(() => Promise.resolve({ cellId: "new" })),
      runCell: vi.fn(() => Promise.resolve({ success: true })),
    })
    const result = await dispatchMCPTool(
      callOf("add_cell", { buffer_id: 1, sql: "select 1", run: true }),
      ctxFor(client),
    )
    expect(JSON.stringify(result)).not.toMatch(/columns|dataset|count|rows/)
  })
})
