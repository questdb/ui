import "../../../src/test/stubBrowserGlobals"
import { describe, it, expect, beforeEach, vi } from "vitest"

import { __resetNotebookAIBridgeForTests } from "../../../src/utils/notebooks/notebookAIBridge"
import { NotebookToolError } from "../../../src/utils/notebooks/notebookToolError"
import {
  __resetNotebookControllerForTests,
  beginNotebookMount,
  cancelNotebookMount,
  createNotebookController,
  getBufferMode,
  registerController,
  unregisterController,
  withBoundNotebook,
  type NotebookController,
  type NotebookControllerActions,
} from "../../../src/utils/notebooks/notebookController"
import {
  cancelledBeforeRunNote,
  CELL_DELETED_MID_RUN_NOTE,
  SUPERSEDED_RUN_NOTE,
} from "../../../src/scenes/Editor/Notebook/runCancellation"
import { __resetNotebookBufferQueuesForTests } from "../../../src/utils/notebooks/notebookBufferQueue"
import {
  __resetNotebookDexieControllerForTests,
  addCellTransition,
  applyNotebookStateTransition,
  setLayoutModeTransition,
  type NotebookTransitionResult,
} from "../../../src/utils/notebooks/notebookController"
import { generateId } from "../../../src/scenes/Editor/Notebook/notebookUtils"
import type { ViewParts } from "../../../src/utils/notebooks/notebookDexieView"
import { db } from "../../../src/store/db"
import { bufferStore } from "../../../src/store/buffers"
import {
  loadCellSnapshot,
  saveCellSnapshot,
} from "../../../src/store/notebookResults"
import {
  type CellResult,
  type NotebookCell,
  type NotebookViewState,
} from "../../../src/store/notebook"
import type { CellResultStatusReader } from "../../../src/scenes/Editor/Notebook/cellSizing"

const unrequested: CellResultStatusReader = () => "unrequested"

const emptyState: NotebookViewState = { cells: [] }

const makeController = (
  bufferId: number,
  overrides: Partial<NotebookController> = {},
): NotebookController => ({
  bufferId,
  kind: "live",
  mutate: (transition) =>
    Promise.resolve(
      transition({
        cells: [],
        settings: {},
        maximizedCellId: null,
        focusedCellId: null,
      }).result,
    ),
  mutateWithResultStatus: (transition) =>
    Promise.resolve(
      transition(
        {
          cells: [],
          settings: {},
          maximizedCellId: null,
          focusedCellId: null,
        },
        () => "unrequested",
      ).result,
    ),
  readView: () => Promise.resolve(emptyState),
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  ...overrides,
})

const seedNotebookBuffer = (
  id: number,
  view: NotebookViewState = emptyState,
  opts: { archived?: boolean } = {},
) =>
  db.buffers.put({
    id,
    label: `nb-${id}`,
    value: "",
    position: 0,
    ...(opts.archived ? { archived: true } : {}),
    notebookViewState: view,
  })

beforeEach(async () => {
  __resetNotebookControllerForTests()
  __resetNotebookAIBridgeForTests()
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieControllerForTests()
  await db.buffers.clear()
})

describe("withBoundNotebook", () => {
  it("maps a missing buffer to deleted", async () => {
    // Given no buffer 1 exists anywhere
    // When a mutation is bound to it
    const err: unknown = await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "list")),
    ).catch((e: unknown) => e)
    // Then the typed lifecycle error surfaces
    expect(err).toBeInstanceOf(NotebookToolError)
    expect((err as NotebookToolError).code).toBe("deleted")
  })

  it("maps a non-notebook buffer to not_a_notebook", async () => {
    // Given buffer 1 is a plain SQL tab
    await db.buffers.put({
      id: 1,
      label: "sql",
      value: "SELECT 1",
      position: 0,
    })
    // When a mutation is bound to it
    const err: unknown = await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "list")),
    ).catch((e: unknown) => e)
    // Then it is rejected as not a notebook
    expect((err as NotebookToolError).code).toBe("not_a_notebook")
  })

  it("maps an archived buffer to archived", async () => {
    // Given buffer 1 is archived
    await seedNotebookBuffer(1, emptyState, { archived: true })
    // When a mutation is bound to it
    const err: unknown = await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "list")),
    ).catch((e: unknown) => e)
    // Then it is rejected as archived
    expect((err as NotebookToolError).code).toBe("archived")
  })

  it("writes to Dexie for an unmounted notebook without any registration", async () => {
    // Given a persisted background notebook and no workspace/controller at all
    await seedNotebookBuffer(1, { cells: [] })
    // When the agent mutates it
    await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "grid")),
    )
    // Then the change is durable in the buffer store
    const buffer = await db.buffers.get(1)
    expect(buffer?.notebookViewState?.settings?.layoutMode).toBe("grid")
  })

  it("passes the live controller through when the buffer is mounted", async () => {
    const c = makeController(1)
    registerController(c)
    const out = await withBoundNotebook(1, (ctrl) =>
      Promise.resolve(ctrl.bufferId),
    )
    expect(out).toBe(1)
  })

  it("propagates errors thrown by the inner function", async () => {
    registerController(makeController(1))
    await expect(
      withBoundNotebook(1, () => Promise.reject(new Error("inner"))),
    ).rejects.toThrow(/inner/)
  })
})

