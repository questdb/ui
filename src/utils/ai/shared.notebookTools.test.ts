import { describe, it, expect, vi } from "vitest"
import { dispatchTool } from "../tools/dispatch"
import type { ModelToolsClient, StatusCallback } from "../aiAssistant"
import {
  NotebookToolError,
  emitUserAction,
  getUserActionSeq,
  signalUserEdit,
  type ApplyNotebookStateRequest,
} from "../notebookAIBridge"
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
  setCellViewMaximized: vi.fn(() => Promise.resolve()),
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
    expect(client.addCell).toHaveBeenCalledWith(
      1,
      "SELECT 1",
      undefined,
      undefined,
    )
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
    expect(client.runCell).toHaveBeenCalledWith(
      1,
      "new-cell",
      undefined,
      undefined,
    )
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

  // A superseded/backgrounded run yields unverified+note; the agent must see it
  // on ALL run-bearing tools (not just run_cell) or it re-runs a committed write.
  it("propagates unverified/note from runCell to run_cell, add_cell{run}, and apply runs", async () => {
    const unverifiedRunCell = () =>
      vi.fn(() =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["pending"],
          unverified: true,
          note: "Run outcome unverified.",
        }),
      )

    const runCellRes = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient({ runCell: unverifiedRunCell() }),
      noopStatus,
    )
    const p1 = JSON.parse(runCellRes.content) as Record<string, unknown>
    expect(p1.unverified).toBe(true)
    expect(typeof p1.note).toBe("string")

    const addRes = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)", run: true },
      makeClient({ runCell: unverifiedRunCell() }),
      noopStatus,
    )
    const p2 = JSON.parse(addRes.content) as Record<string, unknown>
    expect(p2.unverified).toBe(true)
    expect(typeof p2.note).toBe("string")

    const applyRes = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [{ id: "x", value: "INSERT INTO t VALUES(1)", mode: "run" }],
      },
      makeClient({ runCell: unverifiedRunCell() }),
      noopStatus,
    )
    const p3 = JSON.parse(applyRes.content) as {
      runs: Array<Record<string, unknown>>
    }
    expect(p3.runs[0].unverified).toBe(true)
    expect(typeof p3.runs[0].note).toBe("string")
  })

  it("set_cell_chart_config forwards only fields the AI supplied (patch semantics)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        x_column: "ts",
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
      queries: [
        {
          type: "line",
          yColumns: ["price", "volume"],
          partitionByColumn: "symbol",
        },
      ],
    })
  })

  it("set_cell_autorefresh maps a fixed interval token to the cell patch (5s)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "5s" },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      autoRefresh: "5s",
    })
  })

  it("set_cell_autorefresh maps true to adaptive (2.0.0-compatible)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: true },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      autoRefresh: true,
    })
  })

  it("set_cell_autorefresh maps false to disabled (2.0.0-compatible)", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: false },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      autoRefresh: false,
    })
  })

  it("set_cell_autorefresh rejects a token outside the allowed set", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "2s" },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(client.updateCell).not.toHaveBeenCalled()
  })

  it("set_cell_name sets the cell name via updateCell", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "BTC price" },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      name: "BTC price",
    })
  })

  it("set_cell_name clears the name when passed null", async () => {
    const client = makeClient()
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: null },
      client,
      noopStatus,
    )
    expect(client.updateCell).toHaveBeenCalledWith(1, "c", {
      name: undefined,
    })
  })

  it("set_cell_name rejects a name over the length limit", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "a".repeat(101) },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(client.updateCell).not.toHaveBeenCalled()
  })

  it("run_query flags a transport-dropped error as unverified, a server error as not", async () => {
    const transport = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.resolve({
          type: "error" as const,
          error: "QuestDB is not reachable [504]",
        }),
      ),
    })
    const t = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)" },
      transport,
      noopStatus,
    )
    expect((JSON.parse(t.content) as { unverified?: boolean }).unverified).toBe(
      true,
    )

    const serverErr = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.resolve({
          type: "error" as const,
          error: "table does not exist [table=t]",
        }),
      ),
    })
    const s = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "SELECT * FROM t" },
      serverErr,
      noopStatus,
    )
    expect(
      (JSON.parse(s.content) as { unverified?: boolean }).unverified,
    ).toBeUndefined()
  })

  it("run_query that throws flags a transport-dropped rejection as unverified, a server rejection as not", async () => {
    // Given runQueryRaw rejects with a transport-dropped error
    const transport = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.reject(new Error("QuestDB is not reachable [504]")),
      ),
    })
    // When run_query is dispatched
    const t = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)" },
      transport,
      noopStatus,
    )
    // Then the failure envelope is marked unverified
    const transportPayload = JSON.parse(t.content) as {
      error?: string
      unverified?: boolean
    }
    expect(t.is_error).toBe(true)
    expect(transportPayload.error).toContain("run_query failed:")
    expect(transportPayload.unverified).toBe(true)

    // Given runQueryRaw rejects with a deterministic server error
    const serverErr = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.reject(new Error("table does not exist [table=t]")),
      ),
    })
    // When run_query is dispatched
    const s = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "SELECT * FROM t" },
      serverErr,
      noopStatus,
    )
    // Then the failure envelope is NOT marked unverified
    const serverPayload = JSON.parse(s.content) as {
      error?: string
      unverified?: boolean
    }
    expect(s.is_error).toBe(true)
    expect(serverPayload.error).toContain("run_query failed:")
    expect(serverPayload.unverified).toBeUndefined()
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
            name: "Trades",
            value: "SELECT 1",
            mode: "draw",
            auto_refresh: "5s",
            is_view_maximized: true,
            chart_config: {
              x_column: "ts",
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
          name: "Trades",
          value: "SELECT 1",
          mode: "draw",
          autoRefresh: "5s",
          isViewMaximized: true,
          chartConfig: {
            xColumn: "ts",
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

  it("apply_notebook_state rejects as STATE_STALE when the user edits during validation", async () => {
    const client = makeClient()
    // The user edits a cell (keystroke) while the per-variable validation awaits.
    const validateSql = vi.fn(() => {
      signalUserEdit()
      return Promise.resolve({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: 0,
      })
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        variables: [{ name: "base", value: "10" }],
        cells: [{ value: "SELECT @base" }],
      },
      client,
      noopStatus,
      undefined,
      validateSql,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("apply_notebook_state rejects STATE_STALE on a user edit since the read baseline (in-app generation window)", async () => {
    const client = makeClient()
    const readSeq = getUserActionSeq()
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "x" })
    const toolContext = { notebookReadSeq: readSeq }
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("update_cell rejects STATE_STALE when the user edited since the read baseline", async () => {
    const client = makeClient()
    const readSeq = getUserActionSeq()
    signalUserEdit()
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookReadSeq: readSeq },
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
    expect(client.updateCell).not.toHaveBeenCalled()
  })

  it("apply_notebook_state rejects after a user auto-refresh/maximize/spotlight toggle (signalUserEdit) since the read baseline", async () => {
    const client = makeClient()
    const readSeq = getUserActionSeq()
    // handleAutoRefreshChange / handleChartMaximizedChange / the spotlight toggle
    // all call signalUserEdit(); the agent's stale full-state apply must reject.
    signalUserEdit()
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookReadSeq: readSeq },
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("update_cell rejects STATE_STALE when the user edits during validation", async () => {
    const client = makeClient({
      getCell: vi.fn(() => {
        signalUserEdit()
        return Promise.resolve({ id: "c", type: "sql", value: "", position: 0 })
      }),
    })
    const validateSql = vi.fn(() =>
      Promise.resolve({ query: "", columns: [], timestamp: 0 }),
    )
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      validateSql,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
    expect(client.updateCell).not.toHaveBeenCalled()
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
            is_view_maximized: null,
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
            is_view_maximized: null,
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
            is_view_maximized: null,
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
    // The exact authorization-checked SQL is threaded to execution.
    expect(client.runCell).toHaveBeenCalledWith(1, "c", undefined, "SELECT 1")
  })

  it("run_cell executes the checked SQL, not a value swapped in during the validate round-trip", async () => {
    // A run-mode cell starts at a read query the gate will allow.
    let liveValue = "SELECT 1"
    const client = makeClient({ getCellSql: vi.fn(() => liveValue) })
    // Simulate a concurrent ungated update_cell landing while run_cell awaits
    // the /sql/validate round-trip: the live cell value flips to a write
    // between classification and execution.
    const validateSql = vi.fn((sql: string) => {
      liveValue = "DROP TABLE t"
      return Promise.resolve({
        query: sql,
        columns: [{ name: "c1", type: "LONG" }],
        timestamp: -1,
      })
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
      { grantSchemaAccess: false, read: true, write: false },
      validateSql,
    )
    expect(res.is_error).toBeFalsy()
    // The race is real: the live value did change mid-flight...
    expect(liveValue).toBe("DROP TABLE t")
    // ...but the executor was handed the checked SELECT, never the DROP.
    expect(client.runCell).toHaveBeenCalledWith(1, "c", undefined, "SELECT 1")
  })

  it("run_cell with no gate leaves execution to re-read the live cell", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    expect(res.is_error).toBeFalsy()
    // No gate ran, so no SQL is pinned — the executor re-reads the cell.
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

  it("skips add_cell run when the cell contains DDL/DML — the cell is still added", async () => {
    const runCell = vi.fn()
    const client = makeClient({ runCell })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(res.is_error).toBeFalsy()
    expect(client.addCell).toHaveBeenCalledWith(
      1,
      "INSERT INTO t VALUES (1)",
      undefined,
      undefined,
    )
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      cellId: string
      ran: boolean
      skipped?: boolean
      note?: string
    }
    expect(parsed).toMatchObject({
      cellId: "new-cell",
      ran: false,
      skipped: true,
    })
    expect(parsed.note).toMatch(/run_cell/)
  })

  // SAFETY PRECONDITION — "agent flows never auto-run DDL/DML". The guard lives
  // inside `if (perms && validateSql)`, so it protects the flow ONLY because
  // every production call site threads BOTH args (anthropicProvider,
  // openaiProvider, openaiChatCompletionsProvider, dispatchMCPTool). This pins
  // both halves so a caller that drops the gate args — or a refactor of that
  // condition — fails loudly here instead of silently auto-running a write.
  it("auto-run write protection depends entirely on the gate args", async () => {
    const ranWithGate = vi.fn()
    const gated = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient({ runCell: ranWithGate }),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(ranWithGate).not.toHaveBeenCalled()
    expect(JSON.parse(gated.content)).toMatchObject({
      ran: false,
      skipped: true,
    })

    const ranWithoutGate = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const ungated = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient({ runCell: ranWithoutGate }),
      noopStatus,
    )
    expect(ranWithoutGate).toHaveBeenCalled()
    expect(JSON.parse(ungated.content)).toMatchObject({ ran: true })
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
    expect(runCell).toHaveBeenCalledWith(1, "new-1", undefined, undefined)
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
    expect(runCell).toHaveBeenCalledWith(1, "new-1", undefined, undefined)
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

  it("skips DDL/DML run cells regardless of the write permission", async () => {
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
      runs: Array<{
        cellId: string
        success: boolean
        skipped?: boolean
        note?: string
      }>
    }
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({ success: true, skipped: true })
    expect(parsed.runs[0].note).toMatch(/run_cell/)
  })

  it("skips DDL/DML cells regardless of run history (writes never auto-run)", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const getCell = vi.fn(() =>
      Promise.resolve({
        id: "ins-1",
        value: "INSERT INTO t VALUES (1)",
        position: 0,
        mode: "run" as const,
        last_run_status: "success" as const,
      }),
    )
    const client = makeClient({
      runCell,
      getCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: [], updated: ["ins-1"], deleted: [] },
        }),
      ),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "ins-1", value: "INSERT INTO t VALUES (1)" }],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      runs: Array<{
        cellId: string
        success: boolean
        skipped?: boolean
        note?: string
      }>
    }
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({
      cellId: "ins-1",
      success: true,
      skipped: true,
    })
    expect(parsed.runs[0].note).toMatch(/run_cell/)
  })

  it("skips DDL/DML cells that never ran before (only run_cell executes writes)", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const getCell = vi.fn(() =>
      Promise.resolve({
        id: "ins-1",
        value: "INSERT INTO t VALUES (1)",
        position: 0,
        mode: "run" as const,
        last_run_status: "none" as const,
      }),
    )
    const client = makeClient({
      runCell,
      getCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: ["new-1"], updated: ["ins-1"], deleted: [] },
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
          { id: "ins-1", value: "INSERT INTO t VALUES (1)" },
          { id: null, value: "INSERT INTO t VALUES (2)", mode: "run" },
        ],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      runs: Array<{
        cellId: string
        success: boolean
        skipped?: boolean
        note?: string
      }>
    }
    expect(parsed.runs).toHaveLength(2)
    for (const run of parsed.runs) {
      expect(run).toMatchObject({ success: true, skipped: true })
      expect(run.note).toMatch(/run_cell/)
    }
  })

  it("re-runs DQL cells that ran before (only writes are history-gated)", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const getCell = vi.fn(() =>
      Promise.resolve({
        id: "sel-1",
        value: "SELECT 1",
        position: 0,
        mode: "run" as const,
        last_run_status: "success" as const,
      }),
    )
    const client = makeClient({
      runCell,
      getCell,
      applyNotebookState: vi.fn(() =>
        Promise.resolve({
          applied: { added: [], updated: ["sel-1"], deleted: [] },
        }),
      ),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "sel-1", value: "SELECT 1" }],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      dqlValidate,
    )
    expect(runCell).toHaveBeenCalledWith(1, "sel-1", undefined, "SELECT 1")
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
    expect(runCell).toHaveBeenCalledWith(1, "run-id", undefined, "SELECT 1")
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
      getReadBuffer: () => 1,
      setReadBuffer: () => undefined,
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

