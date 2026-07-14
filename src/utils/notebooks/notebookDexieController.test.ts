import "../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetNotebookDexieControllerForTests,
  createDexieNotebookController,
  type NotebookController,
} from "./notebookController/notebookController"
import {
  addCellTransition,
  applyNotebookStateTransition,
  deleteCellTransition,
  duplicateCellTransition,
  moveCellDownTransition,
  moveCellUpTransition,
  setCellMaximizedTransition,
  setCellModeTransition,
  setLayoutModeTransition,
  updateCellTransition,
  type ApplyNotebookStateRequest,
} from "./notebookController"
import { generateId } from "../../scenes/Editor/Notebook/notebookUtils"
import { forgetHeadlessRuns } from "./notebookHeadlessRun"
import type { DexieControllerDeps } from "./notebookHeadlessRun"
import {
  claimLive,
  claimMounting,
  releaseLive,
  releaseMounting,
} from "./notebookController/bufferOwnership"
import { releaseArchivedBuffer } from "./notebookController"
import {
  __resetNotebookBufferQueuesForTests,
  enqueueBufferTask,
} from "./notebookBufferQueue"
import { __resetAgentActivityForTests, onAgentEdit } from "./agentActivity"
import type { AgentEdit } from "./agentActivity"
import { NotebookToolError } from "./notebookToolError"
import { db } from "../../store/db"
import { bufferStore } from "../../store/buffers"
import { loadCellSnapshot, saveCellSnapshot } from "../../store/notebookResults"
import { persistCellSnapshot } from "../../scenes/Editor/Notebook/persistCellSnapshot"
import type { Client } from "../questdb/client"
import {
  MAX_NOTEBOOK_CELLS,
  type AutoRefresh,
  type CellMode,
  type CellType,
  type NotebookCell,
  type NotebookViewState,
} from "../../store/notebook"

const BUFFER_ID = 7

const cell = (
  id: string,
  value = "",
  overrides: Partial<NotebookCell> = {},
): NotebookCell => ({ id, position: 0, value, ...overrides })

const seedNotebook = (
  view: NotebookViewState,
  opts: { archived?: boolean } = {},
) =>
  db.buffers.put({
    id: BUFFER_ID,
    label: "nb",
    value: "",
    position: 0,
    ...(opts.archived ? { archived: true } : {}),
    notebookViewState: view,
  })

const persistedView = async (): Promise<NotebookViewState> => {
  const buffer = await db.buffers.get(BUFFER_ID)
  if (!buffer?.notebookViewState) throw new Error("no persisted view")
  return buffer.notebookViewState
}

// Responder-style quest stub: each queryRaw call resolves through `respond`,
// so tests control per-query outcomes and timing.
type PendingQuery = {
  sql: string
  resolve: (result: unknown) => void
}

const makeQuest = () => {
  const pending: PendingQuery[] = []
  const quest = {
    queryRaw: (sql: string) => {
      let resolve!: (result: unknown) => void
      const promise = new Promise((res) => {
        resolve = res
      })
      pending.push({ sql, resolve })
      return { promise, queryId: `q-${pending.length}` }
    },
    abort: vi.fn(),
  } as unknown as Client
  const respondNext = (result: unknown) => {
    const next = pending.shift()
    if (!next) throw new Error("no pending query")
    next.resolve(result)
  }
  return { quest, pending, respondNext }
}

const dqlResult = { type: "dql", columns: [], dataset: [], count: 1 }
const errorResult = { type: "error", error: "boom" }

// Rebuilds the ergonomic named-method API over the collapsed controller
// (mutate/readView/runCell) so these behavior tests stay focused on effects,
// not the transition-plumbing each op now goes through.
const withOps = (ctrl: NotebookController) => ({
  ...ctrl,
  addCell: (value: string, afterCellId?: string, type?: CellType) =>
    ctrl.mutate((p) =>
      addCellTransition(p, BUFFER_ID, {
        id: generateId(),
        value,
        afterCellId,
        type,
      }),
    ),
  updateCell: (
    cellId: string,
    updates: { value?: string; name?: string; autoRefresh?: AutoRefresh },
  ) => ctrl.mutate((p) => updateCellTransition(p, BUFFER_ID, cellId, updates)),
  deleteCell: (cellId: string) =>
    ctrl.mutate((p) => deleteCellTransition(p, BUFFER_ID, cellId)),
  moveCellUp: (cellId: string) =>
    ctrl.mutate((p) => moveCellUpTransition(p, BUFFER_ID, cellId)),
  moveCellDown: (cellId: string) =>
    ctrl.mutate((p) => moveCellDownTransition(p, BUFFER_ID, cellId)),
  duplicateCell: (cellId: string) =>
    ctrl.mutate((p) =>
      duplicateCellTransition(p, BUFFER_ID, cellId, generateId()),
    ),
  setLayoutMode: (mode: "list" | "grid") =>
    ctrl.mutate((p) => setLayoutModeTransition(p, mode)),
  setCellMode: (cellId: string, mode: CellMode) =>
    ctrl.mutate((p) => setCellModeTransition(p, BUFFER_ID, cellId, mode)),
  setCellMaximized: (cellId: string | null) =>
    ctrl.mutate((p) => setCellMaximizedTransition(p, BUFFER_ID, cellId)),
  applyNotebookState: (request: ApplyNotebookStateRequest) =>
    ctrl.mutate((p) => applyNotebookStateTransition(p, request)),
})

