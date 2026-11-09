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
