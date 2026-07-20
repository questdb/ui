import "../../test/stubBrowserGlobals"
import { describe, it, expect, beforeEach, vi } from "vitest"

import {
  __resetNotebookAIBridgeForTests,
  emitUserAction,
  getBufferActionSeq,
  getWorkspace,
  on,
  registerWorkspace,
  unregisterWorkspace,
  type NotebookWorkspaceController,
  type UserActionEvent,
} from "./notebookAIBridge"
import { NotebookToolError } from "./notebookToolError"
import {
  __resetNotebookControllerForTests,
  beginNotebookMount,
  cancelNotebookMount,
  createNotebookController,
  getBufferMode,
  getController,
  registerController,
  unregisterController,
  waitForController,
  withBoundNotebook,
  type NotebookController,
  type NotebookControllerActions,
} from "./notebookController"
import {
  summarizeCellResults,
  SUPERSEDED_RUN_NOTE,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { __resetNotebookBufferQueuesForTests } from "./notebookBufferQueue"
import {
  __resetNotebookDexieControllerForTests,
  addCellTransition,
  applyNotebookStateTransition,
  setLayoutModeTransition,
  type NotebookTransitionResult,
} from "./notebookController"
import { generateId } from "../../scenes/Editor/Notebook/notebookUtils"
import type { ViewParts } from "./notebookDexieView"
import { db } from "../../store/db"
import { bufferStore } from "../../store/buffers"
import {
  type CellResult,
  type NotebookCell,
  type NotebookViewState,
} from "../../store/notebook"

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
  readView: () => Promise.resolve(emptyState),
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  ...overrides,
})

const makeWorkspace = (
  overrides: Partial<NotebookWorkspaceController> = {},
): NotebookWorkspaceController => ({
  createNotebook: ({ label }) =>
    Promise.resolve({ bufferId: 1, label: label ?? "Notebook" }),
  duplicateNotebook: ({ bufferId }) =>
    Promise.resolve({ bufferId, label: "Notebook (copy)" }),
  deleteNotebook: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  listNotebookBuffers: () => [],
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

describe("controller registry", () => {
  it("get returns the registered controller", () => {
    const c = makeController(42)
    registerController(c)
    expect(getController(42)).toBe(c)
  })

  it("unregister removes the controller", () => {
    registerController(makeController(42))
    unregisterController(42)
    expect(getController(42)).toBeUndefined()
  })

  it("re-register replaces the previous controller", async () => {
    const first = makeController(42, {
      readView: () => Promise.resolve({ cells: [], maximizedCellId: "first" }),
    })
    const second = makeController(42, {
      readView: () => Promise.resolve({ cells: [], maximizedCellId: "second" }),
    })
    registerController(first)
    registerController(second)
    await expect(
      getController(42)
        ?.readView()
        .then((v) => v.maximizedCellId),
    ).resolves.toBe("second")
  })
})

describe("waitForController", () => {
  it("resolves immediately when the controller is already registered", async () => {
    const c = makeController(42)
    registerController(c)
    await expect(waitForController(42, 100)).resolves.toBe(c)
  })

  it("resolves a pending wait as soon as the controller registers", async () => {
    const pending = waitForController(42, 500)
    setTimeout(() => registerController(makeController(42)), 10)
    await expect(pending).resolves.toMatchObject({ bufferId: 42 })
  })

  it("supports multiple concurrent waiters for the same bufferId", async () => {
    const a = waitForController(42, 500)
    const b = waitForController(42, 500)
    const controller = makeController(42)
    registerController(controller)
    const [resA, resB] = await Promise.all([a, b])
    expect(resA).toBe(controller)
    expect(resB).toBe(controller)
  })

  it("rejects with a typed activation_failed error after timeoutMs", async () => {
    // Given no controller ever registers
    // When the waiter times out
    const err: unknown = await waitForController(42, 20).catch(
      (e: unknown) => e,
    )
    // Then the model receives a typed, retryable error — not a generic failure
    expect(err).toBeInstanceOf(NotebookToolError)
    expect((err as NotebookToolError).code).toBe("activation_failed")
    expect((err as NotebookToolError).message).toMatch(
      /did not finish mounting within 20ms/,
    )
  })

  it("does not reject a waiter that already resolved before timeout fires", async () => {
    const pending = waitForController(42, 50)
    registerController(makeController(42))
    await pending
    // Wait past the original timeout to ensure no stale rejection fires.
    await new Promise((r) => setTimeout(r, 60))
    const second = waitForController(42, 50)
    await expect(second).resolves.toMatchObject({ bufferId: 42 })
  })
})

describe("workspace registry", () => {
  it("registerWorkspace replaces the prior workspace", () => {
    const a = makeWorkspace()
    const b = makeWorkspace()
    registerWorkspace(a)
    registerWorkspace(b)
    expect(getWorkspace()).toBe(b)
  })

  it("unregisterWorkspace clears it", () => {
    registerWorkspace(makeWorkspace())
    unregisterWorkspace()
    expect(getWorkspace()).toBeUndefined()
  })
})

describe("emitUserAction / on", () => {
  it("fans out events to every subscriber", () => {
    const seen: UserActionEvent[][] = [[], []]
    on("user-action", (e) => seen[0].push(e))
    on("user-action", (e) => seen[1].push(e))
    const evt: UserActionEvent = {
      kind: "user_added_cell",
      bufferId: 1,
      cellId: "c",
    }
    emitUserAction(evt)
    expect(seen[0]).toEqual([evt])
    expect(seen[1]).toEqual([evt])
  })

  it("returned unsubscribe removes the listener", () => {
    const seen: UserActionEvent[] = []
    const off = on("user-action", (e) => seen.push(e))
    off()
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "c" })
    expect(seen).toEqual([])
  })

  it("a throwing subscriber does not break other subscribers", () => {
    const seen: UserActionEvent[] = []
    on("user-action", () => {
      throw new Error("boom")
    })
    on("user-action", (e) => seen.push(e))
    emitUserAction({ kind: "user_added_cell", bufferId: 1, cellId: "c" })
    expect(seen).toHaveLength(1)
  })
})

