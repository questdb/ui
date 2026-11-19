import type { Buffer } from "../../store/buffers"

export type BufferPosition = { id: number; position: number }

const isOpenBuffer = (buffer: Buffer) =>
  !buffer.archived || buffer.isTemporary === true

// The user's tabs come first, by position. Then the preview of a closed tab,
// then the AI diff tab: neither is a user tab, so no tab is ever placed after
// them.
const trailingRank = (buffer: Buffer) =>
  buffer.isPreviewBuffer ? 2 : buffer.isTemporary ? 1 : 0

const byTabOrder = (a: Buffer, b: Buffer) =>
  trailingRank(a) - trailingRank(b) || a.position - b.position

// An open tab the user owns and can reorder: not a closed-tab preview and not
// the AI diff tab.
const isPinnedBuffer = (buffer: Buffer) =>
  isOpenBuffer(buffer) && !buffer.isTemporary && !buffer.isPreviewBuffer

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
  buffers.filter(isPinnedBuffer).sort(byTabOrder)

// Open tabs that would remain after `removedId` is closed or deleted. The
// preview of a closed tab and the AI diff tab are not user tabs: they are
// discarded on close and cannot keep the workspace non-empty.
export const pinnedBuffersWithout = (buffers: Buffer[], removedId: number) =>
  sortPinnedBuffers(buffers).filter(
    (buffer) => typeof buffer.id === "number" && buffer.id !== removedId,
  )

// Position that places a tab after every pinned open tab. Uses max + 1, not
// the open-tab count: positions can still have gaps (a delete compacts against
// a render-time list, and a closed tab's row may keep a stale position), and a
// count would then tie with the last tab's position.
export const nextOpenPosition = (buffers: Buffer[]) =>
  buffers
    .filter(isPinnedBuffer)
    .reduce((max, buffer) => Math.max(max, buffer.position), -1) + 1

const toPositions = (buffers: Buffer[]): BufferPosition[] =>
  buffers
    .filter((buffer) => buffer.id !== undefined)
    .map((buffer, index) => ({ id: buffer.id as number, position: index }))

export const positionsWithout = (buffers: Buffer[], removedId: number) =>
  toPositions(sortPinnedBuffers(buffers).filter((b) => b.id !== removedId))

// `toIndex` is an index among the pinned tabs: the tab bar and the Tabs panel
// both list them first, and neither lets a tab move past them.
export const positionsAfterMove = (
  buffers: Buffer[],
  movedId: number,
  toIndex: number,
) => {
  const moved = buffers.find((buffer) => buffer.id === movedId)
  if (!moved || !isPinnedBuffer(moved)) return []
  const rest = sortPinnedBuffers(buffers).filter((b) => b.id !== movedId)
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, moved)
  return toPositions(rest)
}