// The live apply routes through applyTransition, so the mock runs the
// transition against the current parts and captures the committed result —
// exactly what the mounted provider would write.
const makeLiveActions = (
  prevCells: NotebookCell[],
  currentMaximizedId: string | null = null,
) => {
  const applied: { parts?: ViewParts } = {}
  const live = {
    addCell: () => "new",
    updateCell: () => undefined,
    deleteCell: () => undefined,
    moveCellUp: () => undefined,
    moveCellDown: () => undefined,
    duplicateCell: () => "dup",
    runCell: () => Promise.resolve({ ok: true, superseded: false }),
    updateSettings: () => undefined,
    setCellMode: () => undefined,
    setCellChartConfig: () => undefined,
    setCellPaneView: () => undefined,
    setMaximizedCellId: vi.fn(),
    updateCells: () => undefined,
    applyTransition: <T>(
      run: (parts: ViewParts) => NotebookTransitionResult<T>,
    ): Promise<T> => {
      const out = run({
        cells: prevCells,
        settings: {},
        maximizedCellId: currentMaximizedId,
        focusedCellId: null,
      })
      applied.parts = out.parts
      return Promise.resolve(out.result)
    },
    getCellsSnapshot: () => prevCells,
    getSettings: () => ({}),
    getMaximizedCellId: () => currentMaximizedId,
    flushChartSnapshots: () => Promise.resolve(),
    readRefreshState: () => new Map(),
    readResultStatus: () => "unrequested" as const,
    noteResultMissing: vi.fn(),
  }
  return { live, applied }
}

describe("createNotebookController — applyNotebookState maximized cell id", () => {
  const cellA: NotebookCell = { id: "a", position: 0, value: "SELECT 1" }
  const cellB: NotebookCell = { id: "b", position: 1, value: "SELECT 2" }

  it("reads a cell's snapshot-load status through the live actions", () => {
    // Given a live controller whose provider reports per-cell statuses
    const { live } = makeLiveActions([cellA])
    const controller = createNotebookController(1, {
      current: {
        ...live,
        readResultStatus: (id) => (id === "a" ? "loaded" : "unrequested"),
      },
    })
    // When the controller is asked for a known and an unknown cell
    const known = controller.readResultStatus?.("a")
    const unknown = controller.readResultStatus?.("zzz")
    // Then the controller delegates mount-independently
    expect(known).toBe("loaded")
    expect(unknown).toBe("unrequested")
  })

  it("clears a provided maximized id that does not survive the apply", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    // Stale echo: cell "a" is dropped while the request still spotlights it.
    await controller.mutate((p) =>
      applyNotebookStateTransition(
        p,
        {
          cells: [{ id: "b", value: "SELECT 2" }],
          maximizedCellId: "a",
        },
        unrequested,
      ),
    )
    expect(applied.parts?.maximizedCellId).toBe(null)
  })

  it("keeps a provided maximized id that exists in the applied cells", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    await controller.mutate((p) =>
      applyNotebookStateTransition(
        p,
        {
          cells: [
            { id: "a", value: "SELECT 1" },
            { id: "b", value: "SELECT 2" },
          ],
          maximizedCellId: "b",
        },
        unrequested,
      ),
    )
    expect(applied.parts?.maximizedCellId).toBe("b")
  })

  it("clears the current maximized id when the field is omitted and its cell is deleted", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB], "a")
    const controller = createNotebookController(1, { current: live })
    await controller.mutate((p) =>
      applyNotebookStateTransition(
        p,
        {
          cells: [{ id: "b", value: "SELECT 2" }],
        },
        unrequested,
      ),
    )
    expect(applied.parts?.maximizedCellId).toBe(null)
  })
})

