// @vitest-environment jsdom
// A draw cell is never run by apply_notebook_state: the refresh engine loads
// its chart while the cell is on screen. last_run_status must report runs
// only, and refreshed_at tells an agent whether the chart is drawn.
import { renderComponent, getHook } from "../../../src/test/component"
import React from "react"
import { act, fireEvent, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditorProvider, useEditor } from "../../../src/providers"
import { Tabs } from "../../../src/scenes/Editor/Monaco/tabs"
import { Notebook } from "../../../src/scenes/Editor/Notebook"
import { NotebookWorkspaceBridge } from "../../../src/scenes/Editor/Notebook/NotebookWorkspaceBridge"
import { dispatchTool } from "../../../src/utils/tools/dispatch"
import type { ModelToolsClient } from "../../../src/utils/ai/aiAssistant"
import type { Permissions } from "../../../src/utils/tools/permissions"
import {
  __resetNotebookAIBridgeForTests,
  getWorkspace,
} from "../../../src/utils/notebooks/notebookAIBridge"
import {
  __resetNotebookControllerForTests,
  getController,
} from "../../../src/utils/notebooks/notebookController"
import { __resetNotebookBufferQueuesForTests } from "../../../src/utils/notebooks/notebookBufferQueue"
import { db } from "../../../src/store/db"
import { questClient } from "../../../src/utils/questdb/queryClient"

vi.mock("@monaco-editor/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@monaco-editor/react")>()),
  loader: {
    config: () => undefined,
    init: () => new Promise(() => undefined),
  },
}))
vi.mock("react-grid-layout", () => ({
  ResponsiveGridLayout: () => null,
  useContainerWidth: () => ({ width: 0, containerRef: { current: null } }),
  verticalCompactor: {},
}))
vi.mock("react-grid-layout/core", () => ({ absoluteStrategy: {} }))
vi.mock("../../../src/scenes/Editor/Notebook/NotebookToolbar", () => ({
  NotebookToolbar: () => null,
}))
// echarts needs a canvas; the data path under test does not.
vi.mock("../../../src/scenes/Editor/Notebook/CellChart/ChartRenderer", () => ({
  ChartRenderer: () => null,
  default: () => null,
}))
vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useSelector: () => [],
}))

// A controllable IntersectionObserver: the test decides which cells are in
// the near band (±1 viewport → chart engine visible) and far band (±3
// viewports → virtualization retain band → snapshot hydration).
type FakeObserver = {
  cb: IntersectionObserverCallback
  margin: string
  nodes: Set<Element>
  alive: boolean
}
const observers: FakeObserver[] = []
class FakeIntersectionObserver {
  private o: FakeObserver
  constructor(
    cb: IntersectionObserverCallback,
    opts?: IntersectionObserverInit,
  ) {
    this.o = {
      cb,
      margin: opts?.rootMargin ?? "",
      nodes: new Set(),
      alive: true,
    }
    observers.push(this.o)
  }
  observe(n: Element) {
    this.o.nodes.add(n)
  }
  unobserve(n: Element) {
    this.o.nodes.delete(n)
  }
  disconnect() {
    this.o.alive = false
    this.o.nodes.clear()
  }
  takeRecords() {
    return []
  }
}
const setBands = async (near: string[], far: string[]) => {
  await act(async () => {
    for (const o of observers.filter((x) => x.alive)) {
      const inBand = o.margin.startsWith("100%") ? near : far
      const entries = [...o.nodes].map((target) => ({
        target,
        isIntersecting: inBand.includes(
          target.getAttribute("data-cell-id") ?? "",
        ),
        rootBounds: null,
        boundingClientRect: { top: 0, height: 0 },
      })) as unknown as IntersectionObserverEntry[]
      o.cb(entries, o as unknown as IntersectionObserver)
    }
    await new Promise((r) => setTimeout(r, 50))
  })
}

const NOTEBOOK_ID = 1
const SQL_TAB_ID = 2
const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })
const client = {
  validateQuery: () => Promise.resolve({ valid: true }),
  validateSqlRaw: dqlValidator,
  runQueryRaw: () =>
    Promise.resolve({ type: "dql", columns: [], dataset: [], count: 0 }),
  createNotebook: () => Promise.reject(new Error("unused")),
  duplicateNotebook: () => Promise.reject(new Error("unused")),
  activateNotebook: () => Promise.reject(new Error("unused")),
  deleteNotebook: (bufferId: number) =>
    getWorkspace()!.deleteNotebook(bufferId),
} as ModelToolsClient
const agent = (tool: string, input: unknown) =>
  dispatchTool(tool, input, client, () => undefined, ALL_GRANTED, dqlValidator)

