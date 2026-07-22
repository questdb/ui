import type {
  AutoRefresh,
  CellType,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  NotebookViewState,
} from "../../../store/notebook"
import type { ChartConfig } from "../../../scenes/Editor/Notebook/CellChart/chartTypes"
import {
  type CellRunOutcome,
  CELL_CHANGED_BEFORE_RUN_NOTE,
  CELL_CHANGED_MID_RUN_NOTE,
  RESULT_CLEARED_MID_RUN_NOTE,
  summarizeCellResults,
  SUPERSEDED_RUN_NOTE,
} from "../../../scenes/Editor/Notebook/notebookUtils"
import { removeNotebookCellLayouts } from "../../../scenes/Editor/Notebook/notebookColumnLayoutStore"
import { clearChartZoom } from "../../../scenes/Editor/Notebook/cellVirtualization/chartZoomStore"
import { deleteCellSnapshot } from "../../../store/notebookResults"
import { NotebookToolError } from "../notebookToolError"
import { enqueueBufferTask } from "../notebookBufferQueue"
import { emitAgentEdit } from "../agentActivity"
import {
  __resetNotebookDexieViewForTests,
  commitView,
  partsOf,
  readNotebookView,
  requireCellIn,
  type ViewParts,
} from "../notebookDexieView"
import {
  __resetNotebookHeadlessRunsForTests,
  runHeadlessCell,
  type DexieControllerDeps,
} from "../notebookHeadlessRun"
import type { NotebookTransitionResult } from "./notebookTransitions"

// The two NotebookController implementations, side by side. Both expose the same
// tiny interface — `mutate` runs a transition, `readView` reads the document,
// `runCell` executes a cell. The only difference is the runner: React state
// (applyTransition) for the live one, a queued Dexie read→commit for the passive
// one. Callers build the transition; the controller just runs it.

export type RunCellSummary = {
  success: boolean
  queryCount: number
  results: string[]
  unverified?: boolean
  note?: string
}

// Runs a transition against the bound document and resolves its result. A
// transition's typed throw (unknown_cell, last_cell, …) surfaces as a rejection,
// identically on both routes.
export type NotebookMutate = <T>(
  transition: (parts: ViewParts) => NotebookTransitionResult<T>,
) => Promise<T>

export type NotebookController = {
  bufferId: number
  // Route discriminant — a registry identity check would misclassify a live
  // controller as Dexie across a remount race.
  kind: "live" | "dexie"
  mutate: NotebookMutate
  readView: () => Promise<NotebookViewState>
  runCell: (
    cellId: string,
    signal?: AbortSignal,
    sql?: string,
  ) => Promise<RunCellSummary>
}

