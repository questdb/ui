import "../../test/stubBrowserGlobals"
import type { Permissions } from "../tools/permissions"
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
  unregisterController,
  type NotebookController,
  type RunCellSummary,
} from "../notebooks/notebookController"
import type { ViewParts } from "../notebooks/notebookDexieView"
import type {
  NotebookCell,
  NotebookSettings,
  SingleQueryResult,
} from "../../store/notebook"
import { db } from "../../store/db"
import {
  loadCellSnapshot,
  loadSnapshotCellIds,
  saveCellSnapshot,
} from "../../store/notebookResults"
import { __resetNotebookBufferQueuesForTests } from "../notebooks/notebookBufferQueue"
import {
  checkStatementsForAutoRun,
  checkStatementsForExecution,
  classifyStatements,
  clearStatementClassCache,
  type RunCellGate,
} from "../tools/permissions"
import type { ValidateQueryResult } from "../questdb/types"
import { dispatchMCPTool } from "../mcp/dispatchMCPTool"
import { EXPECTED_MCP_VERSION } from "../mcp/protocolVersion"
import type { ToolExecutionContext } from "./shared"
import { createNotebookFreshness } from "../notebooks/notebookFreshness"
import { computeAgentCellGridH } from "../../scenes/Editor/Notebook/cellSizing"

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
    // When set, the harness runner honors the gate contract the real runner
    // implements: classify the checked SQL, deny/skip on the barrier.
    validate?: (sql: string) => Promise<ValidateQueryResult>
    // Fires on each readView — lets a test simulate a user edit racing a read.
    onRead?: () => void
    // Fires when duplicate_cell flushes live chart snapshots.
    onFlush?: () => void
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
  const inner =
    opts.runCell ??
    (() =>
      Promise.resolve({ success: true, queryCount: 1, results: ["success"] }))
  const runCell = async (
    cellId: string,
    signal?: AbortSignal,
    sql?: string,
    gate?: RunCellGate,
  ): Promise<RunCellSummary> => {
    if (gate !== undefined && sql !== undefined && opts.validate) {
      const stmts = await classifyStatements(sql, opts.validate)
      if (gate.kind === "explicit") {
        const decision = checkStatementsForExecution(stmts, gate.permissions)
        if (!decision.granted) {
          return {
            success: false,
            queryCount: 0,
            results: [],
            denied: decision.reason,
          }
        }
      } else {
        const decision = checkStatementsForAutoRun(stmts)
        if (decision.action === "skip") {
          return {
            success: false,
            queryCount: 0,
            results: [],
            skipped: decision.reason,
          }
        }
      }
    }
    return inner(cellId, signal, sql)
  }
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
    mutateWithResultStatus: (transition) =>
      controller.mutate((parts) => transition(parts, () => "unrequested")),
    readView: () => {
      opts.onRead?.()
      return Promise.resolve({
        cells: state.parts.cells,
        settings: state.parts.settings,
        maximizedCellId: state.parts.maximizedCellId ?? undefined,
      })
    },
    runCell: vi.fn(runCell),
    flushChartSnapshots: () => {
      opts.onFlush?.()
      return Promise.resolve()
    },
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

// Every agent surface supplies permissions and a validator; tests that do not
// exercise gating use the widest grant and a validator that classifies as DQL.
const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })

