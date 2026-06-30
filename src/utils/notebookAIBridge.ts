import type {
  AutoRefresh,
  CellMode,
  CellType,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  NotebookViewState,
} from "../store/notebook"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  buildAppliedCells,
  buildAppliedLayout,
  isUnverifiableExecError,
  UNVERIFIED_RUN_NOTE,
} from "../scenes/Editor/Notebook/notebookUtils"
import type { RanStatus } from "./ai/runStatus"
import { sanitizeForPromptContext } from "./ai/sanitizeForPromptContext"

// Bridges the AI tool-execution layer (plain async code, no React context)
// to notebook React state. Two controllers live here:
//
//   NotebookController       — registered by the mounted NotebookProvider of a
//                              specific buffer. Exposes cell/layout mutations
//                              and snapshot reads for a single notebook.
//
//   NotebookWorkspaceController — registered once by NotebookWorkspaceBridge.
//                                 Owns cross-notebook operations: create a new
//                                 notebook buffer, activate one so it mounts,
//                                 read any buffer's meta without mounting it.
//
// Tools always go through `withBoundNotebook(bufferId, fn)`: it maps missing /
// deleted / archived / non-notebook buffers to a typed NotebookToolError, and
// auto-activates the buffer if its controller isn't mounted yet.

export type NotebookController = {
  bufferId: number
  addCell: (value: string, afterCellId?: string, type?: CellType) => string
  updateCell: (
    cellId: string,
    updates: {
      value?: string
      name?: string
      autoRefresh?: AutoRefresh
    },
  ) => void
  deleteCell: (cellId: string) => void
  moveCellUp: (cellId: string) => void
  moveCellDown: (cellId: string) => void
  duplicateCell: (cellId: string) => string
  runCell: (
    cellId: string,
    signal?: AbortSignal,
    sql?: string,
  ) => Promise<{
    success: boolean
    queryCount: number
    results: string[]
    unverified?: boolean
    note?: string
  }>
  setLayoutMode: (mode: "list" | "grid") => void
  setVariables: (variables: NotebookVariable[]) => void
  setCellLayout: (
    cellId: string,
    pos: { x: number; y: number; w: number; h: number },
  ) => void
  setCellMode: (cellId: string, mode: CellMode) => void
  setCellChartConfig: (cellId: string, config: ChartConfig) => void
  setCellViewMaximized: (cellId: string, value: boolean) => void
  setCellMaximized: (cellId: string | null) => void
  applyNotebookState: (request: ApplyNotebookStateRequest) => {
    applied: { added: string[]; updated: string[]; deleted: string[] }
  }
  getCellsSnapshot: () => NotebookCell[]
  getSettings: () => NotebookSettings
  getMaximizedCellId: () => string | null
}

export type NotebookControllerActions = {
  addCell: (afterCellId?: string, value?: string, type?: CellType) => string
  updateCell: (cellId: string, updates: Partial<NotebookCell>) => void
  deleteCell: (cellId: string) => void
  moveCellUp: (cellId: string) => void
  moveCellDown: (cellId: string) => void
  duplicateCell: (cellId: string) => string
  runCell: (
    cellId: string,
    sql?: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  updateSettings: (updates: Partial<NotebookSettings>) => void
  setCellLayout: (
    cellId: string,
    pos: { x: number; y: number; w: number; h: number },
  ) => void
  setCellMode: (cellId: string, mode: CellMode) => void
  setCellChartConfig: (cellId: string, config: ChartConfig) => void
  setCellViewMaximized: (cellId: string, value: boolean) => void
  setMaximizedCellId: (cellId: string | null) => void
  updateCells: (updater: (prev: NotebookCell[]) => NotebookCell[]) => void
  getCellsSnapshot: () => NotebookCell[]
  getSettings: () => NotebookSettings
  getMaximizedCellId: () => string | null
}

// Wire shape accepted by `applyNotebookState`. The fields are camelCase here
// (controller-level); the snake_case JSON-schema shape is translated at the
// dispatchTool boundary. Exactly one of value / preserveValue:true per cell.
export type ApplyNotebookStateCellRequest = {
  id?: string | null
  name?: string | null
  value?: string | null
  preserveValue?: boolean | null
  type?: CellType | null
  mode?: "run" | "draw" | null
  autoRefresh?: AutoRefresh | null
  isViewMaximized?: boolean | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number; h: number } | null
}

export type ApplyNotebookStateRequest = {
  layoutMode?: "list" | "grid" | null
  maximizedCellId?: string | null
  variables?: NotebookVariable[] | null
  cells: ApplyNotebookStateCellRequest[]
}