const probe: { editor: ReturnType<typeof useEditor> | null } = { editor: null }
const Probe = () => {
  probe.editor = useEditor()
  return null
}
const ActiveNotebook = () => {
  const { activeBuffer } = useEditor()
  if (!activeBuffer.notebookViewState) return null
  return (
    <Notebook
      key={`${activeBuffer.id}:${activeBuffer.archived ? "archived" : "live"}`}
    />
  )
}
const Console = () => (
  <EditorProvider>
    <NotebookWorkspaceBridge />
    <Probe />
    <Tabs />
    <ActiveNotebook />
  </EditorProvider>
)

const restoreFromTabHistory = async () => {
  await act(async () => {
    fireEvent.keyDown(getHook("editor-tabs-history-button"), {
      key: "Enter",
      code: "Enter",
    })
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.click(getHook("editor-tabs-history-item"))
    await Promise.resolve()
  })
}

const CANDLE_SQL = "SELECT ts, o, h, l, cl FROM candles"
const STEP_SQL = "SELECT ts, v FROM a;\nSELECT ts, v FROM b"

type CellWire = {
  id: string
  last_run_status?: string
  last_refresh_error?: string
  refreshed_at?: number
}

// What get_notebook_state reports for the two draw cells.
const readCells = async () => {
  const res = await agent("get_notebook_state", { buffer_id: NOTEBOOK_ID })
  const cells = (JSON.parse(res.content) as { cells: CellWire[] }).cells
  const pick = (name: string) => {
    const cell = cells.find((c) => c.id === ids[name])
    return {
      status: cell?.last_run_status,
      refreshedAt: cell?.refreshed_at,
      refreshError: cell?.last_refresh_error,
    }
  }
  return { candle: pick("candle"), step: pick("step") }
}

const ids: Record<string, string> = {}
let failFromB = false
beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  observers.length = 0
  failFromB = false
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.spyOn(questClient, "validateQuery").mockImplementation((sql: string) =>
    Promise.resolve({
      query: sql,
      columns: [{ name: "ts", type: "TIMESTAMP" }],
      timestamp: 0,
    }),
  )
  vi.spyOn(questClient, "queryRaw").mockImplementation(((sql: string) => {
    if (failFromB && sql.includes("FROM b"))
      return {
        queryId: "q",
        promise: Promise.reject({ error: "table does not exist [b]" }),
      }
    return {
      queryId: "q",
      promise: Promise.resolve({
        type: "dql",
        query: sql,
        columns: [
          { name: "ts", type: "TIMESTAMP" },
          { name: "o", type: "DOUBLE" },
          { name: "h", type: "DOUBLE" },
          { name: "l", type: "DOUBLE" },
          { name: "cl", type: "DOUBLE" },
          { name: "v", type: "DOUBLE" },
        ],
        dataset: [["2026-01-01T00:00:00.000000Z", 1, 2, 0.5, 1.5, 3]],
        count: 1,
        timestamp: 0,
        timings: { compiler: 0, count: 0, execute: 0, fetch: 0 },
      }),
    }
  }) as never)
  await db.buffers.clear()
  await db.notebook_results.clear()
  await db.notebook_globals.clear()
  await db.buffers.bulkPut([
    {
      id: NOTEBOOK_ID,
      label: "Charts",
      value: "",
      position: 0,
      notebookViewState: {
        cells: [{ id: "intro", position: 0, type: "markdown", value: "# C" }],
      },
    },
    { id: SQL_TAB_ID, label: "SQL", value: "SELECT 1", position: 1 },
  ])
  await db.editor_settings
    .where("key")
    .equals("activeBufferId")
    .modify({ value: NOTEBOOK_ID })
})

const applyTwoDrawCells = async () => {
  const applied = await agent("apply_notebook_state", {
    buffer_id: NOTEBOOK_ID,
    cells: [
      { id: "intro", preserve_value: true },
      {
        name: "candle",
        value: CANDLE_SQL,
        mode: "draw",
        chart_config: {
          x_column: "ts",
          queries: [
            {
              type: "candlestick",
              ohlc: { open: "o", high: "h", low: "l", close: "cl" },
            },
          ],
        },
      },
      {
        name: "step",
        value: STEP_SQL,
        mode: "draw",
        chart_config: {
          x_column: "ts",
          queries: [
            { type: "stepArea", y_columns: ["v"] },
            { type: "stepArea", y_columns: ["v"] },
          ],
        },
      },
    ],
  })
  expect(applied.is_error).toBeUndefined()
  expect((JSON.parse(applied.content) as { runs: unknown[] }).runs).toEqual([])
  const state = await agent("get_notebook_state", { buffer_id: NOTEBOOK_ID })
  for (const c of (
    JSON.parse(state.content) as {
      cells: Array<{ id: string; name?: string }>
    }
  ).cells)
    if (c.name) ids[c.name] = c.id
}

