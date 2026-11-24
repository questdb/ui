import "../../../src/test/stubBrowserGlobals"
import type { Permissions } from "../../../src/utils/tools/permissions"
import { beforeEach, describe, it, expect, vi } from "vitest"
import { dispatchTool } from "../../../src/utils/tools/dispatch"
import type {
  ModelToolsClient,
  StatusCallback,
} from "../../../src/utils/ai/aiAssistant"
import { __resetNotebookAIBridgeForTests } from "../../../src/utils/notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  registerController,
  type NotebookController,
  type RunCellSummary,
} from "../../../src/utils/notebooks/notebookController"
import type { ViewParts } from "../../../src/utils/notebooks/notebookDexieView"
import type {
  NotebookCell,
  NotebookSettings,
} from "../../../src/store/notebook"
import { db } from "../../../src/store/db"
import {
  clearRenderReport,
  RENDER_REPORT_NEEDS_READ,
  setRenderReport,
} from "../../../src/scenes/Editor/Notebook/renderReports"
import { __resetNotebookBufferQueuesForTests } from "../../../src/utils/notebooks/notebookBufferQueue"
import {
  checkStatementsForAutoRun,
  checkStatementsForExecution,
  classifyStatements,
  clearStatementClassCache,
  type RunCellGate,
} from "../../../src/utils/tools/permissions"
import type { ValidateQueryResult } from "../../../src/utils/questdb/types"

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

const cellById = (state: { parts: ViewParts }, id: string) =>
  state.parts.cells.find((c) => c.id === id)

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
  mountLive(1)
})

const call = (tool: string, input: Record<string, unknown>) =>
  dispatchTool(tool, input, makeClient(), noopStatus, ALL_GRANTED, dqlValidator)

const parsed = (result: { content: string }) =>
  JSON.parse(result.content) as Record<string, unknown>

