import "../../test/stubBrowserGlobals"
import { beforeEach, describe, it, expect, vi } from "vitest"
import { dispatchTool } from "../tools/dispatch"
import type { ModelToolsClient, StatusCallback } from "./aiAssistant"
import {
  __resetNotebookAIBridgeForTests,
  emitUserAction,
  getBufferActionSeq,
  signalUserEdit,
} from "../notebooks/notebookAIBridge"
import { NotebookToolError } from "../notebooks/notebookToolError"
import {
  __resetNotebookControllerForTests,
  registerController,
  type NotebookController,
  type RunCellSummary,
} from "../notebooks/notebookController"
import type { ViewParts } from "../notebooks/notebookDexieView"
import type { NotebookCell, NotebookSettings } from "../../store/notebook"
import { db } from "../../store/db"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import { dispatchMCPTool } from "../mcp/dispatchMCPTool"
import { EXPECTED_BRIDGE_VERSION } from "../mcp/protocolVersion"
import type { ToolExecutionContext } from "./shared"
import { createNotebookFreshness } from "../notebooks/notebookFreshness"

const cell = (
  id: string,
  value = "SELECT 1",
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({ id, position: 0, value, ...overrides })

// Mounts a live controller for `bufferId` so dispatch routes mutations/reads to
// this in-memory state — the agent-facing behaviour under test — while letting a
// test control runCell's summary directly. Returns the live parts so a test can
// assert the committed effect and whether a gate blocked the write.
const mountLive = (
  bufferId: number,
  cells: NotebookCell[] = [],
  opts: {
    settings?: NotebookSettings
    maximizedCellId?: string | null
    runCell?: (
      cellId: string,
      signal?: AbortSignal,
      sql?: string,
    ) => Promise<RunCellSummary>
    // Fires on each readView — lets a test simulate a user edit racing a read.
    onRead?: () => void
  } = {},
) => {
  const state: { parts: ViewParts } = {
    parts: {
      cells,
      settings: opts.settings ?? {},
      maximizedCellId: opts.maximizedCellId ?? null,
      focusedCellId: null,
    },
  }
  const runCell =
    opts.runCell ??
    (() =>
      Promise.resolve({ success: true, queryCount: 1, results: ["success"] }))
  const controller: NotebookController = {
    bufferId,
    kind: "live",
    mutate: (transition) => {
      try {
        const out = transition(state.parts)
        state.parts = out.parts
        return Promise.resolve(out.result)
      } catch (error) {
        return Promise.reject(error)
      }
    },
    readView: () => {
      opts.onRead?.()
      return Promise.resolve({
        cells: state.parts.cells,
        settings: state.parts.settings,
        maximizedCellId: state.parts.maximizedCellId ?? undefined,
      })
    },
    runCell: vi.fn(runCell),
  }
  registerController(controller)
  return { state, runCell: controller.runCell }
}

const cellIds = (state: { parts: ViewParts }): string[] =>
  state.parts.cells.map((c) => c.id)

const cellById = (state: { parts: ViewParts }, id: string) =>
  state.parts.cells.find((c) => c.id === id)

const okRun = () =>
  Promise.resolve({
    success: true,
    queryCount: 1,
    results: ["success"] as Array<"success">,
  })

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
    Promise.resolve({ bufferId: 1, label: "Notebook 1", activated: true }),
  ),
  duplicateNotebook: vi.fn(() =>
    Promise.resolve({
      bufferId: 2,
      label: "Notebook 1 (copy)",
      activated: true,
    }),
  ),
  deleteNotebook: vi.fn(() => Promise.resolve()),
  activateNotebook: vi.fn(() => Promise.resolve(true)),
  ...overrides,
})

const noopStatus: StatusCallback = () => undefined

// A default live controller for buffer 1 with an empty notebook, so reads
// (readBasics / cellValueOf) in gate-rejection and no-op tests have a bound
// notebook to consult. Tests needing specific cells or a runCell re-mount.
let live: ReturnType<typeof mountLive>
beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  await db.buffers.clear()
  // A backing Dexie row so buildSnapshot (get_notebook_state) can read meta.
  await db.buffers.put({
    id: 1,
    label: "nb-1",
    value: "",
    position: 0,
    notebookViewState: { cells: [] },
  })
  live = mountLive(1)
})

