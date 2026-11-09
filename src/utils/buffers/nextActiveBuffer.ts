import type { Buffer } from "../../store/buffers"
import { sortOpenBuffers } from "./tabOrder"

export const MAX_RECENT_BUFFERS = 20

export const pushRecentBuffer = (recentIds: number[], id: number) =>
  [id, ...recentIds.filter((recentId) => recentId !== id)].slice(
    0,
    MAX_RECENT_BUFFERS,
  )

const isCandidate = (
  buffer: Buffer,
  removedId: number,
  previewId: number | null,
) =>
  !buffer.archived &&
  buffer.id !== removedId &&
  buffer.id !== previewId &&
  !buffer.isTemporary

export const pickNextActiveBuffer = (
  buffers: Buffer[],
  removedId: number,
  recentIds: number[],
  previewId: number | null,
): Buffer | undefined => {
  const candidates = buffers.filter((buffer) =>
    isCandidate(buffer, removedId, previewId),
  )
  const byId = new Map(candidates.map((buffer) => [buffer.id, buffer]))

  for (const recentId of recentIds) {
    const recent = byId.get(recentId)
    if (recent) return recent
  }

  const ordered = sortOpenBuffers(buffers)
  const removedIndex = ordered.findIndex((buffer) => buffer.id === removedId)
  const neighbours = [
    ...ordered.slice(0, Math.max(removedIndex, 0)).reverse(),
    ...ordered.slice(removedIndex + 1),
  ]
  const neighbour = neighbours.find((buffer) => byId.has(buffer.id))
  if (neighbour) return neighbour

  return buffers.find(
    (buffer) => buffer.id === previewId && buffer.id !== removedId,
  )
}

/**
 * Picks the tab to activate after `removedId` is closed or deleted, using the
 * rows currently stored in IndexedDB. The picked buffer seeds the new Monaco
 * model, so it must not come from a caller's render snapshot: a stale closure
 * (e.g. the Alt+W editor action registered at mount) would rebuild the editor
 * from outdated content and the next keystroke would overwrite the saved text.
 * `snapshot` is only used to locate the removed tab's neighbours, because the
 * stored row is already deleted or archived at this point.
 */
export const resolveNextActiveBuffer = async ({
  snapshot,
  loadStored,
  removedId,
  recentIds,
  previewId,
}: {
  snapshot: Buffer[]
  loadStored: () => Promise<Buffer[]>
  removedId: number
  recentIds: number[]
  previewId: number | null
}): Promise<Buffer | undefined> => {
  const stored = (await loadStored())
    .filter((buffer) => buffer.id !== removedId)
    .map((buffer) => ({ ...buffer, isTemporary: buffer.id === previewId }))
  const removed = snapshot.find((buffer) => buffer.id === removedId)
  return pickNextActiveBuffer(
    removed ? [...stored, removed] : stored,
    removedId,
    recentIds,
    previewId,
  )
}
