import {
  bufferStore,
  MAX_BUFFER_NAME_LENGTH,
  type Buffer,
} from "../../store/buffers"
import { db } from "../../store/db"
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

export type MonitoringRequest = {
  target: MonitoringTarget
  telemetryEnabled: boolean
  walEnabled: boolean
  refreshSchedule?: MonitoringRefreshSchedule
}

export type MonitoringOpenResult = {
  buffer: Buffer
  outcome: "created" | "restored" | "reused"
}

const requests = new Map<string, Promise<MonitoringOpenResult | undefined>>()

// Shared by every entry point. Web Locks also serialize separate browser tabs
// sharing this IndexedDB; the fresh lookup inside the lock is authoritative.
export const openMonitoringDashboard = (
  request: MonitoringRequest,
  addBuffer: EditorContext["addBuffer"],
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
        monitoringTargetKey(buffer.monitoring.target) === key,
    )
    if (existing?.id !== undefined) {
      const restored = existing.archived === true
      const buffer = await db.transaction("rw", db.buffers, async () => {
        requireSession()
        const current = await db.buffers.get(existing.id!)
        if (!current) return undefined
        if (current.archived) {
          const openBuffers = await db.buffers
            .filter((b) => !b.archived)
            .toArray()
          requireSession()
          const patch = {
            archived: false,
            archivedAt: undefined,
            position: Math.max(-1, ...openBuffers.map((b) => b.position)) + 1,
          }
          await db.buffers.update(existing.id!, patch)
          return { ...current, ...patch }
        }
        return current
      })
      if (buffer) return { buffer, outcome: restored ? "restored" : "reused" }
    }
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
    return buffer ? { buffer, outcome: "created" } : undefined
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
