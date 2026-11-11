import type { NotebookVariable } from "../../../../store/notebook"
import { deleteCellSnapshot } from "../../../../store/notebookResults"
import { removeNotebookCellLayouts } from "../notebookColumnLayoutStore"
import type { CellPlacement } from "../notebookUtils"
import {
  effectiveChange,
  mergeArrangementChanges,
  type ArrangementChange,
} from "./cellArrangement"

export const MAX_UNDO_ENTRIES = 50
export const MAX_RETAINED_CELLS = 20
// Repeated gestures on one cell within this time are one change, e.g. a
// cell moved several rows with the arrow keys.
export const MERGE_WINDOW_MS = 1000

// One user change to the cell list. `change` is what the change did: undo
// does the opposite, redo does it again. An insert also records the
// variables it added, so undoing it can take them away.
export type CellListEntry = {
  change: "insert" | "remove"
  placements: CellPlacement[]
  variables: NotebookVariable[]
}

// A move or resize: undo puts back `before`, redo puts back `after`.
export type ArrangementEntry = ArrangementChange & {
  change: "arrange"
  cellIds: string[]
}

export type UndoEntry = CellListEntry | ArrangementEntry

type History = {
  undo: UndoEntry[]
  redo: UndoEntry[]
  // Cells whose stored results and column layouts were let go to keep the
  // cap. They can still come back, without their rows.
  released: Set<string>
  lastRecord?: { mergeKey: string; at: number }
}

// One history per notebook, for the life of the page: a reload clears it, and
// the snapshot cleanup on mount then drops the results it held.
const histories = new Map<number, History>()

const historyOf = (bufferId: number): History => {
  const existing = histories.get(bufferId)
  if (existing) return existing
  const created: History = { undo: [], redo: [], released: new Set() }
  histories.set(bufferId, created)
  return created
}

const cellIdsOf = (entry: CellListEntry): string[] =>
  entry.placements.map(({ cell }) => cell.id)

// The cells an entry holds out of the document: a removal not yet undone, or
// an insert that was undone.
const absentCellIds = (entry: UndoEntry, stack: "undo" | "redo"): string[] =>
  entry.change !== "arrange" &&
  (stack === "undo") === (entry.change === "remove")
    ? cellIdsOf(entry)
    : []

const heldCellIds = (history: History): string[] => [
  ...history.undo.flatMap((entry) => absentCellIds(entry, "undo")),
  ...history.redo.flatMap((entry) => absentCellIds(entry, "redo")),
]

const releaseCells = (
  bufferId: number,
  history: History,
  cellIds: string[],
) => {
  for (const cellId of cellIds) {
    if (history.released.has(cellId)) continue
    history.released.add(cellId)
    void deleteCellSnapshot(bufferId, cellId).catch(() => undefined)
    removeNotebookCellLayouts(bufferId, cellId)
  }
}

const dropEntries = (
  bufferId: number,
  history: History,
  entries: UndoEntry[],
  stack: "undo" | "redo",
) =>
  releaseCells(
    bufferId,
    history,
    entries.flatMap((entry) => absentCellIds(entry, stack)),
  )

// The oldest held cells give up their stored results first.
const capRetainedCells = (bufferId: number, history: History) => {
  const retained = heldCellIds(history).filter(
    (cellId) => !history.released.has(cellId),
  )
  const excess = retained.length - MAX_RETAINED_CELLS
  if (excess > 0) releaseCells(bufferId, history, retained.slice(0, excess))
}

const settle = (
  bufferId: number,
  from: "undo" | "redo",
  applied: UndoEntry | undefined,
) => {
  const history = historyOf(bufferId)
  const to = from === "undo" ? "redo" : "undo"
  const entry = history[from].pop()
  history.lastRecord = undefined
  if (!entry) return
  if (!applied) {
    dropEntries(bufferId, history, [entry], from)
    return
  }
  // Cells back in the document own their rows again.
  if (applied.change !== "arrange" && absentCellIds(applied, to).length === 0) {
    cellIdsOf(applied).forEach((cellId) => history.released.delete(cellId))
  }
  history[to].push(applied)
  capRetainedCells(bufferId, history)
}

