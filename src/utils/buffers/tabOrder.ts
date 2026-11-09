import type { Buffer } from "../../store/buffers"

export type BufferPosition = { id: number; position: number }

const isOpenBuffer = (buffer: Buffer) =>
  !buffer.archived || buffer.isTemporary === true

const isArchivedBuffer = (buffer: Buffer) =>
  buffer.archived === true && !buffer.isTemporary

const byTabOrder = (a: Buffer, b: Buffer) => {
  if (a.isTemporary) return 1
  if (b.isTemporary) return -1
  return a.position - b.position
}

export const sortOpenBuffers = (buffers: Buffer[]) =>
  buffers.filter(isOpenBuffer).sort(byTabOrder)

const byNewestArchived = (a: Buffer, b: Buffer) =>
  (b.archivedAt ?? 0) - (a.archivedAt ?? 0)

export const sortArchivedBuffers = (buffers: Buffer[]) =>
  buffers.filter(isArchivedBuffer).sort(byNewestArchived)

export const sortClosedBuffers = (buffers: Buffer[]) =>
  buffers.filter((buffer) => buffer.archived === true).sort(byNewestArchived)

export const sortPinnedBuffers = (buffers: Buffer[]) =>
  sortOpenBuffers(buffers).filter((buffer) => !buffer.isTemporary)

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
