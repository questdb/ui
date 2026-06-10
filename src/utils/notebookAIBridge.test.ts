import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  __resetNotebookAIBridgeForTests,
  createNotebookController,
  emitUserAction,
  getController,
  getWorkspace,
  NotebookToolError,
  on,
  registerController,
  registerWorkspace,
  summarizeCellResults,
  unregisterController,
  unregisterWorkspace,
  waitForController,
  withBoundNotebook,
  type NotebookController,
  type NotebookWorkspaceController,
  type UserActionEvent,
} from "./notebookAIBridge"
import type {
  CellResult,
  NotebookCell,
  NotebookViewState,
} from "../store/notebook"

const emptyState: NotebookViewState = { cells: [] }

const makeController = (
  bufferId: number,
  overrides: Partial<NotebookController> = {},
): NotebookController => ({
  bufferId,
  addCell: () => "c1",
  updateCell: () => undefined,
  deleteCell: () => undefined,
  moveCellUp: () => undefined,
  moveCellDown: () => undefined,
  duplicateCell: () => "c2",
  runCell: () =>
    Promise.resolve({ success: true, queryCount: 1, results: ["success"] }),
  setLayoutMode: () => undefined,
  setVariables: () => undefined,
  setCellLayout: () => undefined,
  setCellMode: () => undefined,
  setCellChartConfig: () => undefined,
  setCellAutoRefresh: () => undefined,
  setCellChartMaximized: () => undefined,
  setCellMaximized: () => undefined,
  applyNotebookState: () => ({
    applied: { added: [], updated: [], deleted: [] },
  }),
  getCellsSnapshot: () => [],
  getSettings: () => ({}),
  getMaximizedCellId: () => null,
  ...overrides,
})

const makeWorkspace = (
  overrides: Partial<NotebookWorkspaceController> = {},
): NotebookWorkspaceController => ({
  createNotebook: (label) =>
    Promise.resolve({ bufferId: 1, label: label ?? "Notebook" }),
  duplicateNotebook: (bufferId) =>
    Promise.resolve({ bufferId, label: "Notebook (copy)" }),
  deleteNotebook: () => Promise.resolve(),
  activateNotebook: () => Promise.resolve(true),
  getBufferMeta: () => ({
    kind: "active",
    label: "test",
    notebookViewState: emptyState,
  }),
  listNotebookBuffers: () => [],
  ...overrides,
})

beforeEach(() => {
  __resetNotebookAIBridgeForTests()
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

  it("re-register replaces the previous controller", () => {
    const first = makeController(42, { getMaximizedCellId: () => "first" })
    const second = makeController(42, { getMaximizedCellId: () => "second" })
    registerController(first)
    registerController(second)
    expect(getController(42)?.getMaximizedCellId()).toBe("second")
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

  it("rejects with a timeout error after timeoutMs", async () => {
    await expect(waitForController(42, 20)).rejects.toThrow(
      /did not register within 20ms/,
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

describe("withBoundNotebook", () => {
  it("throws workspace_unavailable when no workspace is registered", async () => {
    const err: unknown = await withBoundNotebook(1, () =>
      Promise.resolve("x"),
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotebookToolError)
    expect((err as NotebookToolError).code).toBe("workspace_unavailable")
  })

  it("maps null meta to not_a_notebook", async () => {
    registerWorkspace(makeWorkspace({ getBufferMeta: () => null }))
    const err: unknown = await withBoundNotebook(1, () =>
      Promise.resolve("x"),
    ).catch((e: unknown) => e)
    expect((err as NotebookToolError).code).toBe("not_a_notebook")
  })

  it("maps deleted meta to deleted", async () => {
    registerWorkspace(
      makeWorkspace({ getBufferMeta: () => ({ kind: "deleted" as const }) }),
    )
    const err: unknown = await withBoundNotebook(1, () =>
      Promise.resolve("x"),
    ).catch((e: unknown) => e)
    expect((err as NotebookToolError).code).toBe("deleted")
  })

  it("maps archived meta to archived", async () => {
    registerWorkspace(
      makeWorkspace({
        getBufferMeta: () => ({ kind: "archived", label: "x" }) as const,
      }),
    )
    const err: unknown = await withBoundNotebook(1, () =>
      Promise.resolve("x"),
    ).catch((e: unknown) => e)
    expect((err as NotebookToolError).code).toBe("archived")
  })

  it("passes the controller through when it is already mounted", async () => {
    registerWorkspace(makeWorkspace())
    const c = makeController(1)
    registerController(c)
    const out = await withBoundNotebook(1, (ctrl) =>
      Promise.resolve(ctrl.bufferId),
    )
    expect(out).toBe(1)
  })

  it("activates the notebook and waits for the controller when not mounted", async () => {
    const activateNotebook = vi.fn(() => {
      setTimeout(() => registerController(makeController(1)), 5)
      return Promise.resolve(true)
    })
    registerWorkspace(makeWorkspace({ activateNotebook }))
    const out = await withBoundNotebook(1, (ctrl) =>
      Promise.resolve(ctrl.bufferId),
    )
    expect(activateNotebook).toHaveBeenCalledWith(1)
    expect(out).toBe(1)
  })

  it("throws activation_failed when activation returns false", async () => {
    registerWorkspace(
      makeWorkspace({ activateNotebook: () => Promise.resolve(false) }),
    )
    const err: unknown = await withBoundNotebook(1, () =>
      Promise.resolve("x"),
    ).catch((e: unknown) => e)
    expect((err as NotebookToolError).code).toBe("activation_failed")
  })

  it("propagates errors thrown by the inner function", async () => {
    registerWorkspace(makeWorkspace())
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

  const makeLiveActions = (
    prevCells: NotebookCell[],
    currentMaximizedId: string | null = null,
  ) => ({
    addCell: () => "new",
    updateCell: () => undefined,
    deleteCell: () => undefined,
    moveCellUp: () => undefined,
    moveCellDown: () => undefined,
    duplicateCell: () => "dup",
    runCell: () => Promise.resolve(true),
    updateSettings: () => undefined,
    setCellLayout: () => undefined,
    setCellMode: () => undefined,
    setCellChartConfig: () => undefined,
    setCellAutoRefresh: () => undefined,
    setCellChartMaximized: () => undefined,
    setMaximizedCellId: vi.fn(),
    updateCells: () => undefined,
    getCellsSnapshot: () => prevCells,
    getSettings: () => ({}),
    getMaximizedCellId: () => currentMaximizedId,
  })

  it("clears a provided maximized id that does not survive the apply", () => {
    const live = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    // Stale echo: cell "a" is dropped while the request still spotlights it.
    controller.applyNotebookState({
      cells: [{ id: "b", value: "SELECT 2" }],
      maximizedCellId: "a",
    })
    expect(live.setMaximizedCellId).toHaveBeenCalledWith(null)
  })

  it("keeps a provided maximized id that exists in the applied cells", () => {
    const live = makeLiveActions([cellA, cellB])
    const controller = createNotebookController(1, { current: live })
    controller.applyNotebookState({
      cells: [
        { id: "a", value: "SELECT 1" },
        { id: "b", value: "SELECT 2" },
      ],
      maximizedCellId: "b",
    })
    expect(live.setMaximizedCellId).toHaveBeenCalledWith("b")
  })

  it("clears the current maximized id when the field is omitted and its cell is deleted", () => {
    const live = makeLiveActions([cellA, cellB], "a")
    const controller = createNotebookController(1, { current: live })
    controller.applyNotebookState({ cells: [{ id: "b", value: "SELECT 2" }] })
    expect(live.setMaximizedCellId).toHaveBeenCalledWith(null)
  })
})