describe("createNotebookController — applyNotebookState cleared results", () => {
  beforeEach(async () => {
    await db.notebook_results.clear()
  })

  it("reports a released cell whose stored snapshot the rewrite outdates, and drops the snapshot", async () => {
    // Given a released cell: its result lives only in its snapshot
    const released: NotebookCell = { id: "a", position: 0, value: "SELECT 1" }
    await saveCellSnapshot({
      bufferId: 1,
      cellId: "a",
      results: [
        { type: "dql", query: "SELECT 1", columns: [], dataset: [], count: 1 },
      ],
      savedAt: 1,
    })
    const { live } = makeLiveActions([released])
    const controller = createNotebookController(1, { current: live })

    // When an apply rewrites its only statement
    const out = await controller.mutate((p) =>
      applyNotebookStateTransition(
        p,
        {
          cells: [{ id: "a", value: "SELECT 2" }],
        },
        unrequested,
      ),
    )

    // Then the cell is reported as cleared
    expect(out.resultsCleared).toEqual(["a"])

    // And its result is gone, like on the passive route
    expect(await loadCellSnapshot(1, "a")).toBeUndefined()
    expect(live.noteResultMissing).toHaveBeenCalledWith("a")
  })
})

describe("createNotebookController — live runCell supersession", () => {
  const cellId = "c1"

  const liveActions = (
    snapshot: () => NotebookCell[],
    runCell: NotebookControllerActions["runCell"],
  ): NotebookControllerActions => ({
    runCell,
    applyTransition: (run) =>
      Promise.resolve(
        run({
          cells: snapshot(),
          settings: {},
          maximizedCellId: null,
          focusedCellId: null,
        }).result,
      ),
    getCellsSnapshot: snapshot,
    getSettings: () => ({}),
    getMaximizedCellId: () => null,
    flushChartSnapshots: () => Promise.resolve(),
    readRefreshState: () => new Map(),
    readResultStatus: () => "unrequested" as const,
    noteResultMissing: () => undefined,
  })

  const cellWith = (result: CellResult): NotebookCell => ({
    id: cellId,
    position: 0,
    value: "INSERT INTO t VALUES (1)",
    result,
  })

  const dmlResult = (timestamp: number): CellResult => ({
    results: [{ type: "dml", query: "INSERT INTO t VALUES (1)" }],
    activeResultIndex: 0,
    timestamp,
  })

  it("reports a superseded live run as unverified instead of the newer run's result", async () => {
    // Given the agent's run committed, but the user's manual run then replaced
    // the cell with a still-pending result of their own.
    const committed = dmlResult(1)
    const userPending: CellResult = {
      results: [{ type: "running", query: "INSERT INTO t VALUES (1)" }],
      activeResultIndex: 0,
      timestamp: 2,
    }
    let current = committed
    const snapshot = () => [cellWith(current)]

    // When the live run signals it was superseded (its result discarded).
    const runCell = () => {
      current = userPending
      return Promise.resolve({ ok: true, superseded: true })
    }
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })
    const summary = await controller.runCell(cellId)

    // Then the agent is told to re-sync, not handed the user's pending result.
    expect(summary.unverified).toBe(true)
    expect(summary.note).toBe(SUPERSEDED_RUN_NOTE)
    expect(summary.results).toEqual([])
  })

  it("reports a live run whose cell was deleted mid-flight as deleted, not cleared", async () => {
    // Given the agent's run launched, then the user deleted the cell while it
    // ran: the mounted runner supersedes the run and carries the reason.
    let cells = [cellWith(dmlResult(1))]
    const snapshot = () => cells
    const runCell = () => {
      cells = []
      return Promise.resolve({
        ok: false,
        superseded: true,
        cancelled: "cell_deleted" as const,
      })
    }
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })

    // When the run resolves
    const summary = await controller.runCell(cellId)

    // Then the agent learns the cell is gone, with nothing to trust as a result
    expect(summary.cancelled).toBe("cell_deleted")
    expect(summary.note).toBe(CELL_DELETED_MID_RUN_NOTE)
    expect(summary.unverified).toBe(true)
    expect(summary.results).toEqual([])
  })

  it("reports a run the user stopped during validation as not started", async () => {
    // Given the user pressed Stop while the mounted runner was still validating,
    // so it reports a cancelled run that never launched.
    const unchanged = dmlResult(1)
    const snapshot = () => [cellWith(unchanged)]
    const runCell = () =>
      Promise.resolve({
        ok: false,
        superseded: false,
        notStarted: true,
        cancelled: "cancelled" as const,
      })
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })

    // When the run resolves
    const summary = await controller.runCell(cellId)

    // Then the agent is told nothing executed and that a re-run is safe,
    // not handed a bare failure
    expect(summary.success).toBe(false)
    expect(summary.cancelled).toBe("cancelled")
    expect(summary.note).toBe(cancelledBeforeRunNote("cancelled"))
    expect(summary.unverified).toBeUndefined()
    expect(summary.results).toEqual([])
  })

  it("summarizes the outcome's result even when cell.result has diverged", async () => {
    // Given a run whose recorded result is immediately replaced in the cell by
    // an independent write (as a draw auto-refresh frame would), while the
    // outcome still carries the run's own result.
    const recorded = dmlResult(2)
    const refreshMirror: CellResult = {
      results: [
        {
          type: "error",
          query: "INSERT INTO t VALUES (1)",
          error: "mirror frame",
        },
      ],
      activeResultIndex: 0,
      timestamp: 3,
    }
    let current = dmlResult(1)
    const snapshot = () => [cellWith(current)]
    const runCell = () => {
      current = refreshMirror
      return Promise.resolve({ ok: true, superseded: false, result: recorded })
    }
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })

    // When the run completes.
    const summary = await controller.runCell(cellId)

    // Then the summary reflects the outcome's result, not the cell's mirror.
    expect(summary.success).toBe(true)
    expect(summary.results).toEqual(["success"])
  })

  it("summarizes a normally-recorded live run from the cell", async () => {
    // Given a run that records a fresh result over the prior one and reports
    // it in the outcome (cell.result alone can be an auto-refresh mirror).
    let current = dmlResult(1)
    const snapshot = () => [cellWith(current)]
    const runCell = () => {
      const recorded = dmlResult(2)
      current = recorded
      return Promise.resolve({ ok: true, superseded: false, result: recorded })
    }
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })

    // When the run completes without being superseded.
    const summary = await controller.runCell(cellId)

    // Then it reflects the recorded result with no supersede note.
    expect(summary.success).toBe(true)
    expect(summary.results).toEqual(["success"])
    expect(summary.note).toBeUndefined()
  })

  it("returns an empty summary when a non-superseded run records nothing new", async () => {
    // Given a run that leaves the cell's result unchanged (no-op / markdown).
    const unchanged = dmlResult(1)
    const snapshot = () => [cellWith(unchanged)]
    const runCell = () => Promise.resolve({ ok: false, superseded: false })
    const controller = createNotebookController(1, {
      current: liveActions(snapshot, runCell),
    })

    // When the run completes.
    const summary = await controller.runCell(cellId)

    // Then nothing is attributed to it.
    expect(summary.success).toBe(false)
    expect(summary.queryCount).toBe(0)
  })
})