// A default live controller for buffer 1 with an empty notebook, so reads
// (readBasics / cellValueOf) in gate-rejection and no-op tests have a bound
// notebook to consult. Tests needing specific cells or a runCell re-mount.
let live: ReturnType<typeof mountLive>
beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  clearStatementClassCache()
  await db.buffers.clear()
  await db.notebook_results.clear()
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
  it("get_notebook_state preserves comparison operators in previews", async () => {
    // Given a cell whose SQL contains comparison operators
    const value =
      "SELECT * FROM fx_trades WHERE price < 1 AND quantity > 2 AND symbol <> 'A&B'"
    live = mountLive(1, [cell("c", value)])

    // When the agent reads the notebook state
    const res = await dispatchTool(
      "get_notebook_state",
      { buffer_id: 1 },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the preview keeps the operators verbatim
    expect(res.is_error).toBeUndefined()
    const parsed = JSON.parse(res.content) as {
      cells: Array<{ preview: string }>
    }
    expect(parsed.cells[0].preview).toBe(value)
  })

  it("create_notebook forwards label and returns the new buffer id", async () => {
    // Given a workspace client
    const client = makeClient()
    // When the agent creates a labelled notebook
    const res = await dispatchTool(
      "create_notebook",
      { label: "My notebook" },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the label is forwarded and the new buffer is described
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
    // Given an empty live notebook
    const { state } = mountLive(1)
    // When the agent adds a cell without running it
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell is appended and its id returned
    const parsed = JSON.parse(res.content) as { cellId: string }
    expect(typeof parsed.cellId).toBe("string")
    expect(cellById(state, parsed.cellId)?.value).toBe("SELECT 1")
  })

  it("duplicate_cell copies the source snapshot under the new cell id", async () => {
    // Given a run cell whose result is stored outside the notebook state
    const results: SingleQueryResult[] = [
      {
        type: "dql",
        query: "SELECT 1",
        columns: [],
        dataset: [],
        count: 0,
      },
    ]
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "source",
      results,
      savedAt: 100,
      activeResultIndex: 0,
    })
    const { state } = mountLive(1, [
      cell("source", "SELECT 1", { lastRunStatus: "success" }),
    ])

    // When the agent duplicates the cell
    const response = await dispatchTool(
      "duplicate_cell",
      { buffer_id: 1, cell_id: "source" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    const { cellId } = JSON.parse(response.content) as { cellId: string }

    // Then the new cell gets an independent snapshot under its fresh id,
    // stamped with a fresh savedAt so recency pruning treats the copy as current
    expect(cellIds(state)).toEqual(["source", cellId])
    const copied = await loadCellSnapshot(1, cellId)
    const { savedAt, ...restOfCopied } = copied!
    expect(restOfCopied).toEqual({
      bufferId: 1,
      cellId,
      results,
      activeResultIndex: 0,
    })
    expect(savedAt).toBeGreaterThan(100)

    // And the source snapshot is left untouched
    expect(await loadCellSnapshot(1, "source")).toEqual({
      bufferId: 1,
      cellId: "source",
      results,
      savedAt: 100,
      activeResultIndex: 0,
    })
  })

  it("duplicate_cell removes its copied snapshot when the notebook changes during the read", async () => {
    // Given a source snapshot and a user edit racing the agent's notebook read
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "source",
      results: [
        {
          type: "dql",
          query: "SELECT 1",
          columns: [],
          dataset: [],
          count: 0,
        },
      ],
      savedAt: 100,
    })
    const { state } = mountLive(
      1,
      [cell("source", "SELECT 1", { lastRunStatus: "success" })],
      { onRead: () => signalUserEdit(1) },
    )

    // When the agent tries to duplicate the stale read
    const response = await dispatchTool(
      "duplicate_cell",
      { buffer_id: 1, cell_id: "source" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then neither a cell nor an orphan snapshot is left behind
    expect(response.is_error).toBe(true)
    expect(cellIds(state)).toEqual(["source"])
    expect(await loadSnapshotCellIds(1)).toEqual(["source"])
  })

  it("duplicate_cell drops a copied snapshot when refresh changes the live source", async () => {
    // Given a source cell whose flush-time refresh changes its run status
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "source",
      results: [
        {
          type: "dql",
          query: "SELECT 1",
          columns: [],
          dataset: [[1]],
          count: 1,
        },
      ],
      savedAt: 100,
    })
    const { state } = mountLive(
      1,
      [cell("source", "SELECT 1", { lastRunStatus: "success" })],
      {
        onFlush: () => {
          state.parts = {
            ...state.parts,
            cells: state.parts.cells.map((current) =>
              current.id === "source"
                ? { ...current, lastRunStatus: "error", lastRunError: "new" }
                : current,
            ),
          }
        },
      },
    )

    // When the agent duplicates the cell
    const response = await dispatchTool(
      "duplicate_cell",
      { buffer_id: 1, cell_id: "source" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    const { cellId } = JSON.parse(response.content) as { cellId: string }

    // Then the copy carries the refreshed status and no stale snapshot
    expect(cellById(state, cellId)).toMatchObject({
      lastRunStatus: "error",
      lastRunError: "new",
    })
    expect(await loadCellSnapshot(1, cellId)).toBeUndefined()
  })

  it("add_cell with run:true chains runCell and reports per-query status", async () => {
    // Given a runner that reports mixed per-query outcomes
    const { runCell } = mountLive(1, [], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 3,
          results: ["success", "ERROR: boom", "cancelled"],
        }),
    })
    // When the agent adds a cell and runs it
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "SELECT 1; SELECT bad; SELECT 2", run: true },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the run is auto-run gated and every query status is reported
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.any(String),
      { kind: "autoRun" },
    )
    expect(JSON.parse(res.content)).toMatchObject({
      ran: false,
      queryCount: 3,
      results: ["success", "ERROR: boom", "cancelled"],
    })
  })

  it("update_cell writes only the value", async () => {
    // Given a named cell
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "keep" })])
    // When the agent updates its value
    await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then only the value changes
    expect(cellById(state, "c")?.value).toBe("SELECT 2")
    expect(cellById(state, "c")?.name).toBe("keep")
  })

  it("run_cell serialises the explicit per-query shape and never leaks data keys", async () => {
    // Given a runner that fails its only query
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 1,
          results: ["ERROR: syntax"],
        }),
    })
    // When the agent runs the cell
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the response is the explicit per-query shape
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
    // Given a runner whose outcome is unverified
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

    // When the agent uses run_cell
    const runCellRes = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the note reaches it
    const p1 = JSON.parse(runCellRes.content) as Record<string, unknown>
    expect(p1.unverified).toBe(true)
    expect(typeof p1.note).toBe("string")

    // When the agent uses add_cell with run
    const addRes = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)", run: true },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the note reaches it
    const p2 = JSON.parse(addRes.content) as Record<string, unknown>
    expect(p2.unverified).toBe(true)
    expect(typeof p2.note).toBe("string")

    // When the agent applies a run-mode cell
    const applyRes = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [{ id: null, value: "INSERT INTO t VALUES(1)", mode: "run" }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the note reaches its runs entry
    const p3 = JSON.parse(applyRes.content) as {
      runs: Array<Record<string, unknown>>
    }
    expect(p3.runs[0].unverified).toBe(true)
    expect(typeof p3.runs[0].note).toBe("string")
  })

  it("set_cell_chart_config applies only fields the AI supplied (patch semantics)", async () => {
    // Given a plain SQL cell
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    // When the agent supplies a partial chart config
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then only the supplied fields land in camelCase
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
      ALL_GRANTED,
      dqlValidator,
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
    // Given a cell without an override
    const { state } = mountLive(1, [cell("c")])
    // When the agent sets a 5s interval
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "5s" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell stores the token
    expect(cellById(state, "c")?.autoRefresh).toBe("5s")
  })

  it("set_cell_autorefresh maps true to adaptive (2.0.0-compatible)", async () => {
    // Given a cell without an override
    const { state } = mountLive(1, [cell("c")])
    // When the agent passes true
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: true },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell stores adaptive
    expect(cellById(state, "c")?.autoRefresh).toBe(true)
  })

  it("set_cell_autorefresh maps false to disabled (2.0.0-compatible)", async () => {
    // Given a cell on a fixed interval
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", { autoRefresh: "5s" }),
    ])
    // When the agent passes false
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: false },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell stores disabled
    expect(cellById(state, "c")?.autoRefresh).toBe(false)
  })

  it("set_cell_autorefresh rejects a token outside the allowed set", async () => {
    // Given a cell without an override
    const { state } = mountLive(1, [cell("c")])
    // When the agent sends an unknown token
    const res = await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: "2s" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the tool errors and the cell is untouched
    expect(res.is_error).toBe(true)
    expect(cellById(state, "c")?.autoRefresh).toBeUndefined()
  })

  it("set_cell_autorefresh with null DELETES the override key so the cell inherits", async () => {
    // Given a cell carrying a stored override
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", { autoRefresh: "5s" }),
    ])
    // When the agent clears it
    await dispatchTool(
      "set_cell_autorefresh",
      { buffer_id: 1, cell_id: "c", value: null },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then no key remains — a spread patch would have kept it
    const updated = cellById(state, "c")
    expect(updated && "autoRefresh" in updated).toBe(false)
  })

  it("set_notebook_autorefresh stores the notebook default in settings", async () => {
    // Given a notebook without a default
    const { state } = mountLive(1, [cell("c")])
    // When the agent sets the notebook default
    await dispatchTool(
      "set_notebook_autorefresh",
      { buffer_id: 1, value: "30s" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then settings store it
    expect(state.parts.settings.autoRefreshDefault).toBe("30s")
  })

  it("set_notebook_autorefresh accepts Off (false) as a value", async () => {
    // Given a notebook without a default
    const { state } = mountLive(1, [cell("c")])
    // When the agent sets the default to Off
    await dispatchTool(
      "set_notebook_autorefresh",
      { buffer_id: 1, value: false },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then false survives as a value
    expect(state.parts.settings.autoRefreshDefault).toBe(false)
  })

  it("set_notebook_autorefresh with reset_cell_overrides clears every per-cell override atomically", async () => {
    // Given a dashboard where every cell carries its own interval
    const { state } = mountLive(1, [
      cell("grid1", "SELECT 1", { autoRefresh: "5s" }),
      cell("grid2", "SELECT 2", { autoRefresh: false }),
      cell("chart1", "SELECT 3", { autoRefresh: true, mode: "draw" }),
      cell("plain", "SELECT 4"),
    ])
    // When the agent sets a notebook default and asks for the reset
    await dispatchTool(
      "set_notebook_autorefresh",
      { buffer_id: 1, value: "30s", reset_cell_overrides: true },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the default is stored and no override key survives —
    // every cell now inherits 30s
    expect(state.parts.settings.autoRefreshDefault).toBe("30s")
    for (const id of ["grid1", "grid2", "chart1", "plain"]) {
      const updated = cellById(state, id)
      expect(updated && "autoRefresh" in updated).toBe(false)
    }
  })

  it("set_notebook_autorefresh without reset_cell_overrides keeps per-cell overrides winning", async () => {
    // Given a cell pinned to its own interval
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", { autoRefresh: "5s" }),
    ])
    // When the agent sets only the notebook default
    await dispatchTool(
      "set_notebook_autorefresh",
      { buffer_id: 1, value: "30s", reset_cell_overrides: null },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the override stays and still wins over the new default
    expect(state.parts.settings.autoRefreshDefault).toBe("30s")
    expect(cellById(state, "c")?.autoRefresh).toBe("5s")
  })

  it("set_notebook_autorefresh rejects a token outside the allowed set", async () => {
    // Given a notebook without a default
    const { state } = mountLive(1, [cell("c")])
    // When the agent sends an unknown token
    const res = await dispatchTool(
      "set_notebook_autorefresh",
      { buffer_id: 1, value: "2s" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the tool errors and settings are untouched
    expect(res.is_error).toBe(true)
    expect(state.parts.settings.autoRefreshDefault).toBeUndefined()
  })

  it("set_cell_mode draw never writes auto_refresh — the chart inherits", async () => {
    // Given a run cell in a notebook with no auto-refresh default
    const { state } = mountLive(1, [cell("c", "SELECT 1")])

    // When the agent switches it to draw mode
    await dispatchTool(
      "set_cell_mode",
      { buffer_id: 1, cell_id: "c", mode: "draw" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: false },
      vi.fn().mockResolvedValue({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: 0,
      }),
    )

    // Then the chart stores no per-cell value
    expect(cellById(state, "c")?.mode).toBe("draw")
    expect(cellById(state, "c")?.autoRefresh).toBeUndefined()
  })

  it("set_cell_dimensions maps strict null/auto values to semantic pane state", async () => {
    // Given a draw cell with resized panes
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", {
        mode: "draw",
        topHeight: 200,
        topResized: true,
        bottomHeight: 350,
        paneView: "result",
      }),
    ])

    // When the agent sets an auto editor height and a fixed result height
    const res = await dispatchTool(
      "set_cell_dimensions",
      {
        buffer_id: 1,
        cell_id: "c",
        editor_height: "auto",
        result_height: 300,
        view: null,
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the pane state reflects what each value means
    expect(res.is_error).toBeUndefined()
    expect(JSON.parse(res.content)).toEqual({ view: "result", mode: "draw" })
    expect(cellById(state, "c")).toMatchObject({
      topHeight: 72,
      topResized: false,
      bottomHeight: 300,
      bottomResized: true,
      paneView: "result",
    })
  })

  it("set_cell_dimensions reports the cell view", async () => {
    // Given a draw cell
    const { state } = mountLive(1, [cell("c", "SELECT 1", { mode: "draw" })])
    // When the agent sets the view
    const res = await dispatchTool(
      "set_cell_dimensions",
      {
        buffer_id: 1,
        cell_id: "c",
        editor_height: null,
        result_height: null,
        view: "editor_result",
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the response and the cell carry the new view
    expect(JSON.parse(res.content)).toEqual({
      view: "editor_result",
      mode: "draw",
    })
    expect(cellById(state, "c")?.paneView).toBe("editor_result")
  })

  it("set_cell_dimensions rejects malformed height strings at runtime", async () => {
    // Given a plain SQL cell
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    // When the agent sends a malformed editor height
    const res = await dispatchTool(
      "set_cell_dimensions",
      {
        buffer_id: 1,
        cell_id: "c",
        editor_height: "bogus",
        result_height: null,
        view: null,
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the tool errors and the cell is untouched
    expect(res.is_error).toBe(true)
    expect(res.content).toContain(
      "editor_height must be a number, auto, or null",
    )
    expect(cellById(state, "c")?.topHeight).toBeUndefined()
  })

  it("set_cell_layout returns the stored view with the new position", async () => {
    // Given a grid notebook with a laid-out draw cell
    const { state } = mountLive(
      1,
      [
        cell("c", "SELECT 1", {
          mode: "draw",
          paneView: "editor_result",
        }),
      ],
      {
        settings: {
          layoutMode: "grid",
          layout: [{ i: "c", x: 0, y: 0, w: 6, h: 10 }],
        },
      },
    )
    // When the agent narrows the cell
    const res = await dispatchTool(
      "set_cell_layout",
      { buffer_id: 1, cell_id: "c", x: 0, y: 0, w: 4 },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the response carries the new grid and the stored view
    expect(JSON.parse(res.content)).toEqual({
      grid: { x: 0, y: 0, w: 4 },
      view: "editor_result",
      mode: "draw",
    })
    expect(state.parts.settings.layout?.[0].w).toBe(4)
  })

  it("apply_notebook_state never synthesizes auto_refresh for draw cells", async () => {
    // Given a notebook with no auto-refresh default
    const { state } = mountLive(1, [cell("a", "SELECT 1")])

    // When an apply composes a chart without a per-cell auto_refresh
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          { id: "a", preserve_value: true },
          {
            value: "SELECT ts, price FROM trades",
            mode: "draw",
            chart_config: {
              x_column: "ts",
              queries: [{ type: "line", y_columns: ["price"] }],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then no cell stores a per-cell value — both inherit
    const chart = state.parts.cells.find((c) => c.mode === "draw")
    expect(chart?.autoRefresh).toBeUndefined()
    expect(cellById(state, "a")?.autoRefresh).toBeUndefined()
  })

  it("apply_notebook_state stores auto_refresh_default alongside cells", async () => {
    // Given a notebook with no auto-refresh default
    const { state } = mountLive(1, [cell("a", "SELECT 1")])

    // When the apply carries auto_refresh_default alongside a draw cell
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        auto_refresh_default: "30s",
        cells: [
          { id: "a", preserve_value: true },
          {
            value: "SELECT ts, price FROM trades",
            mode: "draw",
            chart_config: {
              x_column: "ts",
              queries: [{ type: "line", y_columns: ["price"] }],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the default lands and the chart inherits it
    const chart = state.parts.cells.find((c) => c.mode === "draw")
    expect(chart?.autoRefresh).toBeUndefined()
    expect(state.parts.settings.autoRefreshDefault).toBe("30s")
  })

  it("set_cell_highlight_config stores one config for the cell", async () => {
    // Given a run cell with two statements
    const { state } = mountLive(1, [cell("c", "SELECT 1; SELECT 2")])

    // When the cell gets an up/down pair
    const result = await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: ["symbol"],
          rules: [
            { kind: "previous", column: "price", op: "gt", color: "green" },
            { kind: "previous", column: "price", op: "lt", color: "red" },
          ],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the cell carries the rules, typed and with ids
    expect(result.is_error).toBeFalsy()
    const config = cellById(state, "c")?.highlightConfig
    expect(config).toMatchObject({
      identityColumns: ["symbol"],
      rules: [
        {
          kind: "previous",
          condition: { op: "gt" },
          color: "dataPositive",
          display: "temporary",
        },
        { kind: "previous", condition: { op: "lt" }, color: "dataNegative" },
      ],
    })
    expect(config?.rules[0].id).toBeTruthy()
  })

  it("set_cell_highlight_config saves a regex literal as plain RE2 and tells the agent", async () => {
    // Given a run cell
    const { state } = mountLive(1, [cell("c", "SELECT sym FROM t")])

    // When a matches rule arrives written like a JavaScript regex literal
    const result = await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: [],
          rules: [
            { kind: "value", column: "sym", op: "matches", text: "/eur/i" },
          ],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the rule is saved as typed, and the result notes how it reads
    expect(result.is_error).toBeFalsy()
    expect(cellById(state, "c")?.highlightConfig?.rules[0]).toMatchObject({
      condition: { op: "matches", pattern: "/eur/i" },
    })
    const { notes } = JSON.parse(result.content) as { notes: string[] }
    const [note] = notes
    expect(note).toContain("plain RE2")
    expect(note).toContain("(?i)eur")
  })

  it("set_cell_highlight_config clears with null and accepts an empty identity", async () => {
    // Given a cell with a value rule and no identity
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: [],
          rules: [{ kind: "value", column: "v", op: "gt", value: 10 }],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    expect(cellById(state, "c")?.highlightConfig).toBeDefined()

    // When cleared with null, then the field is gone
    await dispatchTool(
      "set_cell_highlight_config",
      { buffer_id: 1, cell_id: "c", highlight_config: null },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    expect(cellById(state, "c")?.highlightConfig).toBeUndefined()
  })

  it("set_cell_highlight_config rejects an invalid rule without touching the cell", async () => {
    // Given a cell and a rule with a bad color
    const { state } = mountLive(1, [cell("c", "SELECT 1")])

    // When dispatched
    const result = await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: ["k"],
          rules: [
            { kind: "previous", column: "v", op: "gt", color: "hotpink" },
          ],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then it is a validation error and the cell has no rules
    expect(result.is_error).toBe(true)
    expect(JSON.parse(result.content)).toMatchObject({
      error_code: "validation",
    })
    expect(cellById(state, "c")?.highlightConfig).toBeUndefined()
  })

  it("set_cell_highlight_config rejects a condition that does not fit a column the cell has shown", async () => {
    // Given a cell whose result shows a SYMBOL column
    const { state } = mountLive(1, [
      cell("c", "SELECT sym FROM t", {
        result: {
          results: [
            {
              type: "dql",
              query: "SELECT sym FROM t",
              columns: [{ name: "sym", type: "SYMBOL" }],
              dataset: [],
              count: 0,
            },
          ],
          activeResultIndex: 0,
          timestamp: 0,
        },
      }),
    ])

    // When a numeric comparison is sent for that column
    const result = await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: ["sym"],
          rules: [{ kind: "value", column: "sym", op: "gt", value: "abc" }],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then it is a validation error that names the column type, and the cell has no rules
    expect(result.is_error).toBe(true)
    expect(JSON.parse(result.content)).toMatchObject({
      error_code: "validation",
    })
    expect(result.content).toContain("Not for a text column")
    expect(cellById(state, "c")?.highlightConfig).toBeUndefined()
  })

  it("set_cell_highlight_config checks a released cell against the columns its snapshot shows", async () => {
    // Given a cell whose result was released, with a snapshot that shows a DOUBLE column
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "c",
      results: [
        {
          type: "dql",
          query: "SELECT price FROM t",
          columns: [{ name: "price", type: "DOUBLE" }],
          dataset: [],
          count: 0,
        },
      ],
      savedAt: 100,
      activeResultIndex: 0,
    })
    const { state } = mountLive(1, [
      cell("c", "SELECT price FROM t", { lastRunStatus: "success" }),
    ])

    // When a text condition is sent for that column
    const result = await dispatchTool(
      "set_cell_highlight_config",
      {
        buffer_id: 1,
        cell_id: "c",
        highlight_config: {
          identity_columns: [],
          rules: [
            { kind: "value", column: "price", op: "contains", text: "1" },
          ],
        },
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then it is rejected as it would be for the cell in memory
    expect(result.is_error).toBe(true)
    expect(result.content).toContain("Not for a numeric column")
    expect(cellById(state, "c")?.highlightConfig).toBeUndefined()
  })

  it("apply_notebook_state checks a released cell against its snapshot only while its SQL still matches", async () => {
    // Given two released cells with the same snapshot of a SYMBOL column, one since edited
    const snapshotOf = (cellId: string) =>
      saveCellSnapshot({
        bufferId: 1,
        cellId,
        results: [
          {
            type: "dql",
            query: "SELECT sym AS price FROM t",
            columns: [{ name: "price", type: "SYMBOL" }],
            dataset: [],
            count: 0,
          },
        ],
        savedAt: 100,
        activeResultIndex: 0,
      })
    await snapshotOf("kept")
    await snapshotOf("edited")
    const { state } = mountLive(1, [
      cell("kept", "SELECT sym AS price FROM t"),
      cell("edited", "SELECT 7 AS price"),
    ])
    const numericRule = {
      identity_columns: [],
      rules: [{ kind: "value", column: "price", op: "gt", value: 5 }],
    }

    // When a numeric rule is sent for each cell with its SQL kept
    const kept = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          { id: "kept", preserve_value: true, highlight_config: numericRule },
          { id: "edited", preserve_value: true },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    const edited = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          { id: "kept", preserve_value: true },
          { id: "edited", preserve_value: true, highlight_config: numericRule },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the matching snapshot rejects the rule, and the stale one does not apply
    expect(kept.is_error).toBe(true)
    expect(kept.content).toContain("Not for a text column")
    expect(edited.is_error).toBeFalsy()
    expect(cellById(state, "edited")?.highlightConfig?.rules).toHaveLength(1)
  })

  it("apply_notebook_state checks rules loosely for a cell whose SQL it rewrites", async () => {
    // Given two cells whose shown results have a SYMBOL column named price
    const shown = {
      results: [
        {
          type: "dql" as const,
          query: "SELECT sym AS price FROM t",
          columns: [{ name: "price", type: "SYMBOL" }],
          dataset: [],
          count: 0,
        },
      ],
      activeResultIndex: 0,
      timestamp: 0,
    }
    const { state } = mountLive(1, [
      cell("c", "SELECT sym AS price FROM t", { result: shown }),
      cell("d", "SELECT sym AS price FROM t", { result: shown }),
    ])
    const numericRule = {
      identity_columns: ["price"],
      rules: [{ kind: "value", column: "price", op: "gt", value: 5 }],
    }

    // When a numeric rule comes with new SQL for one cell, and with the SQL kept for the other
    const rewritten = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          {
            id: "c",
            value: "SELECT 7 AS price",
            highlight_config: numericRule,
          },
          { id: "d", preserve_value: true },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    const kept = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          { id: "c", preserve_value: true },
          { id: "d", preserve_value: true, highlight_config: numericRule },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the rewritten cell takes the rule, and the kept one is checked against its shown column
    expect(rewritten.is_error).toBeFalsy()
    expect(cellById(state, "c")?.highlightConfig?.rules).toHaveLength(1)
    expect(kept.is_error).toBe(true)
    expect(kept.content).toContain("Not for a text column")
    expect(cellById(state, "d")?.highlightConfig).toBeUndefined()
  })

  it("apply_notebook_state sets highlight_config and clears when omitted", async () => {
    // Given a notebook with one cell
    const { state } = mountLive(1, [cell("a", "SELECT 1")])

    // When an apply sends a gradient-filled between rule
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          {
            id: "a",
            value: "SELECT 1; SELECT 2",
            highlight_config: {
              identity_columns: ["k"],
              rules: [
                {
                  kind: "value",
                  column: null,
                  op: "between",
                  value: 0,
                  to: 100,
                  fill: "gradient",
                },
              ],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the cell holds the rule
    expect(cellById(state, "a")?.highlightConfig?.rules[0]).toMatchObject({
      kind: "value",
      target: { kind: "allNumeric" },
      condition: {
        op: "between",
        from: 0,
        to: 100,
        fill: { kind: "gradient", highColor: "dataPositive" },
      },
    })

    // When the next apply omits highlight_config, then the rules are cleared
    await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ id: "a", preserve_value: true }] },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    expect(cellById(state, "a")?.highlightConfig).toBeUndefined()
  })

  it("apply_notebook_state rejects an invalid highlight_config and leaves the cell untouched", async () => {
    // Given a one-statement cell
    const { state } = mountLive(1, [cell("a", "SELECT 1")])

    // When a rule with an unknown op is sent
    const result = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          {
            id: "a",
            value: "SELECT 1",
            highlight_config: {
              identity_columns: ["k"],
              rules: [{ kind: "value", column: "v", op: "changed" }],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the apply fails and the cell is untouched
    expect(result.is_error).toBe(true)
    expect(result.content).toContain("highlight_config")
    expect(cellById(state, "a")?.highlightConfig).toBeUndefined()
  })

  it("apply preserves supplied highlights while discarding results and reports regex notes", async () => {
    const { state, runCell } = mountLive(1, [
      cell("a", "SELECT sym FROM t", {
        result: {
          results: [
            {
              type: "dql",
              query: "SELECT sym FROM t",
              columns: [{ name: "sym", type: "SYMBOL" }],
              dataset: [["eur"]],
              count: 1,
            },
          ],
          activeResultIndex: 0,
          timestamp: 1,
        },
      }),
    ])
    const result = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [
          {
            id: "a",
            preserve_value: true,
            view: "editor",
            highlight_config: {
              identity_columns: [],
              rules: [
                { kind: "value", column: "sym", op: "matches", text: "/eur/i" },
              ],
            },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    expect(result.is_error).toBeFalsy()
    expect(JSON.parse(result.content)).toMatchObject({
      results_cleared: ["a"],
      notes: [expect.stringContaining("cells[0].highlight_config")],
    })
    expect(cellById(state, "a")?.result).toBeUndefined()
    expect(cellById(state, "a")?.highlightConfig?.rules).toHaveLength(1)
    expect(runCell).not.toHaveBeenCalled()
  })

  it.each(["set_cell_highlight_config", "apply_notebook_state"])(
    "%s rejects highlight rules on markdown without mutating it",
    async (tool) => {
      const { state } = mountLive(1, [
        cell("m", "# Notes", { type: "markdown" }),
      ])
      const before = state.parts
      const highlight_config = { identity_columns: [], rules: [] }
      const input =
        tool === "set_cell_highlight_config"
          ? { buffer_id: 1, cell_id: "m", highlight_config }
          : {
              buffer_id: 1,
              cells: [{ id: "m", preserve_value: true, highlight_config }],
            }
      const result = await dispatchTool(
        tool,
        input,
        makeClient(),
        noopStatus,
        ALL_GRANTED,
        dqlValidator,
      )
      expect(result.is_error).toBe(true)
      expect(JSON.parse(result.content)).toMatchObject({
        error_code: "validation",
      })
      expect(state.parts).toBe(before)
    },
  )

  it("set_cell_name sets the cell name", async () => {
    // Given an unnamed cell
    const { state } = mountLive(1, [cell("c")])
    // When the agent names it
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "BTC price" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the name is stored
    expect(cellById(state, "c")?.name).toBe("BTC price")
  })

  it("set_cell_name clears the name when passed null", async () => {
    // Given a named cell
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "old" })])
    // When the agent passes null
    await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: null },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the name is cleared
    expect(cellById(state, "c")?.name).toBeUndefined()
  })

  it("set_cell_name rejects a name over the length limit", async () => {
    // Given a named cell
    const { state } = mountLive(1, [cell("c", "SELECT 1", { name: "orig" })])
    // When the agent sends an over-long name
    const res = await dispatchTool(
      "set_cell_name",
      { buffer_id: 1, cell_id: "c", name: "a".repeat(101) },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the tool errors and the old name stays
    expect(res.is_error).toBe(true)
    expect(cellById(state, "c")?.name).toBe("orig")
  })

  it("run_query flags a transport-dropped error as unverified, a server error as not", async () => {
    // Given a client whose query fails on transport
    const transport = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.resolve({
          type: "error" as const,
          error: "QuestDB is not reachable [504]",
        }),
      ),
    })
    // When run_query is dispatched
    const t = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "INSERT INTO t VALUES(1)" },
      transport,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the outcome is unverified
    expect((JSON.parse(t.content) as { unverified?: boolean }).unverified).toBe(
      true,
    )

    // Given a client whose query fails on the server
    const serverErr = makeClient({
      runQueryRaw: vi.fn(() =>
        Promise.resolve({
          type: "error" as const,
          error: "table does not exist [table=t]",
        }),
      ),
    })
    // When run_query is dispatched
    const s = await dispatchTool(
      "run_query",
      { buffer_id: 1, sql: "SELECT * FROM t" },
      serverErr,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the outcome is not unverified
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
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
    // Given a plain SQL cell
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    // When the agent supplies only a query type
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [{ type: "bar" }] },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the query maps without x/name defaults
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([
      { type: "bar", yColumns: [] },
    ])
  })

  it("applies explicit ohlc for candlestick", async () => {
    // Given a plain SQL cell
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    // When the agent supplies explicit ohlc columns
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the candlestick keeps them
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
    // Given a candlestick config without ohlc
    const client = makeClient()
    // When the agent applies it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected as a validation error
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
  })

  it("treats null fields on set_cell_chart_config as 'omit' (not overwrite)", async () => {
    // Strict tool schemas (OpenAI Structured Outputs) require every property
    // in `required`; optional-ness is expressed via nullable types. The
    // handler must treat null as "leave the cell's current value alone".
    // Given a plain SQL cell
    const { state } = mountLive(1, [cell("c", "SELECT 1")])
    // When every optional field arrives as null
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the nulls are omitted, not written
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([
      { type: "line", yColumns: [] },
    ])
  })

  it("rejects a candlestick query with no ohlc (y_columns of a non-ohlc length)", async () => {
    // Given a candlestick config whose y_columns are not ohlc-shaped
    const client = makeClient()
    // When the agent applies it
    const res = await dispatchTool(
      "set_cell_chart_config",
      {
        buffer_id: 1,
        cell_id: "c",
        queries: [{ type: "candlestick", y_columns: ["a", "b"] }],
      },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected as a validation error
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
  })

  const twoStatementCell = () =>
    mountLive(1, [cell("c", "SELECT a FROM t; SELECT b FROM t")])

  it("rejects a non-empty queries array whose length != the cell's statement count", async () => {
    // Given a two-statement cell
    twoStatementCell()
    // When the agent sends one query config
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected as a validation error
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
  })

  it("applies a queries array that matches the cell's statement count", async () => {
    // Given a two-statement cell
    const { state } = twoStatementCell()
    // When the agent sends one config per statement
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then both configs land
    expect(cellById(state, "c")?.chartConfig?.queries).toMatchObject([
      { type: "line", yColumns: ["a"] },
      { type: "bar", yColumns: ["b"] },
    ])
  })

  it("allows queries:[] (reset to inference) regardless of statement count", async () => {
    // Given a two-statement cell
    const { state } = twoStatementCell()
    // When the agent sends an empty queries array
    await dispatchTool(
      "set_cell_chart_config",
      { buffer_id: 1, cell_id: "c", queries: [] },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell resets to inference
    expect(cellById(state, "c")?.chartConfig?.queries).toEqual([])
  })

  it("preserves a null queries entry (infer this statement) instead of crashing", async () => {
    // Given a two-statement cell
    const { state } = twoStatementCell()
    // When one entry is null
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the null entry is preserved
    expect(cellById(state, "c")?.chartConfig?.queries).toMatchObject([
      null,
      { type: "bar", yColumns: ["b"] },
    ])
  })

  it("apply_notebook_state translates snake_case wire shape to camelCase state", async () => {
    // Given a notebook with cells b and c
    const { state } = mountLive(1, [cell("b", "old"), cell("c", "old")])
    // When the agent applies a snake_case chart cell in grid layout
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
            view: "result",
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
            grid: { x: 0, y: 0, w: 6 },
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the state is camelCase and the omitted cell is deleted
    expect(res.is_error).toBeUndefined()
    // The applied cell carries every field in camelCase; c (omitted) is deleted.
    expect(cellIds(state)).toEqual(["b"])
    expect(cellById(state, "b")).toMatchObject({
      name: "Trades",
      value: "SELECT 1",
      mode: "draw",
      autoRefresh: "5s",
      paneView: "result",
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

  it("apply_notebook_state stores auto_refresh_default, including Off; null preserves", async () => {
    // Given a notebook without a default
    const { state } = mountLive(1, [cell("a", "SELECT 1")])
    // When an apply sets the default to Off — false must survive as a value
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        auto_refresh_default: false,
        cells: [{ id: "a", preserve_value: true }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    expect(state.parts.settings.autoRefreshDefault).toBe(false)
    // When a later apply passes null
    await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        auto_refresh_default: null,
        cells: [{ id: "a", preserve_value: true }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the stored default survives
    expect(state.parts.settings.autoRefreshDefault).toBe(false)
  })

  it("apply_notebook_state rejects an invalid auto_refresh_default before mutating", async () => {
    // Given a notebook with one cell
    const { state } = mountLive(1, [cell("a", "SELECT 1")])
    // When the apply carries an invalid default and a new cell
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        auto_refresh_default: "2s",
        cells: [{ value: "SELECT 2" }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the tool errors and nothing committed
    expect(res.is_error).toBe(true)
    expect((JSON.parse(res.content) as { message: string }).message).toContain(
      "auto_refresh_default",
    )
    expect(cellById(state, "a")?.value).toBe("SELECT 1")
    expect(state.parts.settings.autoRefreshDefault).toBeUndefined()
  })

  it("apply_notebook_state rejects an invalid per-cell auto_refresh instead of wiping the override", async () => {
    // Given a cell the user set to Off
    const { state } = mountLive(1, [
      cell("a", "SELECT 1", { autoRefresh: false }),
    ])
    // When the apply carries a typo for that cell's auto_refresh
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        cells: [{ id: "a", preserve_value: true, auto_refresh: "2sec" }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the typo errors instead of silently deleting the override
    expect(res.is_error).toBe(true)
    expect((JSON.parse(res.content) as { message: string }).message).toContain(
      "cells[0].auto_refresh",
    )
    expect(cellById(state, "a")?.autoRefresh).toBe(false)
  })

  it("apply_notebook_state applies ordered variables; null preserves, [] clears", async () => {
    // Given two ordered variables
    const variables = [
      { name: "x", value: "10" },
      { name: "from_ts", value: "dateadd('d', -7, now())" },
    ]
    // Ordered variables are written to settings.
    const a = mountLive(1)
    // When an apply sends them
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then they are written to settings
    expect(a.state.parts.settings.variables).toEqual(variables)

    // null preserves the notebook's existing variables.
    const b = mountLive(1, [], {
      settings: { variables: [{ name: "keep", value: "1" }] },
    })
    // When an apply sends null
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the existing variables survive
    expect(b.state.parts.settings.variables).toEqual([
      { name: "keep", value: "1" },
    ])

    // [] clears them.
    const c = mountLive(1, [], {
      settings: { variables: [{ name: "gone", value: "1" }] },
    })
    // When an apply sends an empty list
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the variables are cleared
    expect(c.state.parts.settings.variables).toEqual([])
  })

  it("apply_notebook_state rejects invalid variable names with a VALIDATION_ERROR", async () => {
    // Given a variable with an invalid name
    const client = makeClient()
    // When the agent applies it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected as a validation error
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code: string }
    expect(parsed.error_code).toBe("validation")
  })

  it("apply_notebook_state rejects invalid variable values via QuestDB validation", async () => {
    for (const value of ["", "select", "(1,2,3)"]) {
      // Given a validator that rejects the variable value
      const client = makeClient()
      const validateSql = vi.fn(() =>
        Promise.resolve({
          query: "DECLARE @x := bad SELECT 1",
          position: 14,
          error: "bad variable value",
        }),
      )
      // When the agent applies it
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
        ALL_GRANTED,
        validateSql,
      )
      // Then it is rejected as a validation error
      expect(res.is_error).toBe(true)
      const parsed = JSON.parse(res.content) as { error_code: string }
      expect(parsed.error_code).toBe("validation")
    }
  })

  it("apply_notebook_state rejects multi-assignment value injection before validateSql", async () => {
    // Given a value that smuggles a second assignment
    const client = makeClient()
    const validateSql = vi.fn()
    // When the agent applies it
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
      ALL_GRANTED,
      validateSql,
    )
    // Then the shape check rejects it before any validation call
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
    // Given a validator that accepts every prefix
    const client = makeClient()
    const validateSql = vi.fn(() =>
      Promise.resolve({
        query: "SELECT 1",
        columns: [{ name: "1", type: "INT" }],
        timestamp: 0,
      }),
    )
    // When the agent applies two dependent variables
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
      ALL_GRANTED,
      validateSql,
    )
    // Then each prefix is validated in order
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
    // Given a user edit that lands while validation awaits
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
    // When the agent applies a variable
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        variables: [{ name: "base", value: "10" }],
        cells: [{ value: "SELECT @base" }],
      },
      client,
      noopStatus,
      ALL_GRANTED,
      validateSql,
    )
    // Then the apply is rejected as stale
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("apply_notebook_state rejects STATE_STALE on a user edit since the read baseline (in-app generation window)", async () => {
    // Given a user action after the agent's read baseline
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "x" })
    const toolContext = {
      notebookFreshness: createNotebookFreshness([[1, readSeq]]),
    }
    // When the agent applies against that baseline
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
      undefined,
      toolContext,
    )
    // Then the apply is rejected as stale
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
      mutateWithResultStatus: (transition) =>
        controller.mutate((parts) => transition(parts, () => "unrequested")),
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
      ALL_GRANTED,
      dqlValidator,
      abort.signal,
    )

    // Then it is not reported as a failure: the commit is acknowledged and the
    // aborted post-apply phase is flagged, so a retry is never ambiguous.
    expect(res.is_error).toBeFalsy()
    const parsed = JSON.parse(res.content) as {
      state_applied?: boolean
      post_apply_aborted?: boolean
      results_cleared?: string[]
    }
    expect(parsed.state_applied).toBe(true)
    expect(parsed.post_apply_aborted).toBe(true)
    expect(parsed.results_cleared).toEqual([])
    // The mutation really committed.
    expect(state.parts.cells[0].value).toBe("SELECT 1")
  })

  it("update_cell rejects STATE_STALE when the user edited since the read baseline", async () => {
    // Given a user edit after the agent's read baseline
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    signalUserEdit(1)
    // When the agent updates a cell against that baseline
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
      undefined,
      { notebookFreshness: createNotebookFreshness([[1, readSeq]]) },
    )
    // Then the update is rejected as stale
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
      undefined,
      toolContext,
    )
    const retry = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
      undefined,
      toolContext,
    )
    // Then a mutating tool on the new buffer passes the baseline gate
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
      undefined,
      toolContext,
    )
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
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
      ALL_GRANTED,
      dqlValidator,
      undefined,
      { notebookFreshness: createNotebookFreshness() },
    )
    // Then it is rejected before any executor runs
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("invalid_buffer_id")
  })

  it("apply_notebook_state rejects after a user auto-refresh/maximize/spotlight toggle (signalUserEdit) since the read baseline", async () => {
    // Given a user toggle after the agent's read baseline
    const client = makeClient()
    const readSeq = getBufferActionSeq(1)
    // handleAutoRefreshChange / handleChartMaximizedChange / the spotlight toggle
    // all call signalUserEdit(1); the agent's stale full-state apply must reject.
    signalUserEdit(1)
    // When the agent applies against that baseline
    const res = await dispatchTool(
      "apply_notebook_state",
      { buffer_id: 1, cells: [{ value: "SELECT 1" }] },
      client,
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
      undefined,
      { notebookFreshness: createNotebookFreshness([[1, readSeq]]) },
    )
    // Then the apply is rejected as stale
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("update_cell rejects STATE_STALE when the user edits during validation", async () => {
    // Given a user edit racing the agent's cell read
    live = mountLive(1, [cell("c")], { onRead: () => signalUserEdit(1) })
    const client = makeClient()
    const validateSql = vi.fn(() =>
      Promise.resolve({ query: "", columns: [], timestamp: 0 }),
    )
    // When the agent updates the cell
    const res = await dispatchTool(
      "update_cell",
      { buffer_id: 1, cell_id: "c", value: "SELECT 2" },
      client,
      noopStatus,
      ALL_GRANTED,
      validateSql,
    )
    // Then the update is rejected as stale
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as { error_code?: string }
    expect(parsed.error_code).toBe("stale")
  })

  it("apply_notebook_state rejects a candlestick query with no ohlc (never derived from y_columns)", async () => {
    // Given an empty notebook
    const { state } = mountLive(1)
    // When the apply carries a candlestick without ohlc
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
            view: null,
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the apply is rejected
    // ohlc is never fabricated from y_columns — the candlestick is rejected
    // outright, and nothing is committed.
    expect(res.is_error).toBe(true)
    expect(state.parts.cells).toHaveLength(0)
  })

  it("apply_notebook_state surfaces an invalid request as VALIDATION_ERROR", async () => {
    // A supplied id that does not exist is rejected wholesale (never created,
    // which would silently drop omitted cells).
    // Given an empty notebook
    mountLive(1)
    // When the apply references an unknown cell id
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
            view: null,
            chart_config: null,
            grid: null,
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected as a validation error
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("validation")
    expect(parsed.message).toMatch(/VALIDATION_ERROR/)
  })

  it("set_cell_maximized allows null to clear the spotlight", async () => {
    // Given a spotlighted cell
    const { state } = mountLive(1, [cell("c")], { maximizedCellId: "c" })
    // When the agent passes null
    await dispatchTool(
      "set_cell_maximized",
      { buffer_id: 1, cell_id: null },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the spotlight is cleared
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

  it("set_cell_mode rejects a markdown cell without validating its prose as SQL", async () => {
    // Given a markdown cell whose source reads like a query
    const { state } = mountLive(1, [
      cell("m", "SELECT 1", { type: "markdown" }),
    ])
    const validateSql = vi.fn()
    // When the agent asks for draw mode
    const res = await dispatchTool(
      "set_cell_mode",
      { buffer_id: 1, cell_id: "m", mode: "draw" },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      validateSql,
    )
    // Then the typed validation error comes back and no SQL check ran
    expect(res.is_error).toBe(true)
    expect(JSON.parse(res.content)).toMatchObject({ error_code: "validation" })
    expect(validateSql).not.toHaveBeenCalled()
    expect(cellById(state, "m")?.mode).toBeUndefined()
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
    // Given an empty notebook and full write permission
    mountLive(1)
    // When the apply draws a write query
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
            view: null,
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
    // Then the draw invariant denies it
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
    // The exact authorization-checked SQL is threaded to execution, with the
    // permission gate the runner's barrier enforces.
    expect(runCell).toHaveBeenCalledWith("c", undefined, "SELECT 1", {
      kind: "explicit",
      permissions: { grantSchemaAccess: false, read: false, write: false },
    })
  })

  it("run_cell executes the checked SQL, not a value swapped in during the validate round-trip", async () => {
    // Simulate a concurrent ungated update_cell landing while run_cell awaits
    // the /sql/validate round-trip: the live cell value flips to a write
    // between classification and execution.
    const state0: { swap?: () => void } = {}
    const validateSql = vi.fn((sql: string) => {
      state0.swap?.()
      return Promise.resolve({
        query: sql,
        columns: [{ name: "c1", type: "LONG" }],
        timestamp: -1,
      })
    })
    // A run-mode cell starts at a read query the gate will allow.
    const { state, runCell } = mountLive(1, [cell("c", "SELECT 1")], {
      validate: validateSql,
    })
    state0.swap = () => {
      state.parts = {
        ...state.parts,
        cells: [cell("c", "DROP TABLE t")],
      }
    }
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
    // ...but the runner was handed the checked SELECT, never the DROP — its
    // barrier classifies and executes that exact string.
    expect(runCell).toHaveBeenCalledWith("c", undefined, "SELECT 1", {
      kind: "explicit",
      permissions: { grantSchemaAccess: false, read: true, write: false },
    })
  })

  it("run_cell pins the SQL it read and gates the launch explicitly", async () => {
    // Given a SELECT cell
    const { runCell } = mountLive(1, [cell("c", "SELECT 1")])
    // When the agent runs it
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the runner receives the read SQL under an explicit gate
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith("c", undefined, "SELECT 1", {
      kind: "explicit",
      permissions: ALL_GRANTED,
    })
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
    const validate = vi.fn().mockResolvedValue({ queryType: "INSERT" })
    const { state, runCell } = mountLive(1, [], { validate })
    const res = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      validate,
    )
    expect(res.is_error).toBeFalsy()
    expect(cellById(state, cellIds(state)[0])?.value).toBe(
      "INSERT INTO t VALUES (1)",
    )
    // The runner's barrier decides the skip — dispatch hands it the gate.
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      "INSERT INTO t VALUES (1)",
      { kind: "autoRun" },
    )
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

  // SAFETY PRECONDITION — "agent flows never auto-run DDL/DML". The gate is
  // threaded ONLY inside `if (perms && validateSql)`, so it protects the flow
  // because every production call site threads BOTH args (anthropicProvider,
  // openaiProvider, openaiChatCompletionsProvider, dispatchMCPTool). This pins
  // both halves so a caller that drops the gate args — or a refactor of that
  // condition — fails loudly here instead of silently auto-running a write.
  it("add_cell run:true always passes the autoRun gate, so a write is skipped", async () => {
    // Given a validator that classifies the SQL as a write
    const validate = vi.fn().mockResolvedValue({ queryType: "INSERT" })
    const gate = mountLive(1, [], { runCell: okRun, validate })
    // When the agent adds the write and asks to run it
    const gated = await dispatchTool(
      "add_cell",
      { buffer_id: 1, sql: "INSERT INTO t VALUES (1)", run: true },
      makeClient(),
      noopStatus,
      { grantSchemaAccess: true, read: true, write: true },
      validate,
    )
    // Then the runner is handed the auto-run gate and skips the write
    expect(gate.runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      "INSERT INTO t VALUES (1)",
      { kind: "autoRun" },
    )
    expect(JSON.parse(gated.content)).toMatchObject({
      ran: false,
      skipped: true,
    })
  })
})

describe("dispatchTool — apply_notebook_state auto-run", () => {
  const dqlValidate = vi.fn().mockResolvedValue({
    query: "SELECT 1",
    columns: [{ name: "c1", type: "LONG" }],
    timestamp: -1,
  })

  it("runs new cells with mode='run' (explicit) after apply", async () => {
    // Given an empty notebook
    const { runCell } = mountLive(1, [], { runCell: okRun })
    // When the apply adds an explicit run-mode cell
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell auto-runs and its outcome is reported
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.any(String),
      { kind: "autoRun" },
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
    // Given an empty notebook
    const { runCell } = mountLive(1, [], { runCell: okRun })
    // When the apply adds a cell without a mode
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the cell auto-runs
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.any(String),
      { kind: "autoRun" },
    )
  })

  it.each(["run", "draw"] as const)(
    "rejects mode='%s' with authoritative view='editor' before mutating",
    async (mode) => {
      // Given a run cell holding a result
      const originalResult = {
        results: [] as SingleQueryResult[],
        activeResultIndex: 0,
        timestamp: 1,
      }
      const { state, runCell } = mountLive(1, [
        cell("cell-1", "SELECT 1", {
          result: originalResult,
          lastRunStatus: "success",
          paneView: "result",
        }),
      ])

      // When the apply pairs an explicit mode with view='editor'
      const res = await dispatchTool(
        "apply_notebook_state",
        {
          buffer_id: 1,
          layout_mode: null,
          maximized_cell_id: null,
          cells: [
            {
              id: "cell-1",
              preserve_value: true,
              mode,
              view: "editor",
            },
          ],
        },
        makeClient(),
        noopStatus,
        ALL_GRANTED,
        dqlValidator,
      )

      // Then the request is rejected and nothing changes or runs
      expect(res.is_error).toBe(true)
      expect(JSON.parse(res.content)).toMatchObject({
        error_code: "validation",
      })
      expect(res.content).toMatch(/view.*editor.*explicit mode/)
      expect(cellById(state, "cell-1")).toMatchObject({
        result: originalResult,
        lastRunStatus: "success",
        paneView: "result",
      })
      expect(runCell).not.toHaveBeenCalled()
    },
  )

  it("lets authoritative view='editor' clear a preserved draw mode without chart config", async () => {
    // Given a draw cell with a result and a chart config
    const { state, runCell } = mountLive(
      1,
      [
        cell("cell-1", "SELECT 1", {
          mode: "draw",
          result: {
            results: [],
            activeResultIndex: 0,
            timestamp: 1,
          },
          lastRunStatus: "success",
          paneView: "result",
          chartConfig: {
            xColumn: "ts",
            queries: [{ type: "line", yColumns: ["value"] }],
          },
        }),
      ],
      { runCell: okRun },
    )

    // When the apply preserves it with view='editor' and no mode
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [
          {
            id: "cell-1",
            preserve_value: true,
            mode: null,
            view: "editor",
          },
        ],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the cell returns to run mode with its result and chart cleared
    expect(res.is_error).toBeFalsy()
    expect(JSON.parse(res.content)).toMatchObject({
      results_cleared: ["cell-1"],
      runs: [],
    })
    expect(cellById(state, "cell-1")?.mode).toBeUndefined()
    expect(cellById(state, "cell-1")?.result).toBeUndefined()
    expect(cellById(state, "cell-1")?.lastRunStatus).toBeUndefined()
    expect(cellById(state, "cell-1")?.chartConfig).toBeUndefined()
    expect(runCell).not.toHaveBeenCalled()
  })

  it("does not re-run a run-mode SQL cell whose view='editor' discarded its result", async () => {
    // Given a run-mode SQL cell that already holds a result
    const { state, runCell } = mountLive(
      1,
      [
        cell("cell-1", "SELECT 1", {
          result: { results: [], activeResultIndex: 0, timestamp: 1 },
          lastRunStatus: "success",
          paneView: "result",
        }),
      ],
      { runCell: okRun },
    )

    // When the apply preserves it with view='editor' and no mode
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "cell-1", preserve_value: true, view: "editor" }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the discarded result is reported and the SQL is not run again
    expect(res.is_error).toBeFalsy()
    expect(JSON.parse(res.content)).toMatchObject({
      results_cleared: ["cell-1"],
      runs: [],
    })
    expect(cellById(state, "cell-1")?.result).toBeUndefined()
    expect(runCell).not.toHaveBeenCalled()
  })

  it("skips cells whose resolved mode is 'draw'", async () => {
    // Given an empty notebook
    const { runCell } = mountLive(1, [], { runCell: okRun })
    // When the apply adds a draw cell
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then nothing auto-runs
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
      ALL_GRANTED,
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
      ALL_GRANTED,
      validateSql,
    )
    // Then the draw invariant denies the whole apply before anything commits
    expect(res.is_error).toBe(true)
  })

  it("skips cells with empty SQL", async () => {
    // Given an empty notebook
    const { runCell } = mountLive(1, [], { runCell: okRun })
    // When the apply adds a blank run cell
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then nothing auto-runs
    expect(runCell).not.toHaveBeenCalled()
  })

  it("skips DDL/DML run cells regardless of the write permission", async () => {
    const validate = vi.fn().mockResolvedValue({ queryType: "DROP TABLE" })
    const { runCell } = mountLive(1, [], { runCell: okRun, validate })
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
      validate,
    )
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      "DROP TABLE victim",
      { kind: "autoRun" },
    )
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
    // Given an existing write cell
    const validate = vi.fn().mockResolvedValue({ queryType: "INSERT" })
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)")],
      { runCell: okRun, validate },
    )
    // When the apply restates it
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
      validate,
    )
    // Then the runner's auto-run gate skips it
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(
      "ins-1",
      undefined,
      "INSERT INTO t VALUES (1)",
      { kind: "autoRun" },
    )
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
    // Given an existing write cell
    const validate = vi.fn().mockResolvedValue({ queryType: "INSERT" })
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)")],
      { runCell: okRun, validate },
    )
    // When the apply restates it and adds a second write
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
      validate,
    )
    // Then both go through the auto-run gate and are skipped
    const gates = vi.mocked(runCell).mock.calls.map((call) => call[3])
    expect(gates).toEqual([{ kind: "autoRun" }, { kind: "autoRun" }])
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
    // Given an existing SELECT cell
    const { runCell } = mountLive(1, [cell("sel-1", "SELECT 1")], {
      runCell: okRun,
    })
    // When the apply restates it
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
    // Then it auto-runs again
    expect(runCell).toHaveBeenCalledWith("sel-1", undefined, "SELECT 1", {
      kind: "autoRun",
    })
  })

  it("preserves existing mode when omitted (draw stays draw, run stays implicit)", async () => {
    // Given a run cell and a draw cell
    const { state, runCell } = mountLive(
      1,
      [cell("run-id", "old"), cell("draw-id", "old", { mode: "draw" })],
      { runCell: okRun },
    )
    // When the apply rewrites both without a mode
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
    // Then only the run cell auto-runs and both keep their mode
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledTimes(1)
    expect(runCell).toHaveBeenCalledWith("run-id", undefined, "SELECT 1", {
      kind: "autoRun",
    })
    expect(cellById(state, "run-id")?.mode).toBeUndefined()
    expect(cellById(state, "draw-id")?.mode).toBe("draw")
  })

  it("dispatches run-mode cells in parallel — total wallclock equals slowest cell, not the sum", async () => {
    // Given a runner that resolves each cell on demand
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
    // When the apply adds three run-mode cells
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Flush microtasks so dispatchTool resumes past the apply and fires every
    // runCell concurrently.
    await new Promise((r) => setTimeout(r, 0))
    // Then all three are in flight at once
    expect(order).toHaveLength(3)
    // When they finish out of order
    // Finish out of submission order — only possible if all three are in
    // flight simultaneously.
    finish[order[2]]()
    finish[order[0]]()
    finish[order[1]]()
    // Then the runs are reported in submission order
    const res = await pending
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; success: boolean }>
    }
    // Order in `runs` matches request/submission order, not finish order.
    expect(parsed.runs.map((r) => r.cellId)).toEqual(order)
  })

  it("reports per-cell runCell failure in the runs array with per-query results", async () => {
    // Given a runner that reports mixed per-query outcomes
    mountLive(1, [], {
      runCell: () =>
        Promise.resolve({
          success: false,
          queryCount: 3,
          results: ["success", "ERROR: boom", "cancelled"],
        }),
    })
    // When the apply adds a run-mode cell
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the runs entry carries every query status
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
    // Given a runner that throws archived
    mountLive(1, [cell("c")], {
      runCell: () =>
        Promise.reject(
          new NotebookToolError("archived", 'Notebook "x" is archived.'),
        ),
    })
    // When the agent runs the cell
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the typed envelope carries the code and a hint
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("archived")
    expect(parsed.hint).toMatch(/unarchive|create_notebook/)
  })

  it("deleted → error_code 'deleted'", async () => {
    // Given a runner that throws deleted
    mountLive(1, [cell("c")], {
      runCell: () => Promise.reject(new NotebookToolError("deleted", "gone")),
    })
    // When the agent runs the cell
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the envelope carries the deleted code
    expect(res.is_error).toBe(true)
    expect(
      (JSON.parse(res.content) as Record<string, unknown>).error_code,
    ).toBe("deleted")
  })

  it("unknown_cell → error_code 'unknown_cell' with resync hint", async () => {
    // Deleting a cell that doesn't exist throws unknown_cell from the transition.
    // Given a notebook without the target cell
    mountLive(1, [cell("keep")])
    // When the agent deletes it
    const res = await dispatchTool(
      "delete_cell",
      { buffer_id: 1, cell_id: "abc123" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the envelope carries unknown_cell and a resync hint
    expect(res.is_error).toBe(true)
    const parsed = JSON.parse(res.content) as Record<string, unknown>
    expect(parsed.error_code).toBe("unknown_cell")
    expect(parsed.hint).toMatch(/list_cells/)
  })
})

