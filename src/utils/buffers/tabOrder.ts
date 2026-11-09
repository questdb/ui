import type { Buffer } from "../../store/buffers"

export type BufferPosition = { id: number; position: number }

const isOpenBuffer = (buffer: Buffer) =>
  !buffer.archived || buffer.isTemporary === true

const byTabOrder = (a: Buffer, b: Buffer) => {
  if (a.isTemporary) return 1
  if (b.isTemporary) return -1
  return a.position - b.position
}

export const sortOpenBuffers = (buffers: Buffer[]) =>
  buffers.filter(isOpenBuffer).sort(byTabOrder)

const byNewestArchived = (a: Buffer, b: Buffer) =>
  (b.archivedAt ?? 0) - (a.archivedAt ?? 0)

export const sortClosedBuffers = (buffers: Buffer[]) =>
  buffers.filter((buffer) => buffer.archived === true).sort(byNewestArchived)

// Every closed tab, including the one under preview. The preview goes first so
// the editor switches to an open tab before the remaining deletions run.
export const closedBuffersToDelete = (buffers: Buffer[]) => {
  const closed = sortClosedBuffers(buffers)
  return [
    ...closed.filter((buffer) => buffer.isTemporary),
    ...closed.filter((buffer) => !buffer.isTemporary),
  ]
}

export const sortPinnedBuffers = (buffers: Buffer[]) =>
  sortOpenBuffers(buffers).filter((buffer) => !buffer.isTemporary)

// Open tabs that would remain after `removedId` is closed or deleted. The
// preview of a closed tab is not an open tab: it is discarded on close and
// cannot keep the workspace non-empty.
export const pinnedBuffersWithout = (buffers: Buffer[], removedId: number) =>
  sortPinnedBuffers(buffers).filter(
    (buffer) => typeof buffer.id === "number" && buffer.id !== removedId,
  )

// Position that places a tab after every pinned open tab. Uses max + 1, not
// the open-tab count: deletes that skip compaction (Alt+W, Tabs panel Delete)
// leave gaps, and a count would tie with the last tab's position.
export const nextOpenPosition = (buffers: Buffer[]) =>
  buffers
    .filter((buffer) => isOpenBuffer(buffer) && !buffer.isTemporary)
    .reduce((max, buffer) => Math.max(max, buffer.position), -1) + 1

const toPositions = (buffers: Buffer[]): BufferPosition[] =>
  buffers
    .filter((buffer) => buffer.id !== undefined)
    .map((buffer, index) => ({ id: buffer.id as number, position: index }))

export const positionsWithout = (buffers: Buffer[], removedId: number) =>
  toPositions(sortOpenBuffers(buffers).filter((b) => b.id !== removedId))

export const positionsAfterMove = (
  buffers: Buffer[],
  movedId: number,
  toIndex: number,
) => {
  const moved = buffers.find((buffer) => buffer.id === movedId)
  if (!moved) return []
  const rest = sortOpenBuffers(buffers).filter((b) => b.id !== movedId)
  rest.splice(toIndex, 0, moved)
  return toPositions(rest)
}