describe("mount handoff", () => {
  it("an op enqueued before the mount claim is visible in the seed", async () => {
    // Given a background notebook with an agent write already queued
    await seedNotebookBuffer(1, { cells: [] })
    const write = withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) =>
        addCellTransition(p, 1, { id: generateId(), value: "SELECT 1" }),
      ),
    )
    // When the mount begins immediately after
    const seed = await beginNotebookMount(1)
    await write
    // Then the seed contains the agent's cell
    if (seed instanceof NotebookToolError) throw seed
    expect(seed.cells.map((c) => c.value)).toEqual(["SELECT 1"])
  })

  it("a mutation racing the mount claim is rejected instead of committing behind the seed", async () => {
    // Given a background notebook and an agent op that has completed its read
    await seedNotebookBuffer(1, { cells: [] })
    let seed: Promise<NotebookViewState | NotebookToolError | undefined> =
      Promise.resolve(undefined)
    const op = withBoundNotebook(1, async (ctrl) => {
      await ctrl.readView()
      // When the user opens the tab between the op's read and its write
      seed = beginNotebookMount(1)
      return ctrl.mutate((p) =>
        addCellTransition(p, 1, { id: generateId(), value: "SELECT 1" }),
      )
    })
    // Then the write is refused with a retryable error, and neither the seed
    // nor Dexie ever held a cell the mounted provider would have erased
    await expect(op).rejects.toMatchObject({ code: "mounted_mid_edit" })
    const seededView = await seed
    if (seededView instanceof NotebookToolError) throw seededView
    expect(seededView?.cells).toEqual([])
    expect((await db.buffers.get(1))?.notebookViewState?.cells).toEqual([])
  })

  it("an op arriving after the mount claim waits for the live controller", async () => {
    // Given a mount in progress
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    const mutate = vi.fn(() => Promise.resolve("live-cell"))
    // When an agent op arrives before the provider registered
    const op = withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) =>
        addCellTransition(p, 1, { id: generateId(), value: "SELECT 1" }),
      ),
    )
    registerController(
      makeController(1, {
        mutate: mutate as unknown as NotebookController["mutate"],
      }),
    )
    // Then it applies through the live controller, not Dexie
    await expect(op).resolves.toBe("live-cell")
    expect(mutate).toHaveBeenCalled()
    expect((await db.buffers.get(1))?.notebookViewState?.cells).toEqual([])
  })

  it("cancelNotebookMount restores Dexie routing when the provider never mounted", async () => {
    // Given a claim that is abandoned (tab switched away before the seed landed)
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    cancelNotebookMount(1)
    // When the agent mutates the buffer
    await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "grid")),
    )
    // Then the write went straight to Dexie
    expect(
      (await db.buffers.get(1))?.notebookViewState?.settings?.layoutMode,
    ).toBe("grid")
  })

  it("an op parked behind a cancelled mount claim falls back to the Dexie route", async () => {
    // Given a mount in progress with an agent op waiting for the controller
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    const op = withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "grid")),
    )
    // When the user switches away before the provider registers
    cancelNotebookMount(1)
    // Then the op completes through Dexie instead of stalling into a timeout
    await op
    expect(
      (await db.buffers.get(1))?.notebookViewState?.settings?.layoutMode,
    ).toBe("grid")
  })

  it("cancelNotebookMount never releases a live claim", async () => {
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    registerController(makeController(1))
    cancelNotebookMount(1)
    expect(getBufferMode(1)).toBe("live")
  })

  it("beginNotebookMount on a missing buffer resolves the typed error and releases the claim", async () => {
    const seed = await beginNotebookMount(99)
    expect(seed).toBeInstanceOf(NotebookToolError)
    expect((seed as NotebookToolError).code).toBe("deleted")
    expect(getBufferMode(99)).toBeUndefined()
  })

  it("unmount releases the claim so agent ops go back to Dexie", async () => {
    // Given a mounted notebook
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    registerController(makeController(1))
    // When the provider unmounts
    unregisterController(1)
    // Then the next agent op writes Dexie again
    await withBoundNotebook(1, (ctrl) =>
      ctrl.mutate((p) => setLayoutModeTransition(p, "grid")),
    )
    expect(
      (await db.buffers.get(1))?.notebookViewState?.settings?.layoutMode,
    ).toBe("grid")
  })

  it("an already-aborted signal rejects before anything is read or written", async () => {
    await seedNotebookBuffer(1, { cells: [] })
    const abort = new AbortController()
    abort.abort()
    await expect(
      withBoundNotebook(
        1,
        (ctrl) => ctrl.mutate((p) => setLayoutModeTransition(p, "grid")),
        abort.signal,
      ),
    ).rejects.toThrow(/Aborted/)
    expect(
      (await db.buffers.get(1))?.notebookViewState?.settings?.layoutMode,
    ).toBeUndefined()
  })

  it("a mount claim whose controller never registers times out at 3s and never falls back to Dexie", async () => {
    // Given a claimed buffer whose provider never registers a live controller
    await seedNotebookBuffer(1, { cells: [] })
    await beginNotebookMount(1)
    const fn = vi.fn((ctrl: NotebookController) => Promise.resolve(ctrl.kind))
    const commitSpy = vi.spyOn(bufferStore, "update")
    vi.useFakeTimers()
    try {
      // When a bound op waits past the 3000ms activation window
      const op = withBoundNotebook(1, fn)
      const settled = op.catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(3000)
      const err = await settled
      // Then it rejects with the typed activation_failed error
      expect(err).toBeInstanceOf(NotebookToolError)
      expect((err as NotebookToolError).code).toBe("activation_failed")
      // And the Dexie route was never taken — no controller ran, nothing wrote
      expect(fn).not.toHaveBeenCalled()
      expect(commitSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      commitSpy.mockRestore()
    }
  })
})
