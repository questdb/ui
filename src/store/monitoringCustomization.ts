import { Dexie, type Transaction } from "dexie"
import { db } from "./db"
import type { Buffer } from "./buffers"
import { monitoringFingerprint } from "../utils/monitoring/fingerprint"
import { trackEvent } from "../modules/ConsoleEventTracker"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { ConsoleEvent } from "../modules/ConsoleEventTracker/events"

const customize = (
  id: number,
  buffer: Buffer,
  tx: Transaction,
): Partial<Buffer> => {
  if (!buffer.monitoring || buffer.monitoring.customizedAt !== undefined)
    return {}
  const session = authSessionState.capture()
  const monitoring = { ...buffer.monitoring, customizedAt: Date.now() }
  // MCP commits can be inside a larger transaction. Only report committed
  // edits, and write telemetry outside that transaction's table scope.
  let root = tx
  while (root.parent) root = root.parent
  root.on("complete", () => {
    if (!session.isCurrent()) return
    void Dexie.ignoreTransaction(() =>
      trackEvent(ConsoleEvent.NOTEBOOK_TEMPLATE_CUSTOMIZE, {
        notebookId: id,
        source: "table_monitoring",
        kind: monitoring.target.kind,
        templateVersion: monitoring.templateVersion,
      }),
    )
  })
  return { monitoring }
}

// Both UI persistence and passive MCP edits use bufferStore.update. Compare
// authored fields so query results, focus and automatic sizing are excluded.
export const updateWithMonitoringCustomization = (
  id: number,
  patch: Partial<Buffer>,
): Promise<number> => {
  if (!patch.notebookViewState && patch.label === undefined)
    return db.buffers.update(id, patch)
  return db.transaction("rw", db.buffers, async (tx) => {
    const previous = await db.buffers.get(id)
    const next = previous && { ...previous, ...patch }
    const changed =
      previous?.monitoring &&
      previous.monitoring.customizedAt === undefined &&
      previous.notebookViewState &&
      next?.notebookViewState &&
      monitoringFingerprint(previous.label, previous.notebookViewState) !==
        monitoringFingerprint(next.label, next.notebookViewState)
    return db.buffers.update(id, {
      ...patch,
      ...(changed ? customize(id, next, tx) : {}),
    })
  })
}

// Grid column layouts live in localStorage, outside the notebook document.
export const markMonitoringColumnsCustomized = (id: number): Promise<void> =>
  db.transaction("rw", db.buffers, async (tx) => {
    const buffer = await db.buffers.get(id)
    if (!buffer?.notebookViewState || !buffer.monitoring) return
    const patch = customize(id, buffer, tx)
    if (patch.monitoring) await db.buffers.update(id, patch)
  })