describe("dispatchTool — non-NotebookToolError falls through to default handler", () => {
  it("is captured as a generic tool execution error", async () => {
    // Given a runner that throws a plain error
    mountLive(1, [cell("c")], {
      runCell: () => Promise.reject(new Error("network boom")),
    })
    // When the agent runs the cell
    const res = await dispatchTool(
      "run_cell",
      { buffer_id: 1, cell_id: "c" },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the default handler reports the message
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
      ALL_GRANTED,
      dqlValidator,
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
    v: EXPECTED_MCP_VERSION,
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
    permissions: { get: () => ALL_GRANTED, consumeDirty: () => false },
    validateSql: dqlValidator,
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
    // Given a cell over the content cap
    mountLive(1, [cell("c", bigValue)])
    // When the agent asks for the full content
    const res = await dispatchTool(
      "get_cell",
      { buffer_id: 1, cell_id: "c", get_full_content: true },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the whole value comes back untruncated
    const parsed = JSON.parse(res.content) as {
      value: string
      truncated?: boolean
    }
    expect(parsed.value).toBe(bigValue)
    expect(parsed.truncated).toBeUndefined()
  })

  it("applies the cap when get_full_content is omitted or null", async () => {
    // Given a cell over the content cap
    mountLive(1, [cell("c", bigValue)])
    for (const input of [
      { buffer_id: 1, cell_id: "c" },
      { buffer_id: 1, cell_id: "c", get_full_content: null },
    ]) {
      // When the agent reads it without the switch
      const res = await dispatchTool(
        "get_cell",
        input,
        makeClient(),
        noopStatus,
        ALL_GRANTED,
        dqlValidator,
      )
      // Then the value is capped and flagged
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

  it("reports passive result view only while its snapshot key exists", async () => {
    // Given a passive notebook whose cell ran but holds no snapshot
    unregisterController(1)
    await db.buffers.update(1, {
      notebookViewState: {
        cells: [
          cell("c", "SELECT 1", {
            lastRunStatus: "success",
            paneView: "result",
          }),
        ],
      },
    })

    const readView = async () => {
      const response = await dispatchTool(
        "get_cell",
        { buffer_id: 1, cell_id: "c" },
        makeClient(),
        noopStatus,
        ALL_GRANTED,
        dqlValidator,
      )
      return (JSON.parse(response.content) as { view: string }).view
    }

    // When the agent reads the cell before and after its snapshot is saved
    const withoutSnapshot = await readView()
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "c",
      results: [],
      savedAt: 1,
    })
    const withSnapshot = await readView()

    // Then the view follows the snapshot key
    expect(withoutSnapshot).toBe("editor")
    expect(withSnapshot).toBe("result")
  })

  it("uses missing snapshot status for passive layout and dimension mutations", async () => {
    // Given a passive notebook whose cell ran but holds no snapshot
    unregisterController(1)
    const persistedCell = cell("c", "SELECT 1", {
      lastRunStatus: "success",
      paneView: "result",
    })
    await db.buffers.update(1, {
      notebookViewState: {
        cells: [persistedCell],
        settings: {
          layoutMode: "grid",
          layout: [{ i: "c", x: 0, y: 0, w: 6, h: 99 }],
        },
      },
    })

    // When the agent moves the cell
    const layout = await dispatchTool(
      "set_cell_layout",
      { buffer_id: 1, cell_id: "c", x: 0, y: 0, w: 4 },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the view reads editor and the row height follows the missing status
    expect(JSON.parse(layout.content)).toEqual({
      grid: { x: 0, y: 0, w: 4 },
      view: "editor",
      mode: null,
    })
    expect(
      (await db.buffers.get(1))?.notebookViewState?.settings?.layout?.[0],
    ).toEqual({
      i: "c",
      x: 0,
      y: 0,
      w: 4,
      h: computeAgentCellGridH(persistedCell, false),
    })

    // When the agent sets its dimensions
    const dimensions = await dispatchTool(
      "set_cell_dimensions",
      {
        buffer_id: 1,
        cell_id: "c",
        editor_height: null,
        result_height: null,
        view: null,
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the view still reads editor
    expect(JSON.parse(dimensions.content)).toEqual({
      view: "editor",
      mode: null,
    })
  })
})

describe("dispatchTool — apply_notebook_state dimensions", () => {
  it("rejects a malformed editor_height string at runtime", async () => {
    // Given a notebook with one cell
    const { state } = mountLive(1, [cell("a", "SELECT 1")])
    // When the apply carries a malformed editor height
    const res = await dispatchTool(
      "apply_notebook_state",
      {
        buffer_id: 1,
        layout_mode: null,
        maximized_cell_id: null,
        cells: [{ id: "a", value: "SELECT 1", editor_height: "bogus" }],
      },
      makeClient(),
      noopStatus,
      ALL_GRANTED,
      dqlValidator,
    )

    // Then the tool errors and the cell is untouched
    expect(res.is_error).toBe(true)
    expect(res.content).toContain("has an invalid editor_height")
    expect(cellById(state, "a")?.topHeight).toBeUndefined()
  })
})

describe("dispatchTool — apply_notebook_state preserve_value", () => {
  it("rejects a cell providing both value and preserve_value", async () => {
    // Given a cell entry with both value and preserve_value
    const client = makeClient()
    // When the agent applies it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/exactly one/)
  })

  it("rejects a cell providing neither value nor preserve_value", async () => {
    // Given a cell entry with neither value nor preserve_value
    const client = makeClient()
    // When the agent applies it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/has no value/)
  })

  it("rejects preserve_value without an existing cell id", async () => {
    // Given a preserve_value entry without an id
    const client = makeClient()
    // When the agent applies it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then it is rejected
    expect(res.is_error).toBe(true)
    expect(res.content).toMatch(/without an existing cell id/)
  })

  it("preserves a cell's existing value with preserve_value:true", async () => {
    // Given a cell with a value
    const { state } = mountLive(1, [cell("a", "keepme")])
    // When the apply preserves it
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
      ALL_GRANTED,
      dqlValidator,
    )
    // Then the value is unchanged
    expect(cellById(state, "a")?.value).toBe("keepme")
  })

  it("auto-run skips a preserved write cell, gating on its live SQL", async () => {
    // Given an existing write cell
    const validate = vi.fn().mockResolvedValue({ queryType: "INSERT" })
    const { runCell } = mountLive(
      1,
      [cell("ins-1", "INSERT INTO t VALUES (1)")],
      { runCell: okRun, validate },
    )
    // When the apply preserves it
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
      validate,
    )
    // Then the runner gates its live SQL and skips it
    expect(res.is_error).toBeFalsy()
    expect(runCell).toHaveBeenCalledWith(
      "ins-1",
      undefined,
      "INSERT INTO t VALUES (1)",
      { kind: "autoRun" },
    )
    const parsed = JSON.parse(res.content) as {
      runs: Array<{ cellId: string; skipped?: boolean }>
    }
    expect(parsed.runs[0]).toMatchObject({ cellId: "ins-1", skipped: true })
  })

  it("auto-run executes a preserved DQL cell with its live SQL", async () => {
    // Given an existing SELECT cell
    const { runCell } = mountLive(1, [cell("sel-1", "SELECT 1")], {
      runCell: okRun,
    })
    // When the apply preserves it
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
    // Then it auto-runs with its live SQL
    expect(runCell).toHaveBeenCalledWith("sel-1", undefined, "SELECT 1", {
      kind: "autoRun",
    })
  })
})