// A merge key joins the entry to the previous one when the same gesture
// repeats within the merge window and nothing was undone in between. A join
// that ends where it started, e.g. a move down and back up, leaves nothing to
// undo, so the entry goes.
const mergeWithTop = (
  history: History,
  entry: UndoEntry,
  mergeKey: string | undefined,
  now: number,
): boolean => {
  const top = history.undo[history.undo.length - 1]
  const last = history.lastRecord
  if (
    !mergeKey ||
    !last ||
    last.mergeKey !== mergeKey ||
    now - last.at >= MERGE_WINDOW_MS ||
    history.redo.length > 0 ||
    top?.change !== "arrange" ||
    entry.change !== "arrange"
  ) {
    return false
  }
  const merged = effectiveChange(mergeArrangementChanges(top, entry))
  if (!merged) {
    history.undo.pop()
    history.lastRecord = undefined
    return true
  }
  history.undo[history.undo.length - 1] = {
    change: "arrange",
    cellIds: [...new Set([...top.cellIds, ...entry.cellIds])],
    ...merged,
  }
  last.at = now
  return true
}

export const recordUndoEntry = (
  bufferId: number,
  entry: UndoEntry,
  mergeKey?: string,
): void => {
  const history = historyOf(bufferId)
  const now = Date.now()
  if (mergeWithTop(history, entry, mergeKey, now)) return
  history.lastRecord = mergeKey ? { mergeKey, at: now } : undefined
  dropEntries(bufferId, history, history.redo, "redo")
  history.redo = []
  history.undo.push(entry)
  const overflow = history.undo.length - MAX_UNDO_ENTRIES
  if (overflow > 0) {
    dropEntries(bufferId, history, history.undo.splice(0, overflow), "undo")
  }
  capRetainedCells(bufferId, history)
}

const topOf = (entries: UndoEntry[] | undefined): UndoEntry | undefined =>
  entries?.[entries.length - 1]

export const peekUndoEntry = (bufferId: number): UndoEntry | undefined =>
  topOf(histories.get(bufferId)?.undo)

export const peekRedoEntry = (bufferId: number): UndoEntry | undefined =>
  topOf(histories.get(bufferId)?.redo)

// Moves the top undo entry to the redo stack once it is applied, with the
// placements read at that time. An entry that could not be applied is dropped.
export const settleUndo = (bufferId: number, applied?: UndoEntry): void =>
  settle(bufferId, "undo", applied)

export const settleRedo = (bufferId: number, applied?: UndoEntry): void =>
  settle(bufferId, "redo", applied)

const clearListeners = new Map<number, Set<() => void>>()

// Lets a notebook's undo toast go away when the history it would step is
// cleared, e.g. by an agent edit.
export const onUndoHistoryCleared = (
  bufferId: number,
  listener: () => void,
): (() => void) => {
  const listeners = clearListeners.get(bufferId) ?? new Set()
  listeners.add(listener)
  clearListeners.set(bufferId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearListeners.delete(bufferId)
  }
}

export const clearNotebookUndoHistory = (bufferId: number): void => {
  const history = histories.get(bufferId)
  if (history) {
    dropEntries(bufferId, history, history.undo, "undo")
    dropEntries(bufferId, history, history.redo, "redo")
    histories.delete(bufferId)
  }
  clearListeners.get(bufferId)?.forEach((listener) => listener())
}

// A cell held by the history keeps its stored results through a remount.
export const isCellHeldByUndo = (bufferId: number, cellId: string): boolean => {
  const history = histories.get(bufferId)
  return (
    history !== undefined &&
    !history.released.has(cellId) &&
    heldCellIds(history).includes(cellId)
  )
}

export const __resetNotebookUndoHistoryForTests = (): void => {
  histories.clear()
  clearListeners.clear()
}