const makeController = (
  overrides: Partial<DexieControllerDeps> = {},
  quest?: Client,
  signal?: AbortSignal,
) =>
  withOps(
    createDexieNotebookController(
      BUFFER_ID,
      {
        isBufferClaimed: () => false,
        getQuest: () => quest,
        getBufferSeq: () => 0,
        ...overrides,
      },
      signal,
    ),
  )

beforeEach(async () => {
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieControllerForTests()
  __resetAgentActivityForTests()
  await db.buffers.clear()
  await db.notebook_results.clear()
})

describe("createDexieNotebookController — structural edits", () => {
  it("does not commit a mutation cancelled while waiting in the queue", async () => {
    // Given a passive update waiting behind another task for the same notebook
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const blocker = enqueueBufferTask(BUFFER_ID, () => gate)
    const abort = new AbortController()
    const controller = makeController({}, undefined, abort.signal)
    const seen: AgentEdit[] = []
    onAgentEdit((event) => seen.push(event))
    const update = controller.updateCell("a", { value: "SELECT 2" })

    // When the operation is cancelled before it reaches the front
    abort.abort()
    release()
    await blocker

    // Then no write or agent activity is produced
    await expect(update).rejects.toMatchObject({ name: "AbortError" })
    expect((await persistedView()).cells[0].value).toBe("SELECT 1")
    expect(seen).toEqual([])
  })

  it("addCell persists the new cell after the anchor", async () => {
    // Given a persisted notebook with one cell
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController()
    // When the agent adds a cell after it
    const id = await controller.addCell("SELECT 2", "a")
    // Then the durable buffer holds both, in order
    const view = await persistedView()
    expect(view.cells.map((c) => c.id)).toEqual(["a", id])
    expect(view.cells[1].value).toBe("SELECT 2")
  })

  it("addCell in grid mode seeds a layout entry below existing cells", async () => {
    // Given a grid notebook with an existing layout entry
    await seedNotebook({
      cells: [cell("a")],
      settings: {
        layoutMode: "grid",
        layout: [{ i: "a", x: 0, y: 0, w: 12, h: 4 }],
      },
    })
    const controller = makeController()
    // When a cell is added
    const id = await controller.addCell("SELECT 2")
    // Then it lands below the lowest entry with the h=1 sentinel
    const view = await persistedView()
    expect(view.settings?.layout).toContainEqual({
      i: id,
      x: 0,
      y: 4,
      w: 12,
      h: 1,
    })
  })

  it("addCell enforces the cell cap inside the queued transition", async () => {
    // Given a notebook already at the cap
    await seedNotebook({
      cells: Array.from({ length: MAX_NOTEBOOK_CELLS }, (_, i) =>
        cell(`c${i}`),
      ),
    })
    const controller = makeController()
    // When another cell is added
    // Then the op is rejected and nothing is persisted
    await expect(controller.addCell("SELECT 1")).rejects.toMatchObject({
      code: "cell_limit",
    })
    expect((await persistedView()).cells).toHaveLength(MAX_NOTEBOOK_CELLS)
  })

  it("updateCell patches only the target cell", async () => {
    // Given two persisted cells
    await seedNotebook({ cells: [cell("a", "old"), cell("b", "keep")] })
    const controller = makeController()
    // When one is updated
    await controller.updateCell("a", { value: "new", name: "Renamed" })
    // Then only that cell changed
    const view = await persistedView()
    expect(view.cells[0]).toMatchObject({ value: "new", name: "Renamed" })
    expect(view.cells[1].value).toBe("keep")
  })

  it("updateCell rejects an unknown cell with a typed error", async () => {
    // Given a notebook without cell "ghost"
    await seedNotebook({ cells: [cell("a")] })
    const controller = makeController()
    // When it is updated, then the typed error surfaces
    await expect(
      controller.updateCell("ghost", { value: "x" }),
    ).rejects.toMatchObject({ code: "unknown_cell" })
  })

  it("deleteCell removes the cell, clears stale focus/maximize, and drops its snapshot", async () => {
    // Given a notebook where the doomed cell is focused, maximized, and has a snapshot
    await seedNotebook({
      cells: [cell("a"), cell("b")],
      focusedCellId: "a",
      maximizedCellId: "a",
    })
    await saveCellSnapshot({
      bufferId: BUFFER_ID,
      cellId: "a",
      results: [],
      savedAt: 1,
    })
    const controller = makeController()
    // When the agent deletes it
    await controller.deleteCell("a")
    // Then the persisted view and the snapshot store no longer reference it
    const view = await persistedView()
    expect(view.cells.map((c) => c.id)).toEqual(["b"])
    expect(view.focusedCellId).toBeUndefined()
    expect(view.maximizedCellId).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("moveCellUp / moveCellDown swap positions durably", async () => {
    // Given two cells
    await seedNotebook({ cells: [cell("a"), cell("b")] })
    const controller = makeController()
    // When they are moved, then each order lands in the durable buffer
    await controller.moveCellDown("a")
    expect((await persistedView()).cells.map((c) => c.id)).toEqual(["b", "a"])
    await controller.moveCellUp("a")
    expect((await persistedView()).cells.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("duplicateCell copies the value, drops the result, and copies the grid slot", async () => {
    // Given a grid notebook whose source cell has a position
    await seedNotebook({
      cells: [cell("a", "SELECT 1", { lastRunStatus: "success" })],
      settings: {
        layoutMode: "grid",
        layout: [{ i: "a", x: 3, y: 2, w: 6, h: 4 }],
      },
    })
    const controller = makeController()
    // When it is duplicated
    const newId = await controller.duplicateCell("a")
    // Then the copy carries value + run status (never the result) and the slot
    const view = await persistedView()
    const copy = view.cells.find((c) => c.id === newId)
    expect(copy).toMatchObject({ value: "SELECT 1", lastRunStatus: "success" })
    expect(copy?.result).toBeUndefined()
    expect(view.settings?.layout).toContainEqual({
      i: newId,
      x: 3,
      y: 2,
      w: 6,
      h: 4,
    })
  })
})

describe("createDexieNotebookController — settings & layout", () => {
  it("setLayoutMode persists a settings patch", async () => {
    // Given a persisted notebook
    await seedNotebook({ cells: [cell("a")] })
    const controller = makeController()
    // When a settings-level op runs, then the patch lands durably
    await controller.setLayoutMode("grid")
    const view = await persistedView()
    expect(view.settings?.layoutMode).toBe("grid")
  })

  it("setCellMode draw seeds the chart bottom height and exits view-maximize", async () => {
    // Given a view-maximized run cell; when it flips to draw, then the chart
    // defaults land and the maximize exits
    await seedNotebook({
      cells: [cell("a", "SELECT 1", { isViewMaximized: true })],
    })
    const controller = makeController()
    await controller.setCellMode("a", "draw")
    const view = await persistedView()
    expect(view.cells[0]).toMatchObject({
      mode: "draw",
      bottomHeight: 350,
      isViewMaximized: false,
    })
  })

  it("setCellMaximized validates the target and persists it", async () => {
    // Given one cell; when maximize is set/cleared/mistargeted, then each
    // outcome is persisted or rejected accordingly
    await seedNotebook({ cells: [cell("a")] })
    const controller = makeController()
    await controller.setCellMaximized("a")
    expect((await persistedView()).maximizedCellId).toBe("a")
    await controller.setCellMaximized(null)
    expect((await persistedView()).maximizedCellId).toBeUndefined()
    await expect(controller.setCellMaximized("ghost")).rejects.toMatchObject({
      code: "unknown_cell",
    })
  })
})

describe("createDexieNotebookController — applyNotebookState", () => {
  it("applies the full request and reports the diff", async () => {
    // Given a one-cell notebook; when a grid-mode full-state apply lands,
    // then cells, mode, and layout persist and the diff names the addition
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController()
    const out = await controller.applyNotebookState({
      layoutMode: "grid",
      cells: [{ id: "a", preserveValue: true }, { value: "SELECT 2" }],
    })
    expect(out.applied.added).toHaveLength(1)
    const view = await persistedView()
    expect(view.cells).toHaveLength(2)
    expect(view.settings?.layoutMode).toBe("grid")
    expect(view.settings?.layout).toHaveLength(2)
  })

  it("clears a focusedCellId whose cell the apply dropped", async () => {
    // Given the focused cell is about to be replaced wholesale
    await seedNotebook({
      cells: [cell("a", "SELECT 1")],
      focusedCellId: "a",
    })
    const controller = makeController()
    // When a full-state apply drops it
    await controller.applyNotebookState({ cells: [{ value: "SELECT 2" }] })
    // Then no ghost focus target survives for the next mount's scroll
    expect((await persistedView()).focusedCellId).toBeUndefined()
  })

  it("is all-or-nothing: a validation failure persists nothing", async () => {
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController()
    // preserve_value for a cell id that does not exist → buildAppliedCells throws
    await expect(
      controller.applyNotebookState({
        cells: [{ id: "ghost", preserveValue: true }],
      }),
    ).rejects.toThrow()
    const view = await persistedView()
    expect(view.cells.map((c) => c.id)).toEqual(["a"])
  })
})

describe("createDexieNotebookController — lifecycle & concurrency", () => {
  it("surfaces deleted / archived / non-notebook buffers as typed errors", async () => {
    const controller = makeController()
    await expect(controller.setLayoutMode("list")).rejects.toMatchObject({
      code: "deleted",
    })
    await seedNotebook({ cells: [] }, { archived: true })
    await expect(controller.setLayoutMode("list")).rejects.toMatchObject({
      code: "archived",
    })
    await db.buffers.put({
      id: BUFFER_ID,
      label: "sql",
      value: "",
      position: 0,
    })
    await expect(controller.setLayoutMode("list")).rejects.toMatchObject({
      code: "not_a_notebook",
    })
  })

  it("reports the notebook deleted when the buffer row vanishes between a mutation's read and write", async () => {
    // Given a notebook whose row is deleted underneath the queued transition
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController()
    const updateSpy = vi.spyOn(bufferStore, "update").mockResolvedValue(0)
    try {
      // When updateCell and addCell commit against the vanished row
      await expect(
        controller.updateCell("a", { value: "SELECT 2" }),
      ).rejects.toMatchObject({ code: "deleted" })
      await expect(controller.addCell("SELECT 3", "a")).rejects.toMatchObject({
        code: "deleted",
      })
    } finally {
      updateSpy.mockRestore()
    }
  })

  it("concurrent mutations serialize — no lost update", async () => {
    // Given a one-cell notebook
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController()
    // When two mutations are fired without awaiting in between
    const [idB, idC] = await Promise.all([
      controller.addCell("SELECT 2"),
      controller.addCell("SELECT 3"),
    ])
    // Then both writes landed
    const view = await persistedView()
    expect(view.cells.map((c) => c.id)).toEqual(["a", idB, idC])
  })

  it("emits one agent-edit event per mutation, naming the touched cell", async () => {
    await seedNotebook({ cells: [cell("a")] })
    const seen: AgentEdit[] = []
    onAgentEdit((e) => seen.push(e))
    const controller = makeController()
    const id = await controller.addCell("SELECT 2")
    await controller.updateCell("a", { value: "SELECT 9" })
    await controller.deleteCell(id)
    expect(seen).toEqual([
      { bufferId: BUFFER_ID, cellId: id },
      { bufferId: BUFFER_ID, cellId: "a" },
      { bufferId: BUFFER_ID },
    ])
  })

  it("does not emit an agent-edit event when the mutation fails", async () => {
    await seedNotebook({ cells: [cell("a")] })
    const seen: AgentEdit[] = []
    onAgentEdit((e) => seen.push(e))
    const controller = makeController()
    await expect(
      controller.updateCell("ghost", { value: "x" }),
    ).rejects.toBeInstanceOf(NotebookToolError)
    expect(seen).toEqual([])
  })

  it("rejects a mutation when the buffer is claimed, instead of writing behind the mount seed", async () => {
    // Given a notebook whose provider is mounting (the user just opened it)
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController({ isBufferClaimed: () => true })
    // When the agent's queued edit would land after the seed read
    // Then it is refused with a retryable typed error and nothing changed
    await expect(
      controller.updateCell("a", { value: "SELECT 2" }),
    ).rejects.toMatchObject({ code: "mounted_mid_edit" })
    expect((await persistedView()).cells[0].value).toBe("SELECT 1")
  })

  it("rejects deleteCell when the buffer is claimed, keeping the cell and its snapshot", async () => {
    // Given a mounting notebook whose cell has a persisted snapshot
    await seedNotebook({ cells: [cell("a"), cell("b")] })
    await saveCellSnapshot({
      bufferId: BUFFER_ID,
      cellId: "a",
      results: [],
      savedAt: 1,
    })
    const controller = makeController({ isBufferClaimed: () => true })
    // When the agent's delete would land after the seed read
    await expect(controller.deleteCell("a")).rejects.toMatchObject({
      code: "mounted_mid_edit",
    })
    // Then the cell and its snapshot survive
    expect((await persistedView()).cells.map((c) => c.id)).toEqual(["a", "b"])
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeDefined()
  })

  it("refuses to delete the only cell inside the queued task, keeping its snapshot", async () => {
    // Given a single-cell notebook (a concurrent delete already removed the
    // sibling that the caller's guard read still saw)
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    await saveCellSnapshot({
      bufferId: BUFFER_ID,
      cellId: "a",
      results: [],
      savedAt: 1,
    })
    const controller = makeController()
    // When the delete lands
    await expect(controller.deleteCell("a")).rejects.toMatchObject({
      code: "last_cell",
    })
    // Then the cell stays and its persisted results were not wiped
    expect((await persistedView()).cells.map((c) => c.id)).toEqual(["a"])
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeDefined()
  })
})

describe("createDexieNotebookController — runCell", () => {
  it("persists the run result, lastRunStatus, and the result snapshot", async () => {
    // Given a background notebook with one SQL cell
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    // When the agent runs it and the query succeeds
    const pending = controller.runCell("a")
    await vi.waitFor(() => respondNext(dqlResult))
    const summary = await pending
    // Then the agent sees success and the durable state reflects the run
    expect(summary).toMatchObject({ success: true, queryCount: 1 })
    const view = await persistedView()
    expect(view.cells[0].lastRunStatus).toBe("success")
    expect(view.cells[0].result).toBeUndefined()
    const snapshot = await loadCellSnapshot(BUFFER_ID, "a")
    expect(snapshot?.results?.[0]).toMatchObject({ type: "dql" })
  })

  it("a multi-statement script stops on error and cancels the remainder", async () => {
    await seedNotebook({ cells: [cell("a", "SELECT 1; SELECT 2; SELECT 3")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const pending = controller.runCell("a")
    await vi.waitFor(() => respondNext(dqlResult))
    await vi.waitFor(() => respondNext(errorResult))
    const summary = await pending
    expect(summary.success).toBe(false)
    expect(summary.results).toEqual(["success", "ERROR: boom", "cancelled"])
  })

  it("records a NOTICE result as a DQL with the notice attached", async () => {
    // Given a background run whose statement returns a notice + result set
    await seedNotebook({ cells: [cell("a", "ALTER TABLE t CONVERT")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const pending = controller.runCell("a")
    // When the server responds with a notice-carrying payload
    await vi.waitFor(() =>
      respondNext({
        type: "notice",
        notice: "partition converted",
        columns: [{ name: "x", type: "INT" }],
        dataset: [[1]],
        count: 1,
      }),
    )
    const summary = await pending
    // Then the run succeeds, the agent sees the notice, and the persisted
    // snapshot keeps the rows + notice for the next mount
    expect(summary.success).toBe(true)
    expect(summary.results).toEqual(["success (NOTICE: partition converted)"])
    expect((await persistedView()).cells[0].lastRunStatus).toBe("success")
    const snapshot = await loadCellSnapshot(BUFFER_ID, "a")
    expect(snapshot?.results?.[0]).toMatchObject({
      type: "dql",
      notice: "partition converted",
    })
  })

  it("never executes a markdown cell", async () => {
    await seedNotebook({
      cells: [cell("a", "# prose", { type: "markdown" })],
    })
    const { quest, pending } = makeQuest()
    const controller = makeController({}, quest)
    const summary = await controller.runCell("a")
    expect(summary).toEqual({ success: false, queryCount: 0, results: [] })
    expect(pending).toHaveLength(0)
  })

  it("throws workspace_unavailable when the agent runtime is not registered", async () => {
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const controller = makeController({ getQuest: () => undefined })
    await expect(controller.runCell("a")).rejects.toMatchObject({
      code: "workspace_unavailable",
    })
  })

  it("parallel runs on different cells both record their results", async () => {
    // Given two SQL cells
    await seedNotebook({
      cells: [cell("a", "SELECT 1"), cell("b", "SELECT 2")],
    })
    const { quest, pending, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    // When both run concurrently (the queue is released during execution)
    const runA = controller.runCell("a")
    const runB = controller.runCell("b")
    await vi.waitFor(() => {
      if (pending.length < 2) throw new Error("not both in flight")
    })
    respondNext(dqlResult)
    respondNext(dqlResult)
    const [summaryA, summaryB] = await Promise.all([runA, runB])
    // Then neither commit erased the other
    expect(summaryA.success).toBe(true)
    expect(summaryB.success).toBe(true)
    const view = await persistedView()
    expect(view.cells.map((c) => c.lastRunStatus)).toEqual([
      "success",
      "success",
    ])
  })

  it("drops the write and reports unverified when the buffer is claimed mid-run", async () => {
    // Given a run in flight on a background notebook
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, respondNext } = makeQuest()
    let claimed = false
    const controller = makeController({ isBufferClaimed: () => claimed }, quest)
    const pending = controller.runCell("a")
    // When the user opens the tab before the query completes
    claimed = true
    await vi.waitFor(() => respondNext(dqlResult))
    const summary = await pending
    // Then the result is reported unverified and neither the buffer nor the
    // snapshot store was touched
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/opened this notebook/)
    expect((await persistedView()).cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("drops the result and reports unverified when the user changed the notebook mid-run", async () => {
    // Given a run in flight on a background notebook
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    let seq = 0
    const controller = makeController({ getBufferSeq: () => seq }, quest)
    const run = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When the user visits the notebook and edits it while the query runs
    seq = 1
    respondNext(dqlResult)
    const summary = await run
    // Then the stale result is reported unverified and nothing was recorded
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/changed this notebook/)
    expect((await persistedView()).cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("a superseded run never records its stale result over the newer run's", async () => {
    // Given a slow run on a cell
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, pending: inFlight } = makeQuest()
    const controller = makeController({}, quest)
    const first = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("first not in flight")
    })
    // When a newer run of the same cell starts and finishes first
    const second = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length < 2) throw new Error("second not in flight")
    })
    inFlight[1].resolve(dqlResult)
    const summarySecond = await second
    expect(summarySecond.success).toBe(true)
    // And the older run finishes last
    inFlight[0].resolve(errorResult)
    const summaryFirst = await first
    // Then the stale result is discarded and the newer run's stays recorded
    expect(summaryFirst.unverified).toBe(true)
    expect(summaryFirst.note).toMatch(/newer run/)
    expect((await persistedView()).cells[0].lastRunStatus).toBe("success")
  })

  it("a run whose cell was deleted mid-flight records nothing and says so", async () => {
    await seedNotebook({ cells: [cell("a", "SELECT 1"), cell("b")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const pending = controller.runCell("a")
    // The cell disappears while the query is in flight (the queue is not held
    // during execution, so the delete lands before the commit).
    await controller.deleteCell("a")
    respondNext(dqlResult)
    const summary = await pending
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/cell was deleted/)
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("an abort that races completion records the statement's real outcome (live parity)", async () => {
    // Given a run already in flight when the abort lands
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const abort = new AbortController()
    const controller = makeController({}, quest)
    const pending = controller.runCell("a", abort.signal)
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When the abort fires but the statement still settles (it may have
    // committed server-side)
    abort.abort()
    respondNext(errorResult)
    const summary = await pending
    // Then the awaited outcome is recorded — never falsified to "cancelled",
    // which would push the agent into re-running a committed write
    expect(summary.success).toBe(false)
    expect(summary.results).toEqual(["ERROR: boom"])
    expect((await persistedView()).cells[0].lastRunStatus).toBe("error")
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeDefined()
  })

  it("statements not yet started when the abort lands are cancelled", async () => {
    // Given a three-statement script whose first statement is in flight
    await seedNotebook({ cells: [cell("a", "SELECT 1; SELECT 2; SELECT 3")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const abort = new AbortController()
    const controller = makeController({}, quest)
    const pending = controller.runCell("a", abort.signal)
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When the abort lands and the in-flight statement then succeeds
    abort.abort()
    respondNext(dqlResult)
    const summary = await pending
    // Then the completed statement keeps its real result and the remainder is
    // cancelled without ever executing
    expect(summary.results).toEqual(["success", "cancelled", "cancelled"])
    expect(inFlight).toHaveLength(0)
  })

  it("drops the result when a concurrent agent edit rewrote the cell's SQL mid-run", async () => {
    // Given a run in flight on a background notebook
    await seedNotebook({ cells: [cell("a", "INSERT INTO t VALUES (1)")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const run = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When another agent call rewrites the cell before the run commits
    await controller.updateCell("a", { value: "SELECT 1" })
    respondNext(dqlResult)
    const summary = await run
    // Then the stale result is not attributed to SQL that never produced it
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/SQL was changed/)
    const view = await persistedView()
    expect(view.cells[0].value).toBe("SELECT 1")
    expect(view.cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("refuses before executing when the checked SQL no longer matches the cell", async () => {
    // Given a cell rewritten after the permission gate read its SQL
    await seedNotebook({ cells: [cell("a", "SELECT 2")] })
    const { quest, pending: inFlight } = makeQuest()
    const controller = makeController({}, quest)
    // When the run is asked to execute the previously checked (now stale) SQL
    const summary = await controller.runCell("a", undefined, "SELECT 1")
    // Then nothing executes — no statement's side effects can land — and the run
    // is refused as safe to retry with the fresh value
    expect(inFlight).toHaveLength(0)
    expect(summary.unverified).toBe(true)
    expect(summary.results).toEqual([])
    expect(summary.note).toMatch(/Run NOT started/)
    expect((await persistedView()).cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("drops the result when a direct mount session opened and closed mid-run", async () => {
    // Given a run in flight on a background notebook
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const run = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When a live session claims the buffer directly (registerController with no
    // beginNotebookMount) and releases it before commit, the bumped mount epoch
    // must still invalidate this straddling run.
    claimLive(BUFFER_ID)
    releaseLive(BUFFER_ID)
    respondNext(dqlResult)
    const summary = await run
    // Then whatever the live session recorded wins over the stale result
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/opened this notebook/)
    expect((await persistedView()).cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("keeps the mount epoch across archive so a run can't commit after restore", async () => {
    // Given a background notebook opened once (epoch bumped) with a run started
    // against it
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    claimLive(BUFFER_ID)
    releaseLive(BUFFER_ID)
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const run = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When the user archives the tab mid-run and later restores + reopens it.
    // Archive must NOT reset the epoch to zero — a restore would then climb back
    // to the run's captured value and let the stale result overwrite the notebook.
    releaseArchivedBuffer(BUFFER_ID)
    claimMounting(BUFFER_ID)
    releaseMounting(BUFFER_ID)
    respondNext(dqlResult)
    const summary = await run
    // Then the restored session's higher epoch still invalidates the stale run
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/opened this notebook/)
    expect((await persistedView()).cells[0].lastRunStatus).toBeUndefined()
    expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
  })

  it("names the removed notebook, not a newer run, when deleted mid-run", async () => {
    // Given a run in flight
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, pending: inFlight, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const run = controller.runCell("a")
    await vi.waitFor(() => {
      if (inFlight.length === 0) throw new Error("not in flight")
    })
    // When the notebook is deleted (deleteBuffer clears run bookkeeping too)
    await db.buffers.delete(BUFFER_ID)
    forgetHeadlessRuns(BUFFER_ID)
    respondNext(dqlResult)
    const summary = await run
    // Then the note names the real reason
    expect(summary.unverified).toBe(true)
    expect(summary.note).toMatch(/notebook was deleted/)
  })

  it("reports the notebook gone when the buffer row vanishes between read and write", async () => {
    // Given a run whose commit-time update hits a deleted row
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const updateSpy = vi.spyOn(bufferStore, "update").mockResolvedValueOnce(0)
    try {
      const run = controller.runCell("a")
      await vi.waitFor(() => respondNext(dqlResult))
      const summary = await run
      // Then no phantom success is reported and no orphan snapshot is written
      expect(summary.unverified).toBe(true)
      expect(summary.note).toMatch(/notebook was deleted/)
      expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
    } finally {
      updateSpy.mockRestore()
    }
  })

  it("reports unverified storage-full when the commit write throws", async () => {
    // Given a run whose commit-time row update rejects (e.g. quota exceeded)
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const updateSpy = vi
      .spyOn(bufferStore, "update")
      .mockRejectedValueOnce(new Error("QuotaExceededError"))
    try {
      const run = controller.runCell("a")
      await vi.waitFor(() => respondNext(dqlResult))
      const summary = await run
      // Then the run is reported unverified with the storage-full note
      expect(summary.unverified).toBe(true)
      expect(summary.note).toMatch(/local storage limit/)
      expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
    } finally {
      updateSpy.mockRestore()
    }
  })

  it("records the run and warns (no re-run) when only the result snapshot cannot be saved", async () => {
    // Given a run that commits the stripped view but whose result-rows snapshot
    // write fails — the run status is durably recorded, only the offline result
    // grid copy is lost, so it must be reported as a success, not "not recorded"
    await seedNotebook({ cells: [cell("a", "SELECT 1")] })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    const seen: AgentEdit[] = []
    onAgentEdit((e) => seen.push(e))
    const putSpy = vi
      .spyOn(db.notebook_results, "put")
      .mockRejectedValueOnce(new Error("QuotaExceededError"))
    try {
      const run = controller.runCell("a")
      await vi.waitFor(() => respondNext(dqlResult))
      const summary = await run
      // Then the run is reported as a recorded success with a soft note that
      // does not push the agent to re-run, and the durable change is notified
      expect(summary.success).toBe(true)
      expect(summary.unverified).toBeFalsy()
      expect(summary.note).toMatch(/No re-run is needed/)
      expect(seen).toEqual([{ bufferId: BUFFER_ID, cellId: "a" }])
      // The result-rows snapshot itself was not saved
      expect(await loadCellSnapshot(BUFFER_ID, "a")).toBeUndefined()
    } finally {
      putSpy.mockRestore()
    }
  })
})

describe("createDexieNotebookController — field preservation", () => {
  const chartFor = (xColumn: string) => ({ xColumn, queries: [] })

  it("a headless run commit keeps the run cell's rich state and never touches siblings or settings", async () => {
    // Given a background notebook whose run cell "a" carries auto-refresh, a
    // chart config, and view-maximize, a sibling "b" with its own chart, and
    // notebook-level variables + grid layout
    await seedNotebook({
      cells: [
        cell("a", "SELECT 1", {
          autoRefresh: "5s",
          chartConfig: chartFor("ts"),
          isViewMaximized: true,
        }),
        cell("b", "SELECT 2", { position: 1, chartConfig: chartFor("sym") }),
      ],
      settings: {
        layoutMode: "grid",
        layout: [
          { i: "a", x: 0, y: 0, w: 12, h: 4 },
          { i: "b", x: 0, y: 4, w: 12, h: 4 },
        ],
        variables: [{ name: "sym", value: "'AAPL'" }],
      },
    })
    const { quest, respondNext } = makeQuest()
    const controller = makeController({}, quest)
    // When the agent runs "a" to a successful commit
    const pending = controller.runCell("a")
    await vi.waitFor(() => respondNext(dqlResult))
    const summary = await pending
    // Then the run succeeds
    expect(summary).toMatchObject({ success: true })
    const view = await persistedView()
    const a = view.cells.find((c) => c.id === "a")
    const b = view.cells.find((c) => c.id === "b")
    // And "a" keeps every field the commit had no business dropping
    expect(a).toMatchObject({
      autoRefresh: "5s",
      chartConfig: chartFor("ts"),
      isViewMaximized: true,
      lastRunStatus: "success",
    })
    // And the untouched sibling and notebook settings survive intact
    expect(b).toMatchObject({ value: "SELECT 2", chartConfig: chartFor("sym") })
    expect(b?.lastRunStatus).toBeUndefined()
    expect(view.settings?.variables).toEqual([{ name: "sym", value: "'AAPL'" }])
    expect(view.settings?.layout).toEqual([
      { i: "a", x: 0, y: 0, w: 12, h: 4 },
      { i: "b", x: 0, y: 4, w: 12, h: 4 },
    ])
  })

  it("updateCell patches its target without dropping a sibling's chart or the notebook variables", async () => {
    // Given a notebook where the sibling and settings carry state the patch
    // has no reason to touch
    await seedNotebook({
      cells: [
        cell("a", "old"),
        cell("b", "keep", { position: 1, chartConfig: chartFor("sym") }),
      ],
      settings: { variables: [{ name: "sym", value: "'AAPL'" }] },
    })
    const controller = makeController()
    // When cell "a" is updated
    await controller.updateCell("a", { value: "new" })
    // Then only "a" changed; the sibling's chart and the variables survive
    const view = await persistedView()
    expect(view.cells.find((c) => c.id === "a")?.value).toBe("new")
    expect(view.cells.find((c) => c.id === "b")?.chartConfig).toEqual(
      chartFor("sym"),
    )
    expect(view.settings?.variables).toEqual([{ name: "sym", value: "'AAPL'" }])
  })
})

describe("createDexieNotebookController — persisted snapshot cap", () => {
  it("never keeps results for more than 10 notebooks", async () => {
    // Given snapshots persisted for 11 different notebooks
    for (let bufferId = 1; bufferId <= 11; bufferId++) {
      await persistCellSnapshot({
        bufferId,
        cellId: "c",
        results: [],
        savedAt: bufferId,
      })
    }
    // Then only the 10 most recent notebooks keep persisted results
    const rows = await db.notebook_results.toArray()
    const notebooks = new Set(rows.map((r) => r.bufferId))
    expect(notebooks.size).toBe(10)
    expect(notebooks.has(1)).toBe(false)
  })
})
