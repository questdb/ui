import type {
  AgentCellView,
  AutoRefresh,
  CellType,
  NotebookCell,
  NotebookSettings,
  NotebookVariable,
  NotebookViewState,
} from "../../../store/notebook"
import type { ChartConfig } from "../../../scenes/Editor/Notebook/CellChart/chartTypes"
import type {
  AgentHeightValue,
  CellResultStatusReader,
  CellResultStatus,
} from "../../../scenes/Editor/Notebook/notebookUtils"
import {
  type CellRunOutcome,
  cancelledBeforeLaunchSummary,
  midRunCancellationNote,
  type RunCancellation,
  CELL_CHANGED_BEFORE_RUN_NOTE,
  CELL_CHANGED_MID_RUN_NOTE,
  RESULT_CLEARED_MID_RUN_NOTE,
  snapshotResultsHaveMatchingStatement,
  summarizeCellResults,
} from "../../../scenes/Editor/Notebook/notebookUtils"
import { removeNotebookCellLayouts } from "../../../scenes/Editor/Notebook/notebookColumnLayoutStore"
import { clearChartZoom } from "../../../scenes/Editor/Notebook/cellVirtualization/chartZoomStore"
import {
  deleteCellSnapshot,
  loadCellSnapshot,
} from "../../../store/notebookResults"
import { getQueriesFromText } from "../../../scenes/Editor/Monaco/utils"
import { loadPassiveResultStatusReader } from "../notebookResultStatus"
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
  cancelHeadlessCellRuns,
  runHeadlessCell,
  type DexieControllerDeps,
} from "../notebookHeadlessRun"
import type { RunCellGate } from "../../tools/permissions"
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
  // Why a cancelled run stopped; with queryCount 0 nothing was executed.
  cancelled?: RunCancellation
  // Barrier decisions for gated (agent) runs: a permission denial or an
  // auto-run write skip. Nothing executed when either is set.
  denied?: string
  skipped?: string
}

// Runs a transition against the bound document and resolves its result. A
// transition's typed throw (unknown_cell, last_cell, …) surfaces as a rejection,
// identically on both routes.
export type NotebookMutate = <T>(
  transition: (parts: ViewParts) => NotebookTransitionResult<T>,
) => Promise<T>

// For the transitions that size a result pane: they also receive the cell
// result status, which the passive route reads from the snapshot index. Only
// this entry pays for that read.
export type NotebookMutateWithResultStatus = <T>(
  transition: (
    parts: ViewParts,
    resultStatusOf: CellResultStatusReader,
  ) => NotebookTransitionResult<T>,
) => Promise<T>

// Live-only refresh state, read straight off the refresh engine. Absent for
// unmounted notebooks — the tool docs say so, so an agent never reads absence
// as "not refreshing" or "not blocked".
export type CellRefreshView = {
  refreshing: boolean
  lastRefreshError?: string
  autoRefreshBlocked?: "contains_write"
}

export type NotebookController = {
  bufferId: number
  // Route discriminant — a registry identity check would misclassify a live
  // controller as Dexie across a remount race.
  kind: "live" | "dexie"
  mutate: NotebookMutate
  mutateWithResultStatus: NotebookMutateWithResultStatus
  readView: () => Promise<NotebookViewState>
  readRefreshState?: () => ReadonlyMap<string, CellRefreshView>
  // Live-only, like readRefreshState: the snapshot-load status of one cell,
  // read off the provider's hydration engine (mount-independent). Passive
  // transitions receive their IndexedDB-backed reader through
  // `mutateWithResultStatus`.
  readResultStatus?: (cellId: string) => CellResultStatus
  runCell: (
    cellId: string,
    signal?: AbortSignal,
    sql?: string,
    gate?: RunCellGate,
  ) => Promise<RunCellSummary>
  flushChartSnapshots?: () => Promise<void>
}

