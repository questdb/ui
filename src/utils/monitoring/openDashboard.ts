import {
  bufferStore,
  MAX_BUFFER_NAME_LENGTH,
  type Buffer,
} from "../../store/buffers"
import type { EditorContext } from "../../providers/EditorProvider"
import {
  buildMonitoringDashboard,
  monitoringFingerprint,
  monitoringTargetKey,
  MONITORING_TEMPLATE_VERSION,
} from "./dashboard"
import type { MonitoringTarget, MonitoringRefreshSchedule } from "./types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { SessionEndedError } from "../../modules/OAuth2/session"
import {
  cellsToRunAfterApply,
  runCellsAfterApply,
  type CellRunOutcome,
} from "../notebooks/runCellsAfterApply"

export type MonitoringRequest = {
  target: MonitoringTarget
  telemetryEnabled: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}

export type MonitoringOpenResult = {
  buffer: Buffer
  outcome: "created" | "reused"
  // The first runs of a created dashboard's grid cells.
  runs?: CellRunOutcome[]
}

const requests = new Map<string, Promise<MonitoringOpenResult | undefined>>()

// Shared by every entry point. Web Locks also serialize separate browser tabs
// sharing this IndexedDB; the fresh lookup inside the lock is authoritative.
// Like an example dashboard, only an open, unedited dashboard is reused. An
// edited or archived one has left the template (`monitoring` is gone) and is
// the user's notebook, so the button then creates a fresh dashboard.
// A created dashboard is filled the way apply_notebook_state fills an agent's
// notebook: the state is committed, then its run-mode cells run before the
// caller activates it. Charts draw themselves once it is shown.
// `onCreate` fires once this call has decided to create a dashboard, so a
// caller shows progress for creation only, never for reusing an open one.
export const openMonitoringDashboard = (
  request: MonitoringRequest,
  addBuffer: EditorContext["addBuffer"],
  onCreate?: () => void,
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
    if (existing) return { buffer: existing, outcome: "reused" }
    requireSession()
    onCreate?.()
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
    const runs = await runCellsAfterApply(
      buffer.id,
      cellsToRunAfterApply(buffer.notebookViewState?.cells ?? []).map(
        (cell) => ({ cellId: cell.id, sql: cell.value }),
      ),
      abort.signal,
      { kind: "autoRun", source: "monitoring" },
    )
    requireSession()
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
