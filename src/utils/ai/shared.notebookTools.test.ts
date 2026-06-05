import { describe, it, expect, vi } from "vitest"
import { dispatchTool } from "../tools/dispatch"
import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import { NotebookToolError } from "../notebookAIBridge"
import { dispatchMCPTool } from "../mcp/dispatchMCPTool"
import { EXPECTED_BRIDGE_VERSION } from "../mcp/protocolVersion"
import type { ToolExecutionContext } from "./shared"

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
  duplicateNotebook: vi.fn(() =>
    Promise.resolve({ bufferId: 2, label: "Notebook 1 (copy)" }),
  ),
  deleteNotebook: vi.fn(() => Promise.resolve()),
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
  runCell: vi.fn(() =>
    Promise.resolve({
      success: true,
      queryCount: 1,
      results: ["success"] as Array<"success">,
    }),
  ),
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

  it("add_cell with run:true chains runCell and reports per-query status", async () => {
    const client = makeClient({
      runCell: vi.fn(() =>
        Promise.resolve({
          success: false,
          queryCount: 3,
          results: ["success", "ERROR: boom", "cancelled"],
        }),
      ),
    })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1; SELECT bad; SELECT 2", run: true },
      client,
      noopStatus,
    )
    expect(client.runCell).toHaveBeenCalledWith(1, "new-cell", undefined)
    expect(JSON.parse(res.content)).toEqual({
      cellId: "new-cell",
      ran: false,
      queryCount: 3,
      results: ["success", "ERROR: boom", "cancelled"],
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

  it("run_cell serialises the explicit per-query shape and never leaks data keys", async () => {
    const client = makeClient({
      runCell: vi.fn(() =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["ERROR: syntax"],
        }),
      ),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed).toEqual({
      success: false,
      queryCount: 1,
      results: ["ERROR: syntax"],
    })
    // No QuestDB result-row leak keys under any circumstance. `queryCount`
    // (capital C) is intentional — won't match a case-sensitive `count` regex.
    expect(res.content).not.toMatch(/columns|dataset|count|rows/)
  })

  it("set_cell_chart_config forwards only fields the AI supplied (patch semantics)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        x_column: "ts",
        name: "Trades",
        queries: [
          {
            type: "line",
            y_columns: ["price", "volume"],
            partition_by_column: "symbol",
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      xColumn: "ts",
      name: "Trades",
      queries: [
        {
          type: "line",
          yColumns: ["price", "volume"],
          partitionByColumn: "symbol",
        },
      ],
    })
  })

  it("set_cell_chart_config with only `queries` does NOT send x/name defaults (no clobber)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [{ type: "bar" }] },
      client,
      noopStatus,
    )
    // Only `queries` goes over the wire; client-side merge preserves the cell's
    // existing xColumn/name. Omitted top-level fields must not appear as defaults.
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      queries: [{ type: "bar", yColumns: [] }],
    })
  })

  it("forwards explicit ohlc for candlestick", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        x_column: "ts",
        queries: [
          {
            type: "candlestick",
            ohlc: { open: "o", high: "h", low: "l", close: "cl" },
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      xColumn: "ts",
      queries: [
        {
          type: "candlestick",
          yColumns: [],
          ohlc: { open: "o", high: "h", low: "l", close: "cl" },
        },
      ],
    })
  })

  it("rejects a candlestick query with no ohlc (no derive from y_columns)", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        x_column: "ts",
        queries: [
          { type: "candlestick", y_columns: ["open", "high", "low", "close"] },
        ],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
    expect(client.setCellChartConfig).not.toHaveBeenCalled()
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
        x_column: null,
        name: null,
        right_axis: null,
        queries: [
          {
            type: "line",
            y_columns: null,
            partition_by_column: null,
            axis: null,
            enabled: null,
            name: null,
            ohlc: null,
          },
        ],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      queries: [{ type: "line", yColumns: [] }],
    })
  })

  it("rejects a candlestick query with no ohlc (y_columns of a non-ohlc length)", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        queries: [{ type: "candlestick", y_columns: ["a", "b"] }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
    expect(client.setCellChartConfig).not.toHaveBeenCalled()
  })

  it("rejects a non-empty queries array whose length != the cell's statement count", async () => {
    const client = makeClient({
      getCellSql: () => "SELECT a FROM t; SELECT b FROM t",
    })
    const res = await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        // One config for a two-statement cell — would silently drop Q2.
        queries: [{ type: "line", y_columns: ["a"] }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
    expect(client.setCellChartConfig).not.toHaveBeenCalled()
  })

  it("forwards a queries array that matches the cell's statement count", async () => {
    const client = makeClient({
      getCellSql: () => "SELECT a FROM t; SELECT b FROM t",
    })
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        queries: [
          { type: "line", y_columns: ["a"] },
          { type: "bar", y_columns: ["b"] },
        ],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      queries: [
        { type: "line", yColumns: ["a"] },
        { type: "bar", yColumns: ["b"] },
      ],
    })
  })

  it("allows queries:[] (reset to inference) regardless of statement count", async () => {
    const client = makeClient({
      getCellSql: () => "SELECT a FROM t; SELECT b FROM t",
    })
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [] },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      queries: [],
    })
  })

  it("preserves a null queries entry (infer this statement) instead of crashing", async () => {
    const client = makeClient({
      getCellSql: () => "SELECT a FROM t; SELECT b FROM t",
    })
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        // First statement left to inference (null), second configured explicitly.
        queries: [null, { type: "bar", y_columns: ["b"] }],
      },
      client,
      noopStatus,
    )
    expect(client.setCellChartConfig).toHaveBeenCalledWith(1, "c", {
      queries: [null, { type: "bar", yColumns: ["b"] }],
    })
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
              x_column: "ts",
              name: "Trades",
              right_axis: null,
              queries: [
                {
                  type: "line",
                  y_columns: ["price"],
                  partition_by_column: "symbol",
                },
              ],
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
            xColumn: "ts",
            name: "Trades",
            queries: [
              {
                type: "line",
                yColumns: ["price"],
                partitionByColumn: "symbol",
              },
            ],
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

  it("apply_notebook_state forwards ordered variables; null/undefined preserve, [] clears", async () => {
    const client = makeClient()
    const variables = [
      { name: "x", value: "10" },
      { name: "from_ts", value: "dateadd('d', -7, now())" },
    ]
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables,
        cells: [{ value: "SELECT @x FROM trades WHERE ts > @from_ts" }],
      },
      client,
      noopStatus,
    )
    expect(client.applyNotebookState).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        variables,
      }),
    )

    const client2 = makeClient()
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: null,
        cells: [{ value: "SELECT 1" }],
      },
      client2,
      noopStatus,
    )
    expect(client2.applyNotebookState).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ variables: undefined }),
    )

    const client3 = makeClient()
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: [],
        cells: [{ value: "SELECT 1" }],
      },
      client3,
      noopStatus,
    )
    expect(client3.applyNotebookState).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ variables: [] }),
    )
  })

  it("apply_notebook_state rejects invalid variable names with a VALIDATION_ERROR", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: [{ name: "bad-name", value: "1" }],
        cells: [{ value: "SELECT 1" }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("apply_notebook_state rejects invalid variable values via QuestDB validation", async () => {
    for (const value of ["", "select", "(1,2,3)"]) {
      const client = makeClient()
      const validateSql = vi.fn(() =>
        Promise.resolve({
          query: "DECLARE @x := bad SELECT 1",
          position: 14,
          error: "bad variable value",
        }),
      )
      const res = await dispatchTool(
        "apply_notebook_state",
        {
          buffer_id: 1,
          layout_mode: null,
          maximized_cell_id: null,
          variables: [{ name: "x", value }],
          cells: [{ value: "SELECT 1" }],
        },
        client,
        noopStatus,
        undefined,
        validateSql,
      )
      expect(res.is_error).toBe(true)
      const parsed = JSON.parse(res.content) as { error_code: string }
      expect(parsed.error_code).toBe("validation")
      expect(client.applyNotebookState).not.toHaveBeenCalled()
    }
  })

  it("apply_notebook_state rejects multi-assignment value injection before validateSql", async () => {
    const client = makeClient()
    const validateSql = vi.fn()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: [{ name: "x", value: "1, @evil := 999" }],
        cells: [{ value: "SELECT 1" }],
      },
      client,
      noopStatus,
      undefined,
      validateSql,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as {
      error_code: string
      message: string
    }
    expect(parsed.error_code).toBe("validation")
    expect(parsed.message).toContain("shape check failed")
    expect(validateSql).not.toHaveBeenCalled()
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("apply_notebook_state validates ordered variable prefixes with QuestDB", async () => {
    const client = makeClient()
    const validateSql = vi.fn(() =>
      Promise.resolve({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: 0,
      }),
    )
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: [
          { name: "base", value: "10" },
          { name: "derived", value: "@base + 1" },
        ],
        cells: [{ value: "SELECT @derived" }],
      },
      client,
      noopStatus,
      undefined,
      validateSql,
    )
    expect(validateSql).toHaveBeenNthCalledWith(
      1,
      "DECLARE\n  @base := 10\nSELECT 1",
    )
    expect(validateSql).toHaveBeenNthCalledWith(
      2,
      "DECLARE\n  @base := 10,\n  @derived := @base + 1\nSELECT 1",
    )
    expect(client.applyNotebookState).toHaveBeenCalled()
  })

  it("apply_notebook_state does not derive ohlc from y_columns for candlestick", async () => {
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
              x_column: "ts",
              name: null,
              right_axis: null,
              queries: [
                { type: "candlestick", y_columns: ["o", "h", "l", "c"] },
              ],
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
      cells: Array<{
        chartConfig?: { queries?: Array<Record<string, unknown>> }
      }>
    }
    expect(req.cells[0].chartConfig?.queries?.[0]).not.toHaveProperty("ohlc")
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
      runCell: vi.fn(() =>
        Promise.resolve({
          success: true,
          queryCount: 1,
          results: ["success"] as Array<"success">,
        }),
      ),
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
      runCell: vi.fn(() =>
        Promise.resolve({
          success: true,
          queryCount: 1,
          results: ["success"] as Array<"success">,
        }),
      ),
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
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
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
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(1, "new-1", undefined)
    const parsed = JSON.parse(res.content) as {
      runs: Array<{
        cellId: string
        success: boolean
        queryCount?: number
        results?: string[]
      }>
    }
    expect(parsed.runs).toEqual([
      { cellId: "new-1", success: true, queryCount: 1, results: ["success"] },
    ])
  })

  it("defaults omitted mode to 'run' for new cells and runs them", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
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
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
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
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
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
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
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
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
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

  it("dispatches run-mode cells in parallel — total wallclock equals slowest cell, not the sum", async () => {
    const order: string[] = []
    const finish: Record<string, () => void> = {}
    const runCell = vi.fn(
      (_buf: number, cellId: string) =>
        new Promise<{
          success: true
          queryCount: number
          results: Array<"success">
        }>((resolve) => {
          order.push(cellId)
          finish[cellId] = () =>
            resolve({ success: true, queryCount: 1, results: ["success"] })
        }),
    )
    const client = makeClient({
      runCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: {
            added: ["cell-1", "cell-2", "cell-3"],
            updated: [],
            deleted: [],
          },
        }),
      ),
    })
    const pending = dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          { id: null, value: "SELECT 1", mode: "run" },
          { id: null, value: "SELECT 2", mode: "run" },
          { id: null, value: "SELECT 3", mode: "run" },
        ],
      },
      client,
      noopStatus,
    )
    // Flush microtasks so dispatchTool resumes past applyNotebookState and
    // fires every runCell concurrently.
    await new Promise((r) => setTimeout(r, 0))
    expect(order).toEqual(["cell-1", "cell-2", "cell-3"])
    // Finish out of submission order — only possible if all three are in
    // flight simultaneously.
    finish["cell-3"]()
    finish["cell-1"]()
    finish["cell-2"]()
    const res = await pending
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean }>
    }
    // Order in `runs` matches request order, not finish order.
    expect(parsed.runs.map((r) => r.cellId)).toEqual([
      "cell-1",
      "cell-2",
      "cell-3",
    ])
  })

  it("reports per-cell runCell failure in the runs array with per-query results", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: false,
        queryCount: 3,
        results: ["success", "ERROR: boom", "cancelled"],
      }),
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
        cells: [
          { id: null, value: "SELECT 1; SELECT bad; SELECT 2", mode: "run" },
        ],
      },
      client,
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as {
      runs: Array<{
        cellId: string
        success: boolean
        queryCount?: number
        results?: string[]
      }>
    }
    expect(parsed.runs).toEqual([
      {
        cellId: "new-1",
        success: false,
        queryCount: 3,
        results: ["success", "ERROR: boom", "cancelled"],
      },
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

describe("dispatchTool — run_query replay guard (sqlWriteExecuted)", () => {
  const runQuery = async (
    sql: string,
    rawType: "dql" | "dml" | "ddl",
  ): Promise<ToolExecutionContext> => {
    const client = makeClient({
      runQueryRaw: vi.fn(() =>
        rawType === "dql"
          ? Promise.resolve({
              type: "dql" as const,
              columns: [],
              dataset: [],
              count: 0,
            })
          : Promise.resolve({ type: rawType }),
      ),
    })
    const toolContext: ToolExecutionContext = {}
    await dispatchTool(
      "run_query",
      { sql },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    return toolContext
  }

  it("flags sqlWriteExecuted when a DML statement executes", async () => {
    const ctx = await runQuery("INSERT INTO t VALUES (1)", "dml")
    expect(ctx.sqlWriteExecuted).toBe(true)
  })

  it("flags sqlWriteExecuted when a DDL statement executes", async () => {
    const ctx = await runQuery("DROP TABLE t", "ddl")
    expect(ctx.sqlWriteExecuted).toBe(true)
  })

  it("does not flag sqlWriteExecuted for a read-only (DQL) query", async () => {
    const ctx = await runQuery("SELECT 1", "dql")
    expect(ctx.sqlWriteExecuted).toBeUndefined()
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
      runCell: vi.fn(() =>
        Promise.resolve({
          success: true,
          queryCount: 1,
          results: ["success"] as Array<"success">,
        }),
      ),
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
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["ERROR: syntax near (1)"],
        }),
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
      runCell: vi.fn(() =>
        Promise.resolve({
          success: true,
          queryCount: 1,
          results: ["success"] as Array<"success">,
        }),
      ),
    })
    const result = await dispatchMCPTool(
      callOf("add_cell", { buffer_id: 1, sql: "select 1", run: true }),
      ctxFor(client),
    )
    expect(JSON.stringify(result)).not.toMatch(/columns|dataset|count|rows/)
  })
})