export const summarizeCellResults = (cell: NotebookCell | undefined) => {
  const freshResult = cell?.result
  if (!freshResult) {
    return { success: false, queryCount: 0, results: [] }
  }

  const results = freshResult.results.map((r) => {
    if (r.type === "cancelled") return "cancelled"
    if (r.type === "running" || r.type === "queued") return "pending"
    if (r.type === "error") {
      const trimmed =
        r.error.length > 200 ? `${r.error.slice(0, 197)}...` : r.error
      return `ERROR: ${sanitizeForPromptContext(trimmed)}`
    }
    return "success"
  })

  const unverified = freshResult.results.some((r) => isUnverifiableExecError(r))
  return {
    success: results.length > 0 && results.every((r) => r === "success"),
    queryCount: results.length,
    results,
    ...(unverified
      ? {
          unverified: true,
          note: UNVERIFIED_RUN_NOTE,
        }
      : {}),
  }
}

export const createNotebookController = (
  bufferId: number,
  liveActionsRef: { current: NotebookControllerActions },
): NotebookController => ({
  bufferId,
  addCell: (valueArg, afterCellId, type) =>
    liveActionsRef.current.addCell(afterCellId, valueArg, type),
  updateCell: (cellId, updates) =>
    liveActionsRef.current.updateCell(cellId, updates),
  deleteCell: (cellId) => liveActionsRef.current.deleteCell(cellId),
  moveCellUp: (cellId) => liveActionsRef.current.moveCellUp(cellId),
  moveCellDown: (cellId) => liveActionsRef.current.moveCellDown(cellId),
  duplicateCell: (cellId) => liveActionsRef.current.duplicateCell(cellId),
  runCell: async (cellId, signal, sql) => {
    const cellBefore = liveActionsRef.current
      .getCellsSnapshot()
      .find((c) => c.id === cellId)
    const priorResult = cellBefore?.result ?? null

    await liveActionsRef.current.runCell(cellId, sql, signal)

    const cell = liveActionsRef.current
      .getCellsSnapshot()
      .find((c) => c.id === cellId)
    const freshCell =
      cell?.result && cell.result !== priorResult ? cell : undefined

    return summarizeCellResults(freshCell)
  },
  setLayoutMode: (mode) =>
    liveActionsRef.current.updateSettings({ layoutMode: mode }),
  setVariables: (variables) =>
    liveActionsRef.current.updateSettings({ variables }),
  setCellLayout: (cellId, pos) =>
    liveActionsRef.current.setCellLayout(cellId, pos),
  setCellMode: (cellId, mode) => {
    liveActionsRef.current.setCellMode(cellId, mode)
    if (mode === "draw") {
      liveActionsRef.current.setCellViewMaximized(cellId, false)
    }
  },
  setCellChartConfig: (cellId, cfg) =>
    liveActionsRef.current.setCellChartConfig(cellId, cfg),
  setCellViewMaximized: (cellId, value) =>
    liveActionsRef.current.setCellViewMaximized(cellId, value),
  setCellMaximized: (cellId) =>
    liveActionsRef.current.setMaximizedCellId(cellId),
  applyNotebookState: (request) => {
    // All-or-nothing: buildAppliedCells throws before any mutation.
    const prev = liveActionsRef.current.getCellsSnapshot()
    const { nextCells, diff } = buildAppliedCells(prev, request)
    const settings = liveActionsRef.current.getSettings()
    const targetLayoutMode =
      request.layoutMode === undefined || request.layoutMode === null
        ? settings.layoutMode
        : request.layoutMode

    liveActionsRef.current.updateCells(() => nextCells)

    if (targetLayoutMode === "grid") {
      const nextLayout = buildAppliedLayout(
        request,
        nextCells,
        settings.layout,
        { gridCols: 12, rowHeight: 10, marginY: 20 },
      )
      liveActionsRef.current.updateSettings({
        layoutMode: "grid",
        layout: nextLayout,
      })
    } else if (
      request.layoutMode !== undefined &&
      request.layoutMode !== null
    ) {
      liveActionsRef.current.updateSettings({
        layoutMode: request.layoutMode,
      })
    }

    if (request.maximizedCellId !== undefined) {
      const id = request.maximizedCellId
      liveActionsRef.current.setMaximizedCellId(
        id && nextCells.some((c) => c.id === id) ? id : null,
      )
    } else {
      const maximizedCellId = liveActionsRef.current.getMaximizedCellId()
      if (maximizedCellId && !nextCells.some((c) => c.id === maximizedCellId)) {
        liveActionsRef.current.setMaximizedCellId(null)
      }
    }

    if (request.variables !== undefined) {
      liveActionsRef.current.updateSettings({
        variables: request.variables ?? [],
      })
    }

    return { applied: diff }
  },
  getCellsSnapshot: () => liveActionsRef.current.getCellsSnapshot(),
  getSettings: () => ({ ...liveActionsRef.current.getSettings() }),
  getMaximizedCellId: () => liveActionsRef.current.getMaximizedCellId(),
})