describe("dispatchTool — get_cell content cap switch", () => {
  it("forwards get_full_content: true to the client", async () => {
    const client = makeClient()
    await dispatchTool(
      "get_cell",
      { buffer_id: 1, cell_id: "c", get_full_content: true },
      client,
      noopStatus,
    )
    expect(client.getCell).toHaveBeenCalledWith(1, "c", true)
  })

  it("applies the cap when get_full_content is omitted or null", async () => {
    const client = makeClient()
    await dispatchTool(
      "get_cell",
      { buffer_id: 1, cell_id: "c" },
      client,
      noopStatus,
    )
    await dispatchTool(
      "get_cell",
      { buffer_id: 1, cell_id: "c", get_full_content: null },
      client,
      noopStatus,
    )
    expect(client.getCell).toHaveBeenNthCalledWith(1, 1, "c", false)
    expect(client.getCell).toHaveBeenNthCalledWith(2, 1, "c", false)
  })
})

describe("dispatchTool — apply_notebook_state preserve_value", () => {
  const applyOk = (updated: string[]) =>
    vi.fn((_bufferId: number, _request: ApplyNotebookStateRequest) =>
      Promise.resolve({ applied: { added: [], updated, deleted: [] } }),
    )

  it("rejects a cell providing both value and preserve_value", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "a", value: "SELECT 1", preserve_value: true }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/exactly one/)
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("rejects a cell providing neither value nor preserve_value", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "a" }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/has no value/)
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("rejects preserve_value without an existing cell id", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ preserve_value: true }],
      },
      client,
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/without an existing cell id/)
    expect(client.applyNotebookState).not.toHaveBeenCalled()
  })

  it("forwards preserve_value cells as preserveValue with no value", async () => {
    const applyNotebookState = applyOk(["a"])
    const client = makeClient({ applyNotebookState })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "a", preserve_value: true }],
      },
      client,
      noopStatus,
    )
    expect(applyNotebookState).toHaveBeenCalledTimes(1)
    const sent = applyNotebookState.mock.calls[0][1]
    expect(sent.cells[0]).toMatchObject({ id: "a", preserveValue: true })
    expect(sent.cells[0]).not.toHaveProperty("value")
  })

  it("auto-run skips a preserved write cell, gating on its live SQL", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const getCell = vi.fn(() =>
      Promise.resolve({
        id: "ins-1",
        value: "INSERT INTO t VALUES (1)",
        position: 0,
        mode: "run" as const,
        last_run_status: "success" as const,
      }),
    )
    const getCellSql = vi.fn(() => "INSERT INTO t VALUES (1)")
    const client = makeClient({
      runCell,
      getCell,
      getCellSql,
      applyNotebookState: applyOk(["ins-1"]),
    })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "ins-1", preserve_value: true }],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; skipped?: boolean }>
    }
    expect(parsed.runs[0]).toMatchObject({ cellId: "ins-1", skipped: true })
  })

  it("auto-run executes a preserved DQL cell with its live SQL", async () => {
    const runCell = vi.fn(() =>
      Promise.resolve({
        success: true,
        queryCount: 1,
        results: ["success"] as Array<"success">,
      }),
    )
    const getCell = vi.fn(() =>
      Promise.resolve({
        id: "sel-1",
        value: "SELECT 1",
        position: 0,
        mode: "run" as const,
        last_run_status: "success" as const,
      }),
    )
    const getCellSql = vi.fn(() => "SELECT 1")
    const client = makeClient({
      runCell,
      getCell,
      getCellSql,
      applyNotebookState: applyOk(["sel-1"]),
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "sel-1", preserve_value: true }],
      },
      client,
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: -1,
      }),
    )
    expect(runCell).toHaveBeenCalledWith(1, "sel-1", undefined, "SELECT 1")
  })
})