describe("emitUserAction — freshness seq", () => {
  beforeEach(() => __resetNotebookAIBridgeForTests())

  it("does not advance the buffer seq for a cell-typing digest", () => {
    // Given typing already staled the buffer synchronously via signalUserEdit
    const before = getBufferActionSeq(1)

    // When the debounced user_updated_cell digest fires
    emitUserAction({ kind: "user_updated_cell", bufferId: 1, cellId: "c" })

    // Then it does not stale the buffer a second time
    expect(getBufferActionSeq(1)).toBe(before)
  })

  it("advances the buffer seq for every structural user action", () => {
    // Given the structural user actions that must stale a racing agent write
    const structural: UserActionEvent[] = [
      { kind: "user_added_cell", bufferId: 1, cellId: "c" },
      { kind: "user_deleted_cell", bufferId: 1, cellId: "c" },
      { kind: "user_moved_cell", bufferId: 1, cellId: "c" },
      {
        kind: "user_duplicated_cell",
        bufferId: 1,
        cellId: "c",
        newCellId: "d",
      },
      { kind: "user_ran_cell", bufferId: 1, cellId: "c", status: "success" },
      { kind: "user_changed_layout_mode", bufferId: 1, mode: "grid" },
      {
        kind: "user_changed_cell_mode",
        bufferId: 1,
        cellId: "c",
        mode: "draw",
      },
      { kind: "user_changed_grid_layout", bufferId: 1 },
      { kind: "user_archived_notebook", bufferId: 1 },
      { kind: "user_deleted_notebook", bufferId: 1 },
    ]

    // When / Then each action advances the seq
    for (const evt of structural) {
      const before = getBufferActionSeq(1)
      emitUserAction(evt)
      expect(getBufferActionSeq(1)).toBeGreaterThan(before)
    }
  })
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

describe("summarizeCellResults", () => {
  const cellWith = (results: CellResult["results"]): NotebookCell =>
    ({
      id: "c1",
      value: "select 1",
      mode: "run",
      result: { results, activeResultIndex: 0, timestamp: 0 },
    }) as unknown as NotebookCell

  it("reports success only when all entries are terminal-success", () => {
    expect(
      summarizeCellResults(
        cellWith([{ type: "dql" } as never, { type: "ddl" } as never]),
      ),
    ).toEqual({ success: true, queryCount: 2, results: ["success", "success"] })
  })

  it("reports a non-terminal running/queued entry as pending, without success", () => {
    // Reachable via a superseded agent run, or the notebook backgrounded mid-run.
    // The agent isn't told success and sees `pending` verbatim; it is NOT flagged
    // unverified — only an unverifiable-error marker does that.
    const running = summarizeCellResults(
      cellWith([{ type: "running" } as never]),
    )
    expect(running.success).toBe(false)
    expect(running.results).toEqual(["pending"])
    expect(running.unverified).toBeUndefined()
    expect(
      summarizeCellResults(cellWith([{ type: "queued" } as never])).unverified,
    ).toBeUndefined()
  })

  it("does NOT mark a success/error-only result unverified", () => {
    expect(
      summarizeCellResults(
        cellWith([{ type: "dml" } as never, { type: "dml" } as never]),
      ).unverified,
    ).toBeUndefined()
    expect(
      summarizeCellResults(
        cellWith([
          { type: "dml" } as never,
          { type: "error", error: "x" },
        ] as never),
      ).unverified,
    ).toBeUndefined()
  })

  // An unverifiable-error entry (the write may have committed server-side) is
  // flagged unverified so the agent verifies instead of re-running a duplicate.
  // A user cancel surfaces verbatim as `error: "Cancelled by user"`, a marker.
  it("marks an unverifiable-error entry (Cancelled by user) unverified", () => {
    const r = summarizeCellResults(
      cellWith([
        { type: "dml" } as never,
        { type: "error", error: "Cancelled by user" } as never,
      ]),
    )
    expect(r.success).toBe(false)
    expect(r.unverified).toBe(true)
    expect(typeof r.note).toBe("string")
  })

  it("flags a transport-dropped error (QuestDB is not reachable) unverified", () => {
    const r = summarizeCellResults(
      cellWith([
        { type: "error", error: "QuestDB is not reachable [504]" } as never,
      ]),
    )
    expect(r.unverified).toBe(true)
    expect(typeof r.note).toBe("string")
  })

  it("surfaces cancelled (skipped) and plain-error entries verbatim, not unverified", () => {
    const r = summarizeCellResults(
      cellWith([
        { type: "cancelled" } as never,
        { type: "error", error: "boom" } as never,
      ]),
    )
    expect(r.success).toBe(false)
    expect(r.queryCount).toBe(2)
    expect(r.results).toEqual(["cancelled", "ERROR: boom"])
    expect(r.unverified).toBeUndefined()
  })

  it("reports failure for a cell with no result", () => {
    expect(summarizeCellResults(undefined)).toEqual({
      success: false,
      queryCount: 0,
      results: [],
    })
  })
})

describe("createNotebookController — applyNotebookState maximized cell id", () => {
  const cellA: NotebookCell = { id: "a", position: 0, value: "SELECT 1" }
  const cellB: NotebookCell = { id: "b", position: 1, value: "SELECT 2" }

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
      setCellViewMaximized: () => undefined,
      setMaximizedCellId: vi.fn(),
      updateCells: () => undefined,
      applyTransition: <T>(
        run: (parts: ViewParts) => NotebookTransitionResult<T>,
      ): T => {
        const out = run({
          cells: prevCells,
          settings: {},
          maximizedCellId: currentMaximizedId,
          focusedCellId: null,
        })
        applied.parts = out.parts
        return out.result
      },
      getCellsSnapshot: () => prevCells,
      getSettings: () => ({}),
      getMaximizedCellId: () => currentMaximizedId,
    }
    return { live, applied }
  }

  it("clears a provided maximized id that does not survive the apply", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    // Stale echo: cell "a" is dropped while the request still spotlights it.
    await controller.mutate((p) =>
      applyNotebookStateTransition(p, {
        cells: [{ id: "b", value: "SELECT 2" }],
        maximizedCellId: "a",
      }),
    )
    expect(applied.parts?.maximizedCellId).toBe(null)
  })

  it("keeps a provided maximized id that exists in the applied cells", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    await controller.mutate((p) =>
      applyNotebookStateTransition(p, {
        cells: [
          { id: "a", value: "SELECT 1" },
          { id: "b", value: "SELECT 2" },
        ],
        maximizedCellId: "b",
      }),
    )
    expect(applied.parts?.maximizedCellId).toBe("b")
  })

  it("clears the current maximized id when the field is omitted and its cell is deleted", async () => {
    const { live, applied } = makeLiveActions([cellA, cellB], "a")
    const controller = createNotebookController(1, { current: live })
    await controller.mutate((p) =>
      applyNotebookStateTransition(p, {
        cells: [{ id: "b", value: "SELECT 2" }],
      }),
    )
    expect(applied.parts?.maximizedCellId).toBe(null)
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
      run({
        cells: snapshot(),
        settings: {},
        maximizedCellId: null,
        focusedCellId: null,
      }).result,
    getCellsSnapshot: snapshot,
    getSettings: () => ({}),
    getMaximizedCellId: () => null,
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
