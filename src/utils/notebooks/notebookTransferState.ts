import {
  authSessionState,
  type AuthSession,
} from "../../modules/OAuth2/authSessionState"
import type { NotebookResultSnapshot } from "../../store/notebookResults"

// A bounded bridge for transferred results: a notebook opened while they are
// still being written finds them here (on every hydration until the write
// lands), and a live chart frame larger
// than the disk snapshot limit is kept whole. Eviction is safe: transferred
// draw cells wait for explicit refresh if no faithful frame is left. SQL/query
// data never becomes persistent history.
const MAX_BYTES = 32_000_000
const MAX_AGE_MS = 10 * 60 * 1000
const snapshots = new Map<
  string,
  {
    snapshot: NotebookResultSnapshot
    bytes: number
    expires: number
    session: AuthSession
    // Its disk write has landed: from then on the disk copy is the source, so
    // a snapshot deleted since (e.g. by a refresh) stays deleted.
    written?: boolean
  }
>()
let bytesHeld = 0
const keyOf = (bufferId: number, cellId: string) => `${bufferId}:${cellId}`

const drop = (key: string) => {
  const value = snapshots.get(key)
  if (value) bytesHeld -= value.bytes
  snapshots.delete(key)
}

export const stageTransferSnapshot = (
  snapshot: NotebookResultSnapshot,
): void => {
  for (const [key, value] of snapshots) {
    if (value.expires <= Date.now() || !value.session.isCurrent()) drop(key)
  }
  const key = keyOf(snapshot.bufferId, snapshot.cellId)
  drop(key)
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
  if (bytes > MAX_BYTES) return
  while (bytesHeld + bytes > MAX_BYTES) drop(snapshots.keys().next().value!)
  snapshots.set(key, {
    snapshot,
    bytes,
    expires: Date.now() + MAX_AGE_MS,
    session: authSessionState.capture(),
  })
  bytesHeld += bytes
}

const liveEntry = (bufferId: number, cellId: string) => {
  const value = snapshots.get(keyOf(bufferId, cellId))
  return value && value.expires > Date.now() && value.session.isCurrent()
    ? value
    : undefined
}

export const peekTransferSnapshot = (
  bufferId: number,
  cellId: string,
): { snapshot: NotebookResultSnapshot; written: boolean } | undefined => {
  const value = liveEntry(bufferId, cellId)
  return value && { snapshot: value.snapshot, written: !!value.written }
}

export const markTransferSnapshotWritten = (
  bufferId: number,
  cellId: string,
): void => {
  const value = snapshots.get(keyOf(bufferId, cellId))
  if (value) value.written = true
}

export const takeTransferSnapshot = (
  bufferId: number,
  cellId: string,
): NotebookResultSnapshot | undefined => {
  const snapshot = liveEntry(bufferId, cellId)?.snapshot
  drop(keyOf(bufferId, cellId))
  return snapshot
}

// A cell's staged transfer frame, unless the cell ran again since (e.g. an
// agent's run while the notebook was not open) and saved a newer result.
export const newerTransferSnapshot = (
  staged: NotebookResultSnapshot,
  saved: NotebookResultSnapshot | undefined,
): NotebookResultSnapshot =>
  saved && saved.savedAt > staged.savedAt ? saved : staged

export const hasTransferSnapshot = (
  bufferId: number,
  cellId: string,
): boolean => {
  const value = snapshots.get(keyOf(bufferId, cellId))
  return !!value && value.expires > Date.now() && value.session.isCurrent()
}

let monitorRequest:
  | { bufferId: number; cellId: string; session: AuthSession }
  | undefined
const listeners = new Set<() => void>()

authSessionState.onEnd(() => {
  snapshots.clear()
  bytesHeld = 0
  monitorRequest = undefined
})

export const requestTransferMonitor = (
  bufferId: number,
  cellId: string,
): void => {
  monitorRequest = { bufferId, cellId, session: authSessionState.capture() }
  listeners.forEach((listener) => listener())
}

export const consumeTransferMonitor = (
  bufferId: number,
  cellId: string,
): boolean => {
  if (!monitorRequest?.session.isCurrent()) monitorRequest = undefined
  if (monitorRequest?.bufferId !== bufferId || monitorRequest.cellId !== cellId)
    return false
  monitorRequest = undefined
  return true
}

export const subscribeTransferMonitor = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