describe("dispatchTool — notebook tools (happy path)", () => {
  it("create_notebook forwards label and returns the new buffer id", async () => {
    const client = makeClient()
    const res = await dispatchTool(
      "create_notebook",
      { label: "My notebook" },
      client,
      noopStatus,
    )
    expect(client.createNotebook).toHaveBeenCalledWith("My notebook", undefined)
    expect(res.is_error).toBeUndefined()
    const parsed = JSON.parse(res.content) as {
      bufferId: number
      label: string
      hint?: string
    }
    expect(parsed.bufferId).toBe(1)
    expect(parsed.label).toBe("Notebook 1")
    // Always created in the background now → the agent is told not to switch.
    expect(parsed.hint).toMatch(/background/i)
  })

  it("add_cell without run appends the cell and returns its id", async () => {
    const { state } = mountLive(1)
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1" },
      makeClient(),
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as { cellId: string }
    expect(typeof parsed.cellId).toBe("string")
    expect(cellById(state, parsed.cellId)?.value).toBe("SELECT 1")
  })

  it("add_cell with run:true chains runCell and reports per-query status", async () => {
    const { runCell } = mountLive(1, [], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 3,
          results: ["success", "ERROR: boom", "cancelled"],
        }),
    })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1; SELECT bad; SELECT 2", run: true },
      makeClient(),
      noopStatus,
    )
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      undefined,
    )
    expect(JSON.parse(res.content)).toMatchObject({
      ran: false,
      queryCount: 3,
      results: ["success", "ERROR: boom", "cancelled"],
    })
  })

  it("update_cell writes only the value", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "keep" })])
    await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.value).toBe("SELECT 2")
    expect(cellById(state, "c")?.name).toBe("keep")
  })

  it("run_cell serialises the explicit per-query shape and never leaks data keys", async () => {
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["ERROR: syntax"],
        }),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
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
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["pending"],
          unverified: true,
          note: "Run outcome unverified.",
        }),
    })

    const runCellRes = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
    )
    const p1 = JSON.parse(runCellRes.content) as Record<string, unknown>
    expect(p1.unverified).toBe(true)
    expect(typeof p1.note).toBe("string")

    const addRes = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)", run: true },
      makeClient(),
      noopStatus,
    )
    const p2 = JSON.parse(addRes.content) as Record<string, unknown>
    expect(p2.unverified).toBe(true)
    expect(typeof p2.note).toBe("string")

    const applyRes = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [{ id: null, value: "INSERT INTO t VALUES(1)", mode: "run" }],
      },
      makeClient(),
      noopStatus,
    )
    const p3 = JSON.parse(applyRes.content) as {
      runs: Array<Record<string, unknown>>
    }
    expect(p3.runs[0].unverified).toBe(true)
    expect(typeof p3.runs[0].note).toBe("string")
  })

  it("set_cell_chart_config applies only fields the AI supplied (patch semantics)", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
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
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig).toMatchObject({
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

  it("set_cell_chart_config rejects when the user edits during its cell read", async () => {
    // Given a chart update that must read the current statement count
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    const pending = dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        queries: [{ type: "line", y_columns: ["price"] }],
      },
      makeClient(),
      noopStatus,
    )

    // When the user edits before the transition commits
    signalUserEdit(1)
    const result = await pending

    // Then the stale chart update is rejected without changing the cell
    expect(result.is_error).toBe(true)
    expect(JSON.parse(result.content)).toMatchObject({ error_code: "stale" })
    expect(cellById(state, "c")?.chartConfig).toBeUndefined()
  })

  it("set_cell_autorefresh maps a fixed interval token to the cell (5s)", async () => {
    const { state } = mountLive(1, [cell("c")])
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "5s" },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.autoRefresh).toBe("5s")
  })

  it("set_cell_autorefresh maps true to adaptive (2.0.0-compatible)", async () => {
    const { state } = mountLive(1, [cell("c")])
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: true },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.autoRefresh).toBe(true)
  })

  it("set_cell_autorefresh maps false to disabled (2.0.0-compatible)", async () => {
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", { autoRefresh: "5s" }),
    ])
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: false },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.autoRefresh).toBe(false)
  })

  it("set_cell_autorefresh rejects a token outside the allowed set", async () => {
    const { state } = mountLive(1, [cell("c")])
    const res = await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "2s" },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(cellById(state, "c")?.autoRefresh).toBeUndefined()
  })

  it("set_cell_name sets the cell name", async () => {
    const { state } = mountLive(1, [cell("c")])
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "BTC price" },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.name).toBe("BTC price")
  })

  it("set_cell_name clears the name when passed null", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "old" })])
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: null },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.name).toBeUndefined()
  })

  it("set_cell_name rejects a name over the length limit", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "orig" })])
    const res = await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "a".repeat(101) },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(cellById(state, "c")?.name).toBe("orig")
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

  it("set_cell_chart_config with only `queries` maps the query without x/name defaults", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [{ type: "bar" }] },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([
      { type: "bar", yColumns: [] },
    ])
  })

  it("applies explicit ohlc for candlestick", async () => {
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
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
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig).toMatchObject({
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
  })

  it("treats null fields on set_cell_chart_config as 'omit' (not overwrite)", async () => {
    // Strict tool schemas (OpenAI Structured Outputs) require every property
    // in `required`; optional-ness is expressed via nullable types. The
    // handler must treat null as "leave the cell's current value alone".
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
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
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([
      { type: "line", yColumns: [] },
    ])
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
  })

  const twoStatementCell = () =>
    mountLive(1, [cell("c", "SELECT a FROM t; SELECT b FROM t")])

  it("rejects a non-empty queries array whose length != the cell's statement count", async () => {
    twoStatementCell()
    const res = await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        // One config for a two-statement cell — would silently drop Q2.
        queries: [{ type: "line", y_columns: ["a"] }],
      },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
  })

  it("applies a queries array that matches the cell's statement count", async () => {
    const { state } = twoStatementCell()
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
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig?.queries).toMatchObject([
      { type: "line", yColumns: ["a"] },
      { type: "bar", yColumns: ["b"] },
    ])
  })

  it("allows queries:[] (reset to inference) regardless of statement count", async () => {
    const { state } = twoStatementCell()
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [] },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([])
  })

  it("preserves a null queries entry (infer this statement) instead of crashing", async () => {
    const { state } = twoStatementCell()
    await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        // First statement left to inference (null), second configured explicitly.
        queries: [null, { type: "bar", y_columns: ["b"] }],
      },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "c")?.chartConfig?.queries).toMatchObject([
      null,
      { type: "bar", yColumns: ["b"] },
    ])
  })

  it("apply_notebook_state translates snake_case wire shape to camelCase state", async () => {
    // Given a notebook with cells b and c
    const { state } = mountLive(1, [cell("b", "old"), cell("c", "old")])
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
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBeUndefined()
    // The applied cell carries every field in camelCase; c (omitted) is deleted.
    expect(cellIds(state)).toEqual(["b"])
    expect(cellById(state, "b")).toMatchObject({
      name: "Trades",
      value: "SELECT 1",
      mode: "draw",
      autoRefresh: "5s",
      isViewMaximized: true,
      chartConfig: {
        xColumn: "ts",
        queries: [
          { type: "line", yColumns: ["price"], partitionByColumn: "symbol" },
        ],
      },
    })
    expect(state.parts.settings.layoutMode).toBe("grid")
    const parsed = JSON.parse(res.content) as {
      applied: { updated: string[]; deleted: string[] }
    }
    expect(parsed.applied.updated).toEqual(["b"])
    expect(parsed.applied.deleted).toEqual(["c"])
  })

  it("apply_notebook_state applies ordered variables; null preserves, [] clears", async () => {
    const variables = [
      { name: "x", value: "10" },
      { name: "from_ts", value: "dateadd('d', -7, now())" },
    ]
    // Ordered variables are written to settings.
    const a = mountLive(1)
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables,
        cells: [{ value: "SELECT @x FROM trades WHERE ts > @from_ts" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(a.state.parts.settings.variables).toEqual(variables)

    // null preserves the notebook's existing variables.
    const b = mountLive(1, [], {
      settings: { variables: [{ name: "keep", value: "1" }] },
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: null,
        cells: [{ value: "SELECT 1" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(b.state.parts.settings.variables).toEqual([
      { name: "keep", value: "1" },
    ])

    // [] clears them.
    const c = mountLive(1, [], {
      settings: { variables: [{ name: "gone", value: "1" }] },
    })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        variables: [],
        cells: [{ value: "SELECT 1" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(c.state.parts.settings.variables).toEqual([])
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
    // The apply committed: the requested cell is now present.
    expect(live.state.parts.cells).toHaveLength(1)
  })

  it("apply_notebook_state rejects as STATE_STALE when the user edits during validation", async () => {
    const client = makeClient()
    // The user edits a cell (keystroke) while the per-variable validation awaits.
    const validateSql = vi.fn(() => {
      signalUserEdit(1)
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
  })

  it("apply_notebook_state rejects STATE_STALE on a user edit since the read baseline (in-app generation window)", async () => {
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "x" })
    const toolContext = {
      notebookFreshness: createNotebookFreshness([[1, readSeq]]),
    }
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
  })

  it("apply_notebook_state reports state_applied + post_apply_aborted when the turn is cancelled after the durable commit", async () => {
    // Given a mounted notebook whose commit lands, but the turn is cancelled the
    // instant afterwards — before the post-apply read.
    const abort = new AbortController()
    const state: { parts: ViewParts } = {
      parts: {
        cells: [cell("b", "old")],
        settings: {},
        maximizedCellId: null,
        focusedCellId: null,
      },
    }
    const controller: NotebookController = {
      bufferId: 1,
      kind: "live",
      mutate: (transition) => {
        try {
          const out = transition(state.parts)
          state.parts = out.parts
          abort.abort()
          return Promise.resolve(out.result)
        } catch (error) {
          return Promise.reject(error)
        }
      },
      readView: () =>
        Promise.resolve({
          cells: state.parts.cells,
          settings: state.parts.settings,
          maximizedCellId: state.parts.maximizedCellId ?? undefined,
        }),
      runCell: vi.fn(okRun),
    }
    registerController(controller)

    // When apply_notebook_state runs under that signal
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ id: "b", value: "SELECT 1" }] },
      makeClient(),
      noopStatus,
      undefined,
      undefined,
      abort.signal,
    )

    // Then it is not reported as a failure: the commit is acknowledged and the
    // aborted post-apply phase is flagged, so a retry is never ambiguous.
    expect(res.is_error).toBeFalsy()
    const parsed = JSON.parse(res.content) as {
      state_applied?: boolean
      post_apply_aborted?: boolean
    }
    expect(parsed.state_applied).toBe(true)
    expect(parsed.post_apply_aborted).toBe(true)
    // The mutation really committed.
    expect(state.parts.cells[0].value).toBe("SELECT 1")
  })

  it("update_cell rejects STATE_STALE when the user edited since the read baseline", async () => {
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    signalUserEdit(1)
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookFreshness: createNotebookFreshness([[1, readSeq]]) },
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("update_cell refuses a buffer with no read baseline this turn", async () => {
    // Given a flow with notebook context that never read buffer 2
    const client = makeClient()
    // When the agent edits it blind
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 2, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      {
        notebookFreshness: createNotebookFreshness([
          [1, getBufferActionSeq(1)],
        ]),
      },
    )
    // Then it must read the notebook first — user edits made since the flow
    // started would otherwise be overwritten unnoticed
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("state_not_fetched")
  })

  it("add_cell refuses a buffer with no read baseline this turn (same gate as the MCP surface)", async () => {
    // Given a flow with notebook context that never read buffer 2
    const client = makeClient()
    // When the agent adds a cell blind
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 2, value: "SELECT 1" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookFreshness: createNotebookFreshness() },
    )
    // Then it must read the notebook first
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("state_not_fetched")
  })

  it("apply_notebook_state refuses a buffer with no read baseline this turn (same gate as the MCP surface)", async () => {
    // Given a flow with notebook context that never read buffer 2
    const client = makeClient()
    // When the agent overwrites the notebook blind
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 2, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookFreshness: createNotebookFreshness() },
    )
    // Then even a wholesale PUT must read the notebook first
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("state_not_fetched")
  })

  it("a context-less flow reaches a notebook write after one get_notebook_state (no deadlock)", async () => {
    // Given the tracker a context-less flow now gets from buildNotebookFreshness:
    // a real, empty freshness instance (never undefined)
    live = mountLive(1, [cell("c")])
    const client = makeClient()
    const toolContext = { notebookFreshness: createNotebookFreshness() }
    // When the agent writes blind, it is told to read the notebook first
    const blind = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    expect(
      (JSON.parse(blind.content) as { error_code?: string }).error_code,
    ).toBe("state_not_fetched")
    // ...and after the prescribed get_notebook_state, the retry goes through:
    // the empty tracker was recordable, so the recovery actually unblocks it.
    await dispatchTool(
      "get_notebook_state",
      { buffer_id: 1 },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    const retry = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    // Then the write succeeds
    expect(retry.is_error).toBeUndefined()
    expect(cellById(live.state, "c")?.value).toBe("SELECT 2")
  })

  it("create_notebook seeds the read baseline so the agent can populate the new buffer", async () => {
    // Given a flow with notebook context and a cell to edit
    live = mountLive(1, [cell("c")])
    const client = makeClient()
    const toolContext = { notebookFreshness: createNotebookFreshness() }
    // When the agent creates a notebook (client stub returns bufferId 1)
    await dispatchTool(
      "create_notebook",
      { label: "My notebook" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    // Then a mutating tool on the new buffer passes the baseline gate
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    expect(res.is_error).toBeUndefined()
    expect(cellById(live.state, "c")?.value).toBe("SELECT 2")
  })

  it("get_notebook_state records the PRE-read baseline: an edit during the read keeps the buffer stale", async () => {
    // Given a read that races a user edit (the snapshot may predate the edit)
    live = mountLive(1, [cell("c")], { onRead: () => signalUserEdit(1) })
    const client = makeClient()
    const toolContext = { notebookFreshness: createNotebookFreshness() }
    // When the agent reads, then edits
    await dispatchTool(
      "get_notebook_state",
      { buffer_id: 1 },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      toolContext,
    )
    // Then the mid-read edit still blocks the write
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("a flow without notebook context refuses blind cell edits", async () => {
    // Given a quick-action flow (tool context with no read-seq map at all)
    const client = makeClient()
    // When the model edits a notebook it never read
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      {},
    )
    // Then it must read the notebook first
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("state_not_fetched")
  })

  it("a cell edit without a numeric buffer_id is refused outright", async () => {
    // Given a flow with notebook context
    const client = makeClient()
    // When the model omits buffer_id
    const res = await dispatchTool(
      "update_cell",
      { cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookFreshness: createNotebookFreshness() },
    )
    // Then it is rejected before any executor runs
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("invalid_buffer_id")
  })

  it("apply_notebook_state rejects after a user auto-refresh/maximize/spotlight toggle (signalUserEdit) since the read baseline", async () => {
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    // handleAutoRefreshChange / handleChartMaximizedChange / the spotlight toggle
    // all call signalUserEdit(1); the agent's stale full-state apply must reject.
    signalUserEdit(1)
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      undefined,
      undefined,
      undefined,
      { notebookFreshness: createNotebookFreshness([[1, readSeq]]) },
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("update_cell rejects STATE_STALE when the user edits during validation", async () => {
    live = mountLive(1, [cell("c")], { onRead: () => signalUserEdit(1) })
    const client = makeClient()
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
  })

  it("apply_notebook_state rejects a candlestick query with no ohlc (never derived from y_columns)", async () => {
    const { state } = mountLive(1)
    const res = await dispatchTool(
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
      makeClient(),
      noopStatus,
    )
    // ohlc is never fabricated from y_columns — the candlestick is rejected
    // outright, and nothing is committed.
    expect(res.is_error).toBe(true)
    expect(state.parts.cells).toHaveLength(0)
  })

  it("apply_notebook_state surfaces an invalid request as VALIDATION_ERROR", async () => {
    // A supplied id that does not exist is rejected wholesale (never created,
    // which would silently drop omitted cells).
    mountLive(1)
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
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("validation")
    expect(parsed.message).toMatch(/VALIDATION_ERROR/)
  })

  it("set_cell_maximized allows null to clear the spotlight", async () => {
    const { state } = mountLive(1, [cell("c")], { maximizedCellId: "c" })
    await dispatchTool(
      "set_cell_maximized",
      { buffer_id: 1, cell_id: null },
      makeClient(),
      noopStatus,
    )
    expect(state.parts.maximizedCellId).toBe(null)
  })

  it("denies run_cell when SQL cannot be resolved for permission classification", async () => {
    // No cell "inactive" exists → its SQL cannot be resolved for the gate.
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "inactive" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: false },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/could not resolve SQL/)
  })

  it("denies set_cell_mode draw when cell SQL contains DDL/DML, even with write granted", async () => {
    mountLive(1, [cell("c", "DROP TABLE victim")])
    const res = await dispatchTool(
      "set_cell_mode",
      { buffer_id: 1, cell_id: "c", mode: "draw" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
  })

  it("set_cell_mode rejects when the user edits during draw validation", async () => {
    // Given a draw-mode validation held in flight
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    const validationResult = {
      query: "SELECT 1",
      columns: [{ name: "1", type: "INT" }],
      timestamp: 0,
    }
    let resolveValidation!: (value: typeof validationResult) => void
    const validateSql = vi.fn(
      () =>
        new Promise<typeof validationResult>((resolve) => {
          resolveValidation = resolve
        }),
    )
    const pending = dispatchTool(
      "set_cell_mode",
      { buffer_id: 1, cell_id: "c", mode: "draw" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      validateSql,
    )
    await vi.waitFor(() => expect(validateSql).toHaveBeenCalledOnce())

    // When the user edits before validation resolves
    signalUserEdit(1)
    resolveValidation(validationResult)
    const result = await pending

    // Then the stale mode change is rejected without changing the cell
    expect(result.is_error).toBe(true)
    expect(JSON.parse(result.content)).toMatchObject({ error_code: "stale" })
    expect(cellById(state, "c")?.mode).toBeUndefined()
  })

  it("denies update_cell on a draw cell when new SQL contains DDL/DML, even with write granted", async () => {
    mountLive(1, [cell("c", "SELECT 1", { mode: "draw" })])
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "DROP TABLE victim" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
  })

  it("denies apply_notebook_state with a draw cell containing DDL/DML, even with write granted", async () => {
    mountLive(1)
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
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "DROP TABLE" }),
    )
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/Cannot draw a write query/)
  })

  it("allows run_cell with SELECT when read and write are both denied", async () => {
    const { runCell } = mountLive(1, [cell("c", "SELECT 1")])
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
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
    expect(runCell).toHaveBeenCalledWith("c", undefined, "SELECT 1")
  })

  it("run_cell executes the checked SQL, not a value swapped in during the validate round-trip", async () => {
    // A run-mode cell starts at a read query the gate will allow.
    const { state, runCell } = mountLive(1, [cell("c", "SELECT 1")])
    // Simulate a concurrent ungated update_cell landing while run_cell awaits
    // the /sql/validate round-trip: the live cell value flips to a write
    // between classification and execution.
    const validateSql = vi.fn((sql: string) => {
      state.parts = {
        ...state.parts,
        cells: [cell("c", "DROP TABLE t")],
      }
      return Promise.resolve({
        query: sql,
        columns: [{ name: "c1", type: "LONG" }],
        timestamp: -1,
      })
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: false, read: true, write: false },
      validateSql,
    )
    expect(res.is_error).toBeFalsy()
    // The race is real: the live value did change mid-flight...
    expect(cellById(state, "c")?.value).toBe("DROP TABLE t")
    // ...but the executor was handed the checked SELECT, never the DROP.
    expect(runCell).toHaveBeenCalledWith("c", undefined, "SELECT 1")
  })

  it("run_cell with no gate leaves execution to re-read the live cell", async () => {
    const { runCell } = mountLive(1, [cell("c", "SELECT 1")])
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBeFalsy()
    // No gate ran, so no SQL is pinned — the executor re-reads the cell.
    expect(runCell).toHaveBeenCalledWith("c", undefined, undefined)
  })

  it("allows add_cell with run=true and SELECT when read and write are both denied", async () => {
    mountLive(1)
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1", run: true },
      makeClient(),
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
    const { state, runCell } = mountLive(1)
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(res.is_error).toBeFalsy()
    expect(cellById(state, cellIds(state)[0])?.value).toBe(
      "INSERT INTO t VALUES (1)",
    )
    expect(runCell).not.toHaveBeenCalled()
    const parsed = JSON.parse(res.content) as {
      cellId: string
      ran: boolean
      skipped?: boolean
      note?: string
    }
    expect(parsed).toMatchObject({
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
    const gate = mountLive(1, [], { runCell: okRun })
    const gated = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({ queryType: "INSERT" }),
    )
    expect(gate.runCell).not.toHaveBeenCalled()
    expect(JSON.parse(gated.content)).toMatchObject({
      ran: false,
      skipped: true,
    })

    const ungate = mountLive(1, [], { runCell: okRun })
    const ungated = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient(),
      noopStatus,
    )
    expect(ungate.runCell).toHaveBeenCalled()
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
    const { runCell } = mountLive(1, [], { runCell: okRun })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "SELECT 1", mode: "run" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      undefined,
    )
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ success: boolean; queryCount?: number; results?: string[] }>
    }
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({
      success: true,
      queryCount: 1,
      results: ["success"],
    })
  })

  it("defaults omitted mode to 'run' for new cells and runs them", async () => {
    const { runCell } = mountLive(1, [], { runCell: okRun })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "SELECT 1" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      undefined,
    )
  })

  it("skips cells whose resolved mode is 'draw'", async () => {
    const { runCell } = mountLive(1, [], { runCell: okRun })
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
      makeClient(),
      noopStatus,
    )
    expect(runCell).not.toHaveBeenCalled()
  })

  it("does not auto-run a preserved draw cell whose mode comes from the notebook", async () => {
    // Given an existing draw-mode chart cell
    const { state, runCell } = mountLive(
      1,
      [
        cell("chart-1", "SELECT 1", {
          mode: "draw",
          chartConfig: {
            xColumn: "ts",
            queries: [{ type: "line", yColumns: ["c1"] }],
          },
        }),
      ],
      { runCell: okRun },
    )
    // When the agent preserves it without restating its mode and re-sends the chart PUT
    const result = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: "chart-1",
            preserve_value: true,
            chart_config: {
              x_column: "ts",
              queries: [{ type: "line", y_columns: ["c1"] }],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      undefined,
      dqlValidate,
    )
    // Then the chart remains in draw mode and is never re-run as SQL
    expect(result.is_error).toBeFalsy()
    expect(cellById(state, "chart-1")?.mode).toBe("draw")
    expect(runCell).not.toHaveBeenCalled()
  })

  it("gates a draw cell's replacement SQL as DQL-only via its existing mode", async () => {
    // Given an existing draw-mode cell and a validator classifying the new SQL as a write
    const validateSql = vi.fn(() => Promise.resolve({ queryType: "insert" }))
    mountLive(1, [cell("chart-1", "SELECT 1", { mode: "draw" })])
    // When the agent writes non-DQL into the chart cell without restating its mode
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "chart-1", value: "INSERT INTO t VALUES (1)" }],
      },
      makeClient(),
      noopStatus,
      undefined,
      validateSql,
    )
    // Then the draw invariant denies the whole apply before anything commits
    expect(res.is_error).toBe(true)
  })

  it("skips cells with empty SQL", async () => {
    const { runCell } = mountLive(1, [], { runCell: okRun })
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "   ", mode: "run" }],
      },
      makeClient(),
      noopStatus,
    )
    expect(runCell).not.toHaveBeenCalled()
  })

  it("skips DDL/DML run cells regardless of the write permission", async () => {
    const { runCell } = mountLive(1, [], { runCell: okRun })
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: null, value: "DROP TABLE victim", mode: "run" }],
      },
      makeClient(),
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
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)", { mode: "run" })],
      { runCell: okRun },
    )
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "ins-1", value: "INSERT INTO t VALUES (1)" }],
      },
      makeClient(),
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
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)", { mode: "run" })],
      { runCell: okRun },
    )
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
      makeClient(),
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
    const { runCell } = mountLive(
      1,
      [cell("sel-1", "SELECT 1", { mode: "run" })],
      { runCell: okRun },
    )
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "sel-1", value: "SELECT 1" }],
      },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      dqlValidate,
    )
    expect(runCell).toHaveBeenCalledWith("sel-1", undefined, "SELECT 1")
  })

  it("preserves existing mode when mode is omitted on an existing cell (draw stays draw, run stays run)", async () => {
    const { state, runCell } = mountLive(
      1,
      [
        cell("run-id", "old", { mode: "run" }),
        cell("draw-id", "old", { mode: "draw" }),
      ],
      { runCell: okRun },
    )
    const res = await dispatchTool(
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
            chart_config: {
              x_column: "ts",
              queries: [{ type: "line", y_columns: ["c1"] }],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      dqlValidate,
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledTimes(1)
    expect(runCell).toHaveBeenCalledWith("run-id", undefined, "SELECT 1")
    expect(cellById(state, "run-id")?.mode).toBe("run")
    expect(cellById(state, "draw-id")?.mode).toBe("draw")
  })

  it("dispatches run-mode cells in parallel — total wallclock equals slowest cell, not the sum", async () => {
    const order: string[] = []
    const finish: Record<string, () => void> = {}
    mountLive(1, [], {
      runCell: (cellId: string) =>
        new Promise<RunCellSummary>((resolve) => {
          order.push(cellId)
          finish[cellId] = () =>
            resolve({ success: true, queryCount: 1, results: ["success"] })
        }),
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
      makeClient(),
      noopStatus,
    )
    // Flush microtasks so dispatchTool resumes past the apply and fires every
    // runCell concurrently.
    await new Promise((r) => setTimeout(r, 0))
    expect(order).toHaveLength(3)
    // Finish out of submission order — only possible if all three are in
    // flight simultaneously.
    finish[order[2]]()
    finish[order[0]]()
    finish[order[1]]()
    const res = await pending
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean }>
    }
    // Order in `runs` matches request/submission order, not finish order.
    expect(parsed.runs.map((r) => r.cellId)).toEqual(order)
  })

  it("reports per-cell runCell failure in the runs array with per-query results", async () => {
    mountLive(1, [], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 3,
          results: ["success", "ERROR: boom", "cancelled"],
        }),
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
      makeClient(),
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ success: boolean; queryCount?: number; results?: string[] }>
    }
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.runs[0]).toMatchObject({
      success: false,
      queryCount: 3,
      results: ["success", "ERROR: boom", "cancelled"],
    })
  })
})