export type NotebookWorkspaceBufferMeta =
  | {
      kind: "active" | "inactive"
      label: string
      notebookViewState: NotebookViewState
    }
  | { kind: "archived"; label: string }
  | { kind: "deleted" }
  | null

export type NotebookWorkspaceController = {
  createNotebook: (
    label?: string,
    signal?: AbortSignal,
  ) => Promise<{ bufferId: number; label: string }>
  duplicateNotebook: (
    bufferId: number,
    signal?: AbortSignal,
  ) => Promise<{ bufferId: number; label: string }>
  deleteNotebook: (bufferId: number) => Promise<void>
  activateNotebook: (bufferId: number) => Promise<boolean>
  getBufferMeta: (bufferId: number) => NotebookWorkspaceBufferMeta
  listNotebookBuffers: () => Array<{
    bufferId: number
    label: string
    archived: boolean
  }>
}

export type UserActionEvent =
  | { kind: "user_added_cell"; bufferId: number; cellId: string }
  | { kind: "user_deleted_cell"; bufferId: number; cellId: string }
  | { kind: "user_updated_cell"; bufferId: number; cellId: string }
  | {
      kind: "user_ran_cell"
      bufferId: number
      cellId: string
      status: RanStatus
    }
  | { kind: "user_moved_cell"; bufferId: number; cellId: string }
  | {
      kind: "user_duplicated_cell"
      bufferId: number
      cellId: string
      newCellId: string
    }
  | {
      kind: "user_changed_layout_mode"
      bufferId: number
      mode: "list" | "grid"
    }
  | {
      kind: "user_changed_cell_mode"
      bufferId: number
      cellId: string
      mode: CellMode
    }
  | { kind: "user_changed_grid_layout"; bufferId: number }
  | { kind: "user_archived_notebook"; bufferId: number }
  | { kind: "user_deleted_notebook"; bufferId: number }

export type NotebookToolErrorCode =
  | "unknown_buffer"
  | "deleted"
  | "archived"
  | "not_a_notebook"
  | "activation_failed"
  | "unknown_cell"
  | "workspace_unavailable"
  | "last_tab"
  | "last_cell"
  | "cell_limit"
  | "cell_too_large"

export class NotebookToolError extends Error {
  readonly code: NotebookToolErrorCode
  constructor(code: NotebookToolErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "NotebookToolError"
  }
}

type Waiter = {
  resolve: (c: NotebookController) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
  // Removes any AbortSignal listener attached when the waiter was created.
  // Called on resolve / timeout / abort so we never leak listeners.
  cleanup?: () => void
}

type Listener = (evt: UserActionEvent) => void

const controllers = new Map<number, NotebookController>()
const waiters = new Map<number, Waiter[]>()
const listeners = new Set<Listener>()
let workspace: NotebookWorkspaceController | undefined

let userActionSeq = 0
export const getUserActionSeq = (): number => userActionSeq

const editListeners = new Set<() => void>()
export const onUserEdit = (cb: () => void): (() => void) => {
  editListeners.add(cb)
  return () => {
    editListeners.delete(cb)
  }
}
export const signalUserEdit = (): void => {
  userActionSeq += 1
  for (const cb of Array.from(editListeners)) {
    try {
      cb()
    } catch {
      // One bad subscriber must not break the others.
    }
  }
}

export const registerController = (controller: NotebookController): void => {
  controllers.set(controller.bufferId, controller)
  const pending = waiters.get(controller.bufferId)
  if (pending && pending.length > 0) {
    for (const w of pending) {
      clearTimeout(w.timer)
      w.cleanup?.()
      w.resolve(controller)
    }
    waiters.delete(controller.bufferId)
  }
}

export const unregisterController = (bufferId: number): void => {
  controllers.delete(bufferId)
}

export const getController = (
  bufferId: number,
): NotebookController | undefined => controllers.get(bufferId)