// The subset of the live provider's actions the live controller composes over.
// `applyTransition` runs a transition against React state (cancelling any run of
// a deleted cell via its cleanup list) and settles once the document is
// durable; the reads are synchronous ref snapshots.
export type NotebookControllerActions = {
  readRefreshState: () => ReadonlyMap<string, CellRefreshView>
  readResultStatus: (cellId: string) => CellResultStatus
  runCell: (
    cellId: string,
    sql?: string,
    signal?: AbortSignal,
    expectFullValue?: boolean,
    gate?: RunCellGate,
  ) => Promise<CellRunOutcome>
  applyTransition: <T>(
    run: (parts: ViewParts) => NotebookTransitionResult<T>,
  ) => Promise<T>
  getCellsSnapshot: () => NotebookCell[]
  getSettings: () => NotebookSettings
  getMaximizedCellId: () => string | null
  flushChartSnapshots: () => Promise<void>
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
  editorHeight?: AgentHeightValue
  resultHeight?: AgentHeightValue
  view?: AgentCellView | null
  chartConfig?: ChartConfig | null
  grid?: { x: number; y: number; w: number } | null
}

export type ApplyNotebookStateRequest = {
  layoutMode?: "list" | "grid" | null
  autoRefreshDefault?: AutoRefresh | null
  maximizedCellId?: string | null
  variables?: NotebookVariable[] | null
  cells: ApplyNotebookStateCellRequest[]
}

