import type {
  CellMode,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  NotebookViewState,
} from "../store/notebook"
import type { ChartConfig } from "../scenes/Editor/Notebook/CellChart/chartTypes"

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
  addCell: (value: string, afterCellId?: string) => string
  updateCell: (cellId: string, updates: { value?: string }) => void
  deleteCell: (cellId: string) => void
  moveCellUp: (cellId: string) => void
  moveCellDown: (cellId: string) => void
  duplicateCell: (cellId: string) => string
  runCell: (
    cellId: string,
    signal?: AbortSignal,
  ) => Promise<{ success: boolean; error?: string }>
  setLayoutMode: (mode: "list" | "grid") => void
  setVariables: (variables: NotebookVariable[]) => void
  setCellLayout: (
    cellId: string,
    pos: { x: number; y: number; w: number; h: number },
  ) => void
  setCellMode: (cellId: string, mode: CellMode) => void
  setCellChartConfig: (cellId: string, config: ChartConfig) => void
  setCellAutoRefresh: (cellId: string, value: boolean) => void
  setCellChartMaximized: (cellId: string, value: boolean) => void
  setCellMaximized: (cellId: string | null) => void
  applyNotebookState: (request: ApplyNotebookStateRequest) => {
    applied: { added: string[]; updated: string[]; deleted: string[] }
  }
  getCellsSnapshot: () => NotebookCell[]
  getSettings: () => NotebookSettings
  getMaximizedCellId: () => string | null
}

// Wire shape accepted by `applyNotebookState`. The fields are camelCase here
// (controller-level); the snake_case JSON-schema shape is translated at the
// dispatchTool boundary.
export type ApplyNotebookStateCellRequest = {
  id?: string | null
  value: string
  mode?: "run" | "draw" | null
  autoRefresh?: boolean | null
  isChartMaximized?: boolean | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number; h: number } | null
}

export type ApplyNotebookStateRequest = {
  layoutMode?: "list" | "grid" | null
  maximizedCellId?: string | null
  variables?: NotebookVariable[] | null
  cells: ApplyNotebookStateCellRequest[]
}

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
      status: "success" | "error"
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

// Module-level singletons. HMR-safe: re-registration from a remounted provider
// simply replaces the stored handle.
const controllers = new Map<number, NotebookController>()
const waiters = new Map<number, Waiter[]>()
const listeners = new Set<Listener>()
let workspace: NotebookWorkspaceController | undefined

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
