import {
  authSessionState,
  type AuthSession,
} from "../../modules/OAuth2/authSessionState"
import type { NotebookResultSnapshot } from "../../store/notebookResults"

// A bounded, one-use bridge for live chart frames that exceed the disk snapshot
// limit. Eviction is safe: transferred draw cells wait for explicit refresh if
// no faithful frame is left. SQL/query data never becomes persistent history.
const MAX_BYTES = 32_000_000
const MAX_AGE_MS = 10 * 60 * 1000
const snapshots = new Map<
  string,
  {
    snapshot: NotebookResultSnapshot
    bytes: number
    expires: number
    session: AuthSession
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

export const takeTransferSnapshot = (
  bufferId: number,
  cellId: string,
): NotebookResultSnapshot | undefined => {
  const key = keyOf(bufferId, cellId)
  const value = snapshots.get(key)
  drop(key)
  return value && value.expires > Date.now() && value.session.isCurrent()
    ? value.snapshot
    : undefined
}

// Chooses between a cell's staged transfer frame and its IndexedDB snapshot.
// A later disk save (the cell ran again after the transfer, e.g. by an agent
// while it was off screen) wins: the staged frame is older. Otherwise the
// staged frame is shown, and it is durable only if the transfer's own save of
// it landed; a frame that exists only in memory must never be released.
export const resolveTransferSnapshot = (
  staged: NotebookResultSnapshot,
  saved: NotebookResultSnapshot | undefined,
): { snapshot: NotebookResultSnapshot; durable: boolean } => {
  if (saved && saved.savedAt > staged.savedAt)
    return { snapshot: saved, durable: true }
  return {
    snapshot: staged,
    durable: saved !== undefined && saved.savedAt === staged.savedAt,
  }
}

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