describe("dispatchTool — NotebookToolError envelope", () => {
  it("archived → { error_code: 'archived', hint, message }", async () => {
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.reject(
          new NotebookToolError("archived", 'Notebook "x" is archived.'),
        ),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("archived")
    expect(parsed.hint).toMatch(/unarchive|create_notebook/)
  })

  it("deleted → error_code 'deleted'", async () => {
    mountLive(1, [cell("c")], {
      runCell: () => Promise.reject(new NotebookToolError("deleted", "gone")),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
    )
    expect(res.is_error).toBe(true)
    expect(
      (JSON.parse(res.content) as Record<string, unknown>).error_code,
    ).toBe("deleted")
  })

  it("unknown_cell → error_code 'unknown_cell' with resync hint", async () => {
    // Deleting a cell that doesn't exist throws unknown_cell from the transition.
    mountLive(1, [cell("keep")])
    const res = await dispatchTool(
      "delete_cell",
      { buffer_id: 1, cell_id: "abc123" },
      makeClient(),
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
    mountLive(1, [cell("c")], {
      runCell: () => Promise.reject(new Error("network boom")),
    })
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
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
    // Always fresh: the recorded read seq tracks the live seq for every buffer.
    freshness: {
      getReadSeq: (bufferId: number) => getBufferActionSeq(bufferId),
      recordRead: () => undefined,
      assertFresh: () => "fresh" as const,
      generation: () => 0,
      reset: () => undefined,
    },
    metaToolContext: {
      getActiveBufferId: () => 1,
      getWorkspace: () => null,
      getDigest: () => null,
      runQuery: null,
    },
  })

  it("run_cell happy-path response carries no data field keys", async () => {
    mountLive(1, [cell("c")], { runCell: okRun })
    const result = await dispatchMCPTool(
      callOf("run_cell", { buffer_id: 1, cell_id: "c" }),
      ctxFor(makeClient()),
    )
    const wireText = JSON.stringify(result)
    expect(wireText).not.toMatch(/columns|dataset|count|rows/)
  })

  it("run_cell error-path response carries no data field keys", async () => {
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["ERROR: syntax near (1)"],
        }),
    })
    const result = await dispatchMCPTool(
      callOf("run_cell", { buffer_id: 1, cell_id: "c" }),
      ctxFor(makeClient()),
    )
    const wireText = JSON.stringify(result)
    expect(wireText).toMatch(/syntax/)
    expect(wireText).not.toMatch(/columns|dataset|count|rows/)
  })

  it("add_cell with run:true similarly never leaks data fields", async () => {
    mountLive(1, [], { runCell: okRun })
    const result = await dispatchMCPTool(
      callOf("add_cell", { buffer_id: 1, sql: "select 1", run: true }),
      ctxFor(makeClient()),
    )
    expect(JSON.stringify(result)).not.toMatch(/columns|dataset|count|rows/)
  })
})