export const createNotebookController = (
  bufferId: number,
  liveActionsRef: { current: NotebookControllerActions },
): NotebookController => {
  // The live surface's transition runner: apply the transition to React state
  // via the provider's applyTransition, which settles once the document is
  // durable; the try normalizes a transition's synchronous typed throw into
  // the same rejection channel.
  const applyMutation = <T>(
    run: (parts: ViewParts) => NotebookTransitionResult<T>,
  ): Promise<T> => {
    try {
      return Promise.resolve(liveActionsRef.current.applyTransition(run))
    } catch (error) {
      return Promise.reject(error)
    }
  }
  const mutate: NotebookMutate = (transition) => applyMutation(transition)
  const mutateWithResultStatus: NotebookMutateWithResultStatus = (transition) =>
    applyMutation((parts) =>
      transition(parts, liveActionsRef.current.readResultStatus),
    )

  return {
    bufferId,
    kind: "live",
    mutate,
    mutateWithResultStatus,
    readView: () =>
      Promise.resolve({
        cells: liveActionsRef.current.getCellsSnapshot(),
        settings: { ...liveActionsRef.current.getSettings() },
        maximizedCellId:
          liveActionsRef.current.getMaximizedCellId() ?? undefined,
      }),
    readRefreshState: () => liveActionsRef.current.readRefreshState(),
    readResultStatus: (cellId) =>
      liveActionsRef.current.readResultStatus(cellId),
    // runCell is not a transition, so it does not inherit requireCellIn — guard
    // it here, matching the passive route's requireCellIn in runHeadlessCell.
    runCell: async (cellId, signal, sql, gate) => {
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

      const outcome = await liveActionsRef.current.runCell(
        cellId,
        sql,
        signal,
        true,
        gate,
      )
      if (outcome.denied !== undefined || outcome.skipped !== undefined) {
        return {
          ...summarizeCellResults(undefined),
          ...(outcome.denied !== undefined ? { denied: outcome.denied } : {}),
          ...(outcome.skipped !== undefined
            ? { skipped: outcome.skipped }
            : {}),
        }
      }
      const {
        superseded,
        cellChanged,
        notStarted,
        resultCleared,
        cancelled,
        result,
      } = outcome

      if (cancelled !== undefined && notStarted) {
        return cancelledBeforeLaunchSummary(cancelled)
      }
      if (superseded || cellChanged || resultCleared) {
        return {
          ...summarizeCellResults(undefined),
          unverified: true,
          ...(cancelled !== undefined ? { cancelled } : {}),
          note: notStarted
            ? CELL_CHANGED_BEFORE_RUN_NOTE
            : resultCleared
              ? RESULT_CLEARED_MID_RUN_NOTE
              : cellChanged
                ? CELL_CHANGED_MID_RUN_NOTE
                : midRunCancellationNote(cancelled ?? "superseded"),
        }
      }

      // Summarize the result THIS run produced — never cell.result, which a
      // draw cell's auto-refresh replaces independently of the run.
      const cell = liveActionsRef.current
        .getCellsSnapshot()
        .find((c) => c.id === cellId)
      const freshCell = cell && result ? { ...cell, result } : undefined

      return summarizeCellResults(freshCell)
    },
    flushChartSnapshots: () => liveActionsRef.current.flushChartSnapshots(),
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

  const runMutation = async <T>(
    produce: (parts: ViewParts) => Promise<NotebookTransitionResult<T>>,
  ): Promise<T> => {
    requireActive()
    requireUnclaimed()
    const { result, touchedCellId } = await enqueueBufferTask(
      bufferId,
      async () => {
        const view = await readNotebookView(bufferId)
        const out = await produce(partsOf(view))
        requireActive()
        const commit = await commitView(bufferId, out.parts)
        if (commit === "deleted") {
          throw notebookGone(bufferId)
        }
        if (commit === "archived") {
          throw notebookArchivedMidEdit(bufferId)
        }
        const previousCellsById = new Map(
          view.cells.map((cell) => [cell.id, cell]),
        )
        const changedSqlCells = out.parts.cells.flatMap((nextCell) => {
          const previousCell = previousCellsById.get(nextCell.id)
          return previousCell &&
            nextCell.type !== "markdown" &&
            previousCell.value !== nextCell.value
            ? [{ cellId: nextCell.id, value: nextCell.value }]
            : []
        })
        // Invalidate only after the document commit succeeds. Because this is
        // still inside the per-buffer queue, a completed headless request
        // cannot interleave its result commit between this mutation and the
        // invalidation.
        if (out.cancelRuns) {
          cancelHeadlessCellRuns(
            bufferId,
            out.cancelRuns.cellIds,
            out.cancelRuns.reason,
          )
        }
        if (out.cleanup && out.cleanup.cellIds.length > 0) {
          cancelHeadlessCellRuns(bufferId, out.cleanup.cellIds, "cell_deleted")
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
        const snapshotsToDelete = new Set(out.deleteSnapshots?.cellIds ?? [])
        for (const { cellId, value } of changedSqlCells) {
          try {
            const snapshot = await loadCellSnapshot(bufferId, cellId)
            if (
              snapshot &&
              !snapshotResultsHaveMatchingStatement(
                snapshot.results,
                getQueriesFromText(value),
              )
            ) {
              snapshotsToDelete.add(cellId)
            }
          } catch {
            // The document edit is already durable. A later hydration retries
            // reconciliation if IndexedDB could not be inspected here.
          }
        }
        // Semantic invalidation is awaited so an immediate passive read cannot
        // observe a stale snapshot key after the mutation resolves.
        await Promise.all(
          [...snapshotsToDelete].map((cellId) =>
            deleteCellSnapshot(bufferId, cellId).catch(() => undefined),
          ),
        )
        return out
      },
    )
    emitAgentEdit({ bufferId, cellId: touchedCellId })
    return result
  }
  const mutate: NotebookMutate = (transition) =>
    runMutation((parts) => Promise.resolve(transition(parts)))
  const mutateWithResultStatus: NotebookMutateWithResultStatus = (transition) =>
    runMutation(async (parts) =>
      transition(parts, await loadPassiveResultStatusReader(bufferId)),
    )

  return {
    bufferId,
    kind: "dexie",
    mutate,
    mutateWithResultStatus,
    readView: () =>
      enqueueBufferTask(bufferId, () => readNotebookView(bufferId)),
    runCell: (cellId, signal, sql, gate) =>
      runHeadlessCell(bufferId, deps, cellId, signal, sql, gate),
  }
}
