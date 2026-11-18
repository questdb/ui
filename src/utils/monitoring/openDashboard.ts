import {
  bufferStore,
  MAX_BUFFER_NAME_LENGTH,
  type Buffer,
} from "../../store/buffers"
import type { EditorContext } from "../../providers/EditorProvider"
import { monitoringFingerprint } from "./fingerprint"
import { monitoringTargetKey, MONITORING_TEMPLATE_VERSION } from "./identity"
import type { MonitoringTarget, MonitoringRefreshSchedule } from "./types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { SessionEndedError } from "../../modules/OAuth2/session"
import { MOUNTED_MID_RUN_NOTE } from "../../scenes/Editor/Notebook/notebookUtils"
import { hasRunMarker } from "../../scenes/Editor/Notebook/resultHydration/cellResultHydration"
import type { NotebookCell } from "../../store/notebook"
import {
  cellsToRunAfterApply,
  runCellsAfterApply,
  type CellRunOutcome,
} from "../notebooks/runCellsAfterApply"

export type MonitoringRequest = {
  target: MonitoringTarget
  telemetryEnabled: boolean
  telemetryUnknown?: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}

export type MonitoringOpenResult = {
  buffer: Buffer
  outcome: "created" | "reused"
  // First runs of grid cells: every one for a created dashboard; for a reused
  // one, those whose first run never landed (reload or session end mid-run).
  runs?: CellRunOutcome[]
}

const MAX_MOUNTED_RETRIES = 2

const wasOpenedMidRun = (run: CellRunOutcome): boolean =>
  "summary" in run && run.summary.note === MOUNTED_MID_RUN_NOTE

// A grid frame only ever comes from a run: the refresh engine tracks a grid
// cell once it has a result or run history. A run commit stamps history even
// for a query error, so only a cell with no run on record (its run never
// landed, or its result was discarded) is run.
const withoutFirstRun = (cells: NotebookCell[]): NotebookCell[] =>
  cellsToRunAfterApply(cells).filter(
    (cell) => cell.result == null && !hasRunMarker(cell),
  )

const requests = new Map<string, Promise<MonitoringOpenResult | undefined>>()

// Shared by every entry point. Web Locks also serialize separate browser tabs
// sharing this IndexedDB; the fresh lookup inside the lock is authoritative.
// Like an example dashboard, only an open, unedited dashboard is reused. An
// edited or archived one has left the template (`monitoring` is gone) and is
// the user's notebook, so the button then creates a fresh dashboard.
// A created dashboard is filled the way apply_notebook_state fills an agent's
// notebook: the state is committed, then its run-mode cells run before the
// caller activates it. Charts draw themselves once it is shown.
// A reused dashboard whose first runs never landed (the page reloaded or the
// session ended mid-run) runs those cells now; nothing else would.
// `onProgress` fires once this call has decided to run first queries (a new
// dashboard, or a reused one's unrun cells), so a caller never shows progress
// for just activating an open one.
export const openMonitoringDashboard = (
  request: MonitoringRequest,
  addBuffer: EditorContext["addBuffer"],
  onProgress?: () => void,
): Promise<MonitoringOpenResult | undefined> => {
  const key = monitoringTargetKey(request.target)
  const session = authSessionState.capture()
  const requestKey = `${authSessionState.getSessionId()}:${key}`
  const pending = requests.get(requestKey)
  if (pending) return pending
  const abort = new AbortController()
  const unsubscribe = authSessionState.onEnd(() => abort.abort())
  const requireSession = () => {
    if (!session.isCurrent()) throw new SessionEndedError()
  }
  const firstRuns = async (
    bufferId: number,
    toRun: NotebookCell[],
  ): Promise<CellRunOutcome[]> => {
    const cells = toRun.map((cell) => ({ cellId: cell.id, sql: cell.value }))
    const gate = { kind: "autoRun", source: "monitoring" } as const
    let runs = await runCellsAfterApply(bufferId, cells, abort.signal, gate)
    // The tab is in the tab bar while its first runs are in flight. If the user
    // opens it then, a background run's result is refused at commit (the live
    // notebook owns the cell now) and nothing else would ever run the cell: its
    // auto-refresh only starts once the cell has a result. Run those cells
    // again; the run now goes to the open notebook.
    for (let attempt = 0; attempt < MAX_MOUNTED_RETRIES; attempt++) {
      const interrupted = new Set(
        runs.filter(wasOpenedMidRun).map((run) => run.cellId),
      )
      if (interrupted.size === 0) break
      // The user may have closed the tab since: an unedited dashboard is then
      // deleted, an edited one archived. Neither runs again.
      const current = await bufferStore.getById(bufferId)
      requireSession()
      if (!current || current.archived) break
      const retried = await runCellsAfterApply(
        bufferId,
        cells.filter((cell) => interrupted.has(cell.cellId)),
        abort.signal,
        gate,
      )
      const byCell = new Map(retried.map((run) => [run.cellId, run]))
      runs = runs.map((run) => byCell.get(run.cellId) ?? run)
    }
    requireSession()
    return runs
  }
  const open = async (): Promise<MonitoringOpenResult | undefined> => {
    requireSession()
    const buffers = await bufferStore.getAll()
    requireSession()
    const existing = buffers.find(
      (buffer) =>
        buffer.id !== undefined &&
        buffer.notebookViewState &&
        buffer.monitoring &&
        !buffer.archived &&
        !buffer.isTemporary &&
        monitoringTargetKey(buffer.monitoring.target) === key,
    )
    if (existing) {
      const pending = withoutFirstRun(existing.notebookViewState?.cells ?? [])
      if (existing.id === undefined || pending.length === 0)
        return { buffer: existing, outcome: "reused" }
      onProgress?.()
      return {
        buffer: existing,
        outcome: "reused",
        runs: await firstRuns(existing.id, pending),
      }
    }
    requireSession()
    onProgress?.()
    // The templates are a separate chunk, loaded only to create a dashboard.
    const { buildMonitoringDashboard } = await import("./dashboard")
    requireSession()
    const notebookViewState = buildMonitoringDashboard({
      ...request,
      name: request.target.name,
      kind: request.target.kind,
    })
    const label = `${request.target.name} · monitoring`.slice(
      0,
      MAX_BUFFER_NAME_LENGTH,
    )
    const buffer = await addBuffer(
      {
        label,
        notebookViewState,
        monitoring: {
          target: request.target,
          templateVersion: MONITORING_TEMPLATE_VERSION,
          initialFingerprint: monitoringFingerprint(label, notebookViewState),
        },
      },
      { activate: false, signal: abort.signal },
    )
    requireSession()
    if (buffer?.id === undefined) return undefined
    const runs = await firstRuns(
      buffer.id,
      cellsToRunAfterApply(buffer.notebookViewState?.cells ?? []),
    )
    return { buffer, outcome: "created", runs }
  }
  const locked = async (): Promise<MonitoringOpenResult | undefined> =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(
          `monitoring:${key}`,
          { signal: abort.signal },
          open,
        )
      : open()
  const promise = locked().finally(() => {
    unsubscribe()
    requests.delete(requestKey)
  })
  requests.set(requestKey, promise)
  return promise
}
