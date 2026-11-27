import {
  bufferStore,
  MAX_BUFFER_NAME_LENGTH,
  type Buffer,
} from "../../store/buffers"
import type { EditorContext } from "../../providers/EditorProvider"
import {
  isMonitoringDashboard,
  monitoringTargetKey,
  monitoringTemplateId,
} from "./identity"
import type { MonitoringTarget, MonitoringRefreshSchedule } from "./types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { SessionEndedError } from "../../modules/OAuth2/session"
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
  // First runs of a created dashboard's grid cells.
  runs?: CellRunOutcome[]
}

const wasOpenedMidRun = (run: CellRunOutcome): boolean =>
  "summary" in run && run.summary.interruption === "mounted"

const requests = new Map<string, Promise<MonitoringOpenResult | undefined>>()

// Web Locks also serialize separate browser tabs
// sharing this IndexedDB; the fresh lookup inside the lock is authoritative.
// Like an example dashboard, only an open, unedited dashboard is reused. An
// edited or archived one has left the template (`templateId` is gone) and is
// the user's notebook, so the button then creates a fresh dashboard.
// A created dashboard is filled the way apply_notebook_state fills an agent's
// notebook: the state is committed, then its run-mode cells run before the
// caller activates it. Charts draw themselves once it is shown.
// `onProgress` fires once this call creates a dashboard, so a caller never
// shows progress for just activating an open one.
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
    const gate = { kind: "autoRun", initiator: "user" } as const
    const runs = await runCellsAfterApply(bufferId, cells, abort.signal, gate)
    // The tab is in the tab bar while its first runs are in flight. If the user
    // opens it then, a background run's result is refused at commit (the live
    // notebook owns the cell now) and nothing else would ever run the cell: its
    // auto-refresh only starts once the cell has a result. Run those cells
    // again; the run now goes to the open notebook. A tab closed meanwhile
    // fails the run as deleted or archived, which is not reported.
    const interrupted = new Set(
      runs.filter(wasOpenedMidRun).map((run) => run.cellId),
    )
    if (interrupted.size === 0) return runs
    const retried = await runCellsAfterApply(
      bufferId,
      cells.filter((cell) => interrupted.has(cell.cellId)),
      abort.signal,
      gate,
    )
    const byCell = new Map(retried.map((run) => [run.cellId, run]))
    return runs.map((run) => byCell.get(run.cellId) ?? run)
  }
  const open = async (): Promise<MonitoringOpenResult | undefined> => {
    requireSession()
    const buffers = await bufferStore.getAll()
    requireSession()
    const templateId = monitoringTemplateId(request.target.kind)
    const existing = buffers.find(
      (buffer) =>
        buffer.id !== undefined &&
        buffer.notebookViewState &&
        isMonitoringDashboard(buffer) &&
        buffer.templateId === templateId &&
        !buffer.archived &&
        !buffer.isTemporary &&
        // The lock key ignores case, but the dashboard SQL matches the name
        // exactly: a table re-created under another case needs its own.
        buffer.monitoring?.target.name === request.target.name,
    )
    if (existing) return { buffer: existing, outcome: "reused" }
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
        templateId,
        monitoring: { target: request.target },
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