describe("dispatchTool — dashboard tools", () => {
  it("round-trips the inferred chart configuration after clearing a visual", async () => {
    await db.buffers.put({
      id: 2,
      label: "Dashboard",
      value: "",
      position: 1,
      notebookViewState: {
        cells: [cell("chart", "SELECT 1", { mode: "draw" })],
      },
    })
    const target = { buffer_id: 2, cell_id: "chart" }
    const set = await call("set_cell_visual", {
      ...target,
      visual: { type: "stat" },
    })
    expect(set.is_error).not.toBe(true)
    const clear = await call("set_cell_visual", { ...target, visual: null })
    expect(clear.is_error).not.toBe(true)
    const chart_config = parsed(await call("get_cell", target)).chart_config
    expect(chart_config).toMatchObject({ queries: [null] })
    const applied = await call("apply_notebook_state", {
      buffer_id: 2,
      cells: [
        { id: "chart", preserve_value: true, mode: "draw", chart_config },
      ],
    })
    expect(applied.is_error, applied.content).not.toBe(true)
  })
  it("round-trips visual and interaction settings through a closed notebook", async () => {
    await db.buffers.put({
      id: 2,
      label: "Closed dashboard",
      value: "",
      position: 1,
      notebookViewState: {
        cells: [cell("stat", "SELECT 1", { mode: "draw" })],
        settings: { variables: [{ name: "desk", value: "'London'" }] },
      },
    })

    const target = { buffer_id: 2, cell_id: "stat" }
    const visual = { type: "stat", columns: { value: "volume" } }
    expect(
      (await call("set_cell_visual", { ...target, visual })).is_error,
    ).not.toBe(true)
    expect(
      (
        await call("set_cell_interactions", {
          ...target,
          click: { variable: "desk" },
        })
      ).is_error,
    ).not.toBe(true)

    const persisted = (await db.buffers.get(2))?.notebookViewState
    expect(persisted?.cells[0]).toMatchObject({
      mode: "draw",
      chartConfig: { visual },
      interactions: { click: { variable: "desk" } },
    })
    expect(persisted?.settings?.variables).toEqual([
      { name: "desk", value: "'London'" },
    ])
    expect(parsed(await call("get_cell", target))).toMatchObject({
      chart_config: { visual },
      interactions: { click: { variable: "desk" } },
    })
  })

  it("set_cell_visual stores the visual and notes when the cell is not drawn", async () => {
    // Given a run-mode cell
    const { state } = mountLive(1, [cell("c", "SELECT 1; SELECT 2")])

    // When the agent sets an order book visual
    const result = await call("set_cell_visual", {
      buffer_id: 1,
      cell_id: "c",
      visual: {
        type: "orderBook",
        columns: { price: "px", size: null },
        min: null,
        max: null,
        sparkline_query: null,
      },
    })

    // Then the visual is stored and the agent is told to switch to draw mode
    expect(cellById(state, "c")?.chartConfig?.visual).toEqual({
      type: "orderBook",
      columns: { price: "px" },
    })
    expect(parsed(result).note).toContain("draw")
  })

  it("set_cell_custom_chart stores the option and reports what it removed", async () => {
    // Given a draw cell
    const { state } = mountLive(1, [cell("c", "SELECT 1", { mode: "draw" })])

    // When the agent sends an option with a literal colour and a title link
    const result = await call("set_cell_custom_chart", {
      buffer_id: 1,
      cell_id: "c",
      option_json: JSON.stringify({
        title: { text: "x", link: "javascript:alert(1)" },
        series: [{ type: "bar", itemStyle: { color: "#f00" } }],
      }),
    })

    // Then the raw option is stored and both problems are reported
    expect(cellById(state, "c")?.chartConfig?.custom?.option).toBeDefined()
    const problems = parsed(result).problems as { path: string }[]
    expect(problems.map((p) => p.path)).toEqual(
      expect.arrayContaining(["title.link", "series[0].itemStyle.color"]),
    )
  })

  it("set_cell_custom_chart rejects invalid JSON", async () => {
    // Given / When
    mountLive(1, [cell("c", "SELECT 1", { mode: "draw" })])
    const result = await call("set_cell_custom_chart", {
      buffer_id: 1,
      cell_id: "c",
      option_json: "{not json",
    })

    // Then
    expect(result.is_error).toBe(true)
    expect(result.content).toContain("VALIDATION_ERROR")
  })

  it("set_cell_formats replaces formats and sets the grid mode", async () => {
    // Given
    const { state } = mountLive(1, [cell("c")])

    // When
    await call("set_cell_formats", {
      buffer_id: 1,
      cell_id: "c",
      formats: [
        {
          column: "price",
          kind: "price",
          decimals: 5,
          compact: null,
          prefix: null,
          suffix: null,
          thresholds: null,
          base_tone: null,
          sign_tone: null,
          visual: null,
        },
      ],
      grid_mode: "stream",
    })

    // Then
    expect(cellById(state, "c")).toMatchObject({
      formats: { price: { kind: "price", decimals: 5 } },
      gridMode: "stream",
    })
  })

  it("set_cell_interactions stores click and brush variables", async () => {
    // Given
    const { state } = mountLive(1, [cell("c")])

    // When
    const result = await call("set_cell_interactions", {
      buffer_id: 1,
      cell_id: "c",
      click: { variable: "@symbol", column: "sym" },
      brush: { from_variable: "t0", to_variable: "t1" },
    })

    // Then
    expect(cellById(state, "c")?.interactions).toEqual({
      click: { variable: "symbol", column: "sym" },
      brush: { from: "t0", to: "t1" },
    })
    expect(parsed(result).note).toContain("@symbol")
  })

  it("set_notebook_chart_sync stores the setting and clears it when off", async () => {
    // Given
    const { state } = mountLive(1, [cell("c")])

    // When
    await call("set_notebook_chart_sync", {
      buffer_id: 1,
      crosshair: "tooltip",
      zoom: true,
    })

    // Then
    expect(state.parts.settings.chartSync).toEqual({
      crosshair: "tooltip",
      zoom: true,
    })

    // When turned off
    await call("set_notebook_chart_sync", {
      buffer_id: 1,
      crosshair: "off",
      zoom: false,
    })

    // Then
    expect(state.parts.settings.chartSync).toBeUndefined()
  })

  it("set_cell_chart_config with queries replaces a visual", async () => {
    // Given a cell drawing a visual
    const { state } = mountLive(1, [
      cell("c", "SELECT 1", {
        mode: "draw",
        chartConfig: { xColumn: null, queries: [], visual: { type: "gauge" } },
      }),
    ])

    // When the agent configures preset series
    await call("set_cell_chart_config", {
      buffer_id: 1,
      cell_id: "c",
      x_column: null,
      queries: [
        {
          type: "events",
          y_columns: null,
          ohlc: null,
          partition_by_column: null,
          axis: null,
          enabled: null,
          name: null,
          events: { time: "ts", end: null, label: "what", tone: null },
        },
      ],
      right_axis: null,
    })

    // Then
    const config = cellById(state, "c")?.chartConfig
    expect(config?.visual).toBeUndefined()
    expect(config?.queries[0]).toMatchObject({
      type: "events",
      events: { time: "ts", label: "what" },
    })
  })

  it("get_cell returns the dashboard fields in the wire shape", async () => {
    // Given
    mountLive(1, [
      cell("c", "SELECT 1", {
        mode: "draw",
        chartConfig: {
          xColumn: null,
          queries: [],
          custom: { option: { series: [] } },
        },
        formats: { p: { kind: "price", decimals: 2 } },
        gridMode: "stable",
        interactions: { click: { variable: "s" } },
      }),
    ])

    // When
    const result = await call("get_cell", {
      buffer_id: 1,
      cell_id: "c",
      get_full_content: null,
    })

    // Then
    const details = parsed(result)
    expect(details.chart_config).toMatchObject({
      custom_option_json: '{"series":[]}',
    })
    expect(details.grid_mode).toBe("stable")
    expect(details.interactions).toEqual({
      click: { variable: "s", column: null },
      brush: null,
    })
    expect(details.formats).toMatchObject([
      { column: "p", kind: "price", decimals: 2 },
    ])
  })

  it.each([
    ["schema only", { grantSchemaAccess: true, read: false, write: false }],
    ["none", { grantSchemaAccess: false, read: false, write: false }],
  ])(
    "get_cell withholds the render report from an agent with %s access",
    async (_label, permissions: Permissions) => {
      // Given a draw cell whose gauge drew a result value
      mountLive(1, [cell("g", "SELECT 1", { mode: "draw" })])
      setRenderReport(1, "g", {
        kind: "visual",
        drawn: { type: "gauge", value: 987654.321 },
        problems: [],
      })

      try {
        // When an agent without 'read' reads the cell
        const result = await dispatchTool(
          "get_cell",
          { buffer_id: 1, cell_id: "g", get_full_content: null },
          makeClient(),
          noopStatus,
          permissions,
          dqlValidator,
        )

        // Then it is told why the report is withheld, without the value
        expect(parsed(result).render_report).toEqual({
          withheld: RENDER_REPORT_NEEDS_READ,
        })
        expect(result.content).not.toContain("987654")

        // And an agent with 'read' sees the value
        const read = parsed(
          await call("get_cell", { buffer_id: 1, cell_id: "g" }),
        )
        expect(read.render_report).toMatchObject({
          drawn: { type: "gauge", value: 987654.321 },
        })
      } finally {
        clearRenderReport(1, "g")
      }
    },
  )
})