export const waitForController = (
  bufferId: number,
  timeoutMs = 3000,
  signal?: AbortSignal,
): Promise<NotebookController> => {
  const existing = controllers.get(bufferId)
  if (existing) return Promise.resolve(existing)
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"))
  }
  return new Promise<NotebookController>((resolve, reject) => {
    const removeFromWaiters = () => {
      const list = waiters.get(bufferId)
      if (!list) return
      const filtered = list.filter((w) => w.timer !== timer)
      if (filtered.length === 0) waiters.delete(bufferId)
      else waiters.set(bufferId, filtered)
    }
    const onAbort = () => {
      clearTimeout(timer)
      removeFromWaiters()
      reject(new DOMException("Aborted", "AbortError"))
    }
    const cleanup = signal
      ? () => signal.removeEventListener("abort", onAbort)
      : undefined
    const timer = setTimeout(() => {
      cleanup?.()
      removeFromWaiters()
      reject(
        new Error(
          `Notebook ${bufferId} did not register within ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)
    signal?.addEventListener("abort", onAbort, { once: true })
    const list = waiters.get(bufferId) ?? []
    list.push({ resolve, reject, timer, cleanup })
    waiters.set(bufferId, list)
  })
}

export const registerWorkspace = (
  controller: NotebookWorkspaceController,
): void => {
  workspace = controller
}

export const unregisterWorkspace = (): void => {
  workspace = undefined
}

export const getWorkspace = (): NotebookWorkspaceController | undefined =>
  workspace

export const on = (_event: "user-action", cb: Listener): (() => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const emitUserAction = (evt: UserActionEvent): void => {
  if (evt.kind !== "user_updated_cell") {
    userActionSeq += 1
  }
  // Snapshot to guard against subscribers mutating the set during emit.
  for (const cb of Array.from(listeners)) {
    try {
      cb(evt)
    } catch {
      // One bad subscriber must not break the others.
    }
  }
}

const resolveActiveMeta = (
  bufferId: number,
): Extract<NotebookWorkspaceBufferMeta, { kind: "active" | "inactive" }> => {
  if (!workspace) {
    throw new NotebookToolError(
      "workspace_unavailable",
      "Notebook workspace is not mounted yet.",
    )
  }
  const meta = workspace.getBufferMeta(bufferId)
  if (meta === null) {
    throw new NotebookToolError(
      "not_a_notebook",
      `Buffer ${bufferId} exists but is not a notebook.`,
    )
  }
  if (meta.kind === "deleted") {
    throw new NotebookToolError(
      "deleted",
      `Notebook ${bufferId} no longer exists.`,
    )
  }
  if (meta.kind === "archived") {
    throw new NotebookToolError(
      "archived",
      `Notebook "${meta.label}" is archived.`,
    )
  }
  return meta
}

// Single checkpoint every mutating notebook tool runs through. Reads the
// buffer's meta, maps lifecycle states to typed errors, and auto-activates the
// notebook if its controller isn't mounted yet. The optional `signal` rejects a
// pending `waitForController` and skips `fn` when the user aborts the AI turn
// — so stuck tools don't keep the chat spinning past the Abort button.
export const withBoundNotebook = async <T>(
  bufferId: number,
  fn: (controller: NotebookController) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  resolveActiveMeta(bufferId)
  let controller = controllers.get(bufferId)
  if (!controller) {
    const ok = await workspace!.activateNotebook(bufferId)
    if (!ok) {
      throw new NotebookToolError(
        "activation_failed",
        `Could not activate notebook ${bufferId}.`,
      )
    }
    controller = await waitForController(bufferId, 3000, signal)
  }
  return fn(controller)
}

// Skips `activateNotebook`: silently switching the user's active tab to
// satisfy a read-only AI lookup would lose their focus and scroll position.
export const withBoundNotebookReadOnly = async <T>(
  bufferId: number,
  fn: (
    view: NotebookViewState,
    controller: NotebookController | undefined,
  ) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  const meta = resolveActiveMeta(bufferId)
  const controller = controllers.get(bufferId)
  return fn(meta.notebookViewState, controller)
}

// Test-only reset. Clears every module-level slot so vitest runs start clean.
export const __resetNotebookAIBridgeForTests = (): void => {
  for (const [, list] of waiters) {
    for (const w of list) {
      clearTimeout(w.timer)
      w.cleanup?.()
      w.reject(new Error("Bridge reset"))
    }
  }
  controllers.clear()
  waiters.clear()
  listeners.clear()
  workspace = undefined
}