// The subset of the live provider's actions the live controller composes over.
// `applyTransition` runs a transition against React state (cancelling any run of
// a deleted cell via its cleanup list); the reads are synchronous ref snapshots.
export type NotebookControllerActions = {
  runCell: (
    cellId: string,
    sql?: string,
    signal?: AbortSignal,
    expectFullValue?: boolean,
  ) => Promise<CellRunOutcome>
  applyTransition: <T>(
    run: (parts: ViewParts) => NotebookTransitionResult<T>,
  ) => T
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

export const createNotebookController = (
  bufferId: number,
  liveActionsRef: { current: NotebookControllerActions },
): NotebookController => {
  // The live surface's transition runner: apply the transition to React state
  // (synchronously, via the provider's applyTransition), then normalize to a
  // Promise so a transition's typed throw reaches the agent as a rejection.
  const mutate: NotebookMutate = (transition) => {
    try {
      return Promise.resolve(liveActionsRef.current.applyTransition(transition))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  return {
    bufferId,
    kind: "live",
    mutate,
    readView: () =>
      Promise.resolve({
        cells: liveActionsRef.current.getCellsSnapshot(),
        settings: { ...liveActionsRef.current.getSettings() },
        maximizedCellId:
          liveActionsRef.current.getMaximizedCellId() ?? undefined,
      }),
    // runCell is not a transition, so it does not inherit requireCellIn — guard
    // it here, matching the passive route's requireCellIn in runHeadlessCell.
    runCell: async (cellId, signal, sql) => {
      const cellBefore = requireCellIn(
        liveActionsRef.current.getCellsSnapshot(),
        cellId,
        bufferId,
      )

      if (sql !== undefined && sql !== cellBefore.value) {
        return {
          ...summarizeCellResults(undefined),
          unverified: true,
          note: CELL_CHANGED_BEFORE_RUN_NOTE,
        }
      }

      const { superseded, cellChanged, notStarted, resultCleared, result } =
        await liveActionsRef.current.runCell(cellId, sql, signal, true)

      if (superseded || cellChanged || resultCleared) {
        return {
          ...summarizeCellResults(undefined),
          unverified: true,
          note: notStarted
            ? CELL_CHANGED_BEFORE_RUN_NOTE
            : resultCleared
              ? RESULT_CLEARED_MID_RUN_NOTE
              : cellChanged
                ? CELL_CHANGED_MID_RUN_NOTE
                : SUPERSEDED_RUN_NOTE,
        }
      }

      // Summarize the result THIS run produced — never cell.result, which a
      // draw cell's auto-refresh mirror replaces independently of the run.
      const cell = liveActionsRef.current
        .getCellsSnapshot()
        .find((c) => c.id === cellId)
      const freshCell = cell && result ? { ...cell, result } : undefined

      return summarizeCellResults(freshCell)
    },
  }
}

// A stateless NotebookController over the persisted buffer: each op is a
// queued read→transition→write on the buffer's Dexie row, so agent edits to
// unmounted notebooks are durable without ever mounting them.

const notebookGone = (bufferId: number): NotebookToolError =>
  new NotebookToolError("deleted", `Notebook ${bufferId} no longer exists.`)

const notebookArchivedMidEdit = (bufferId: number): NotebookToolError =>
  new NotebookToolError(
    "archived",
    `Notebook ${bufferId} was archived while this edit was in flight; nothing was changed. Call get_notebook_state to re-sync, then retry.`,
  )

export const __resetNotebookDexieControllerForTests = (): void => {
  __resetNotebookDexieViewForTests()
  __resetNotebookHeadlessRunsForTests()
}

export const createDexieNotebookController = (
  bufferId: number,
  deps: DexieControllerDeps,
  signal?: AbortSignal,
): NotebookController => {
  const requireActive = (): void => {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
  }

  // Refuses the write if the buffer is being mounted. A mount claims the buffer
  // synchronously, then enqueues its seed read; so a claim already visible here
  // means the seed is queued ahead of this write and won't see it — the mounted
  // provider would then persist over it. If the claim lands after this write is
  // enqueued, the seed is ordered behind it and the write survives, so we allow
  // it. Checked before enqueue to keep that ordering decisive.
  const requireUnclaimed = (): void => {
    if (deps.isBufferClaimed()) {
      throw new NotebookToolError(
        "mounted_mid_edit",
        `The user opened notebook ${bufferId} while this edit was in flight; ` +
          "nothing was changed. Call get_notebook_state to re-sync, then retry.",
      )
    }
  }

  const mutate: NotebookMutate = async (transition) => {
    requireActive()
    requireUnclaimed()
    const { result, touchedCellId } = await enqueueBufferTask(
      bufferId,
      async () => {
        const view = await readNotebookView(bufferId)
        const out = transition(partsOf(view))
        requireActive()
        const commit = await commitView(bufferId, out.parts)
        if (commit === "deleted") {
          throw notebookGone(bufferId)
        }
        if (commit === "archived") {
          throw notebookArchivedMidEdit(bufferId)
        }
        // Runs only after a durable commit and is never awaited: the write is
        // done, and failing the tool over orphaned snapshot/layout cleanup
        // would misreport it.
        if (out.cleanup) {
          for (const cellId of out.cleanup.cellIds) {
            void deleteCellSnapshot(bufferId, cellId).catch(() => undefined)
            removeNotebookCellLayouts(bufferId, cellId)
            clearChartZoom(cellId)
          }
        }
        if (out.deleteSnapshots) {
          for (const cellId of out.deleteSnapshots.cellIds) {
            void deleteCellSnapshot(bufferId, cellId).catch(() => undefined)
          }
        }
        return out
      },
    )
    emitAgentEdit({ bufferId, cellId: touchedCellId })
    return result
  }

  return {
    bufferId,
    kind: "dexie",
    mutate,
    readView: () =>
      enqueueBufferTask(bufferId, () => readNotebookView(bufferId)),
    runCell: (cellId, signal, sql) =>
      runHeadlessCell(bufferId, deps, cellId, signal, sql),
  }
}