describe("draw cell last_run_status", () => {
  it("reports runs only, never whether the chart is drawn, and says when a drawn chart's data was fetched", async () => {
    // Given a live notebook where the agent adds two draw cells
    const view = renderComponent(<Console />)
    await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))
    await applyTwoDrawCells()
    await new Promise((r) => setTimeout(r, 100))

    // Then neither is run by the apply, and neither chart has loaded yet
    expect(await readCells()).toEqual({
      candle: { status: "none" },
      step: { status: "none" },
    })

    // When the candlestick is on screen and the step-area is below the fold
    await setBands(["intro", ids.candle], ["intro", ids.candle])

    // Then the drawn candlestick reports when its data was fetched, and
    // drawing it does not count as a run
    await waitFor(async () =>
      expect((await readCells()).candle.refreshedAt).toEqual(
        expect.any(Number),
      ),
    )
    expect((await readCells()).candle.status).toBe("none")
    expect((await readCells()).step).toEqual({ status: "none" })

    // When the agent runs the step-area
    const ran = await agent("run_cell", {
      buffer_id: NOTEBOOK_ID,
      cell_id: ids.step,
    })
    expect((JSON.parse(ran.content) as { success: boolean }).success).toBe(true)

    // Then only the run cell reports success
    expect((await readCells()).step.status).toBe("success")
    expect((await readCells()).candle.status).toBe("none")

    // When the agent archives the notebook and the user restores it
    await agent("delete_notebook", { buffer_id: NOTEBOOK_ID })
    await waitFor(() => expect(probe.editor?.activeBuffer.id).toBe(SQL_TAB_ID))
    observers.length = 0
    await restoreFromTabHistory()
    await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))
    await setBands([ids.step], [ids.step])
    await new Promise((r) => setTimeout(r, 200))

    // Then the statuses are the same as before the archive
    expect((await readCells()).candle.status).toBe("none")
    expect((await readCells()).step.status).toBe("success")

    // When the console reloads with both cells on screen
    view.unmount()
    __resetNotebookControllerForTests()
    __resetNotebookAIBridgeForTests()
    __resetNotebookBufferQueuesForTests()
    observers.length = 0
    renderComponent(<Console />)
    await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))
    await setBands(
      ["intro", ids.candle, ids.step],
      ["intro", ids.candle, ids.step],
    )

    // Then the candlestick shows its stored chart, still without a run
    await waitFor(async () =>
      expect((await readCells()).candle.refreshedAt).toEqual(
        expect.any(Number),
      ),
    )
    expect((await readCells()).candle.status).toBe("none")
    expect((await readCells()).step.status).toBe("success")

    // When the candlestick scrolls far off screen and its chart is released
    await setBands([ids.step], [ids.step])
    await new Promise((r) => setTimeout(r, 300))

    // Then scrolling changes only whether its chart is loaded
    expect((await readCells()).candle).toEqual({ status: "none" })
  }, 30000)

  it("reports a chart that failed to load as a refresh error, not as a failed run", async () => {
    // Given the step-area's second statement fails on the server
    renderComponent(<Console />)
    await waitFor(() => expect(getController(NOTEBOOK_ID)?.kind).toBe("live"))
    failFromB = true
    await applyTwoDrawCells()
    await new Promise((r) => setTimeout(r, 100))

    // When both charts are on screen
    await setBands(
      ["intro", ids.candle, ids.step],
      ["intro", ids.candle, ids.step],
    )

    // Then the failure is a refresh error and the never-run cell stays "none"
    await waitFor(
      async () =>
        expect((await readCells()).step.refreshError).toContain(
          "table does not exist [b]",
        ),
      { timeout: 5000 },
    )
    expect((await readCells()).step.status).toBe("none")
    expect((await readCells()).candle.status).toBe("none")
    expect((await readCells()).candle.refreshedAt).toEqual(expect.any(Number))
  }, 30000)
})