describe("dispatchTool — get_cell content cap switch", () => {
  const bigValue = "x".repeat(5000)

  it("returns the full value when get_full_content: true", async () => {
    mountLive(1, [cell("c", bigValue)])
    const res = await dispatchTool(
      "get_cell",
      { buffer_id: 1, cell_id: "c", get_full_content: true },
      makeClient(),
      noopStatus,
    )
    const parsed = JSON.parse(res.content) as {
      value: string
      truncated?: boolean
    }
    expect(parsed.value).toBe(bigValue)
    expect(parsed.truncated).toBeUndefined()
  })

  it("applies the cap when get_full_content is omitted or null", async () => {
    mountLive(1, [cell("c", bigValue)])
    for (const input of [
      { buffer_id: 1, cell_id: "c" },
      { buffer_id: 1, cell_id: "c", get_full_content: null },
    ]) {
      const res = await dispatchTool(
        "get_cell",
        input,
        makeClient(),
        noopStatus,
      )
      const parsed = JSON.parse(res.content) as {
        value: string
        truncated?: boolean
        full_length?: number
      }
      expect(parsed.value).toHaveLength(4096)
      expect(parsed.truncated).toBe(true)
      expect(parsed.full_length).toBe(5000)
    }
  })
})

describe("dispatchTool — apply_notebook_state preserve_value", () => {
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
  })

  it("preserves a cell's existing value with preserve_value:true", async () => {
    const { state } = mountLive(1, [cell("a", "keepme")])
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "a", preserve_value: true }],
      },
      makeClient(),
      noopStatus,
    )
    expect(cellById(state, "a")?.value).toBe("keepme")
  })

  it("auto-run skips a preserved write cell, gating on its live SQL", async () => {
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)", { mode: "run" })],
      { runCell: okRun },
    )
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "ins-1", preserve_value: true }],
      },
      makeClient(),
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
    const { runCell } = mountLive(
      1,
      [cell("sel-1", "SELECT 1", { mode: "run" })],
      {
        runCell: okRun,
      },
    )
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "sel-1", preserve_value: true }],
      },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      vi.fn().mockResolvedValue({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: -1,
      }),
    )
    expect(runCell).toHaveBeenCalledWith("sel-1", undefined, "SELECT 1")
  })
})
