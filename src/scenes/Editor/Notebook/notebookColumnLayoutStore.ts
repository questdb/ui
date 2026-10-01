import type { ColumnLayout } from "../../../components/ResultGrid/types"

const STORAGE_KEY = "notebook.grid.layout"
const LRU_MAX = 20

type CellLayouts = Record<string, ColumnLayout>
type BufferLayouts = Record<string, CellLayouts>
type LayoutStore = Record<string, BufferLayouts>

const readStore = (): LayoutStore => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as LayoutStore
  } catch {
    return {}
  }
}

const writeStore = (store: LayoutStore): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota / serialization errors — persistence is best-effort
  }
}

export const loadNotebookColumnLayout = (
  bufferId: number | undefined,
  cellId: string,
  queryKey: string,
): ColumnLayout | null => {
  if (bufferId === undefined) return null
  return readStore()[bufferId]?.[cellId]?.[queryKey] ?? null
}

export const saveNotebookColumnLayout = (
  bufferId: number | undefined,
  cellId: string,
  queryKey: string,
  partial: ColumnLayout,
): void => {
  if (bufferId === undefined) return
  const store = readStore()
  if (!store[bufferId]) store[bufferId] = {}
  if (!store[bufferId][cellId]) store[bufferId][cellId] = {}
  const cell = store[bufferId][cellId]
  const existing = cell[queryKey]
  // Re-insert last so key order is recency; the caller's queryKey must be
  // non-integer-like or it sorts first and breaks this LRU.
  delete cell[queryKey]
  cell[queryKey] = { ...existing, ...partial }
  const keys = Object.keys(cell)
  for (let i = 0; i < keys.length - LRU_MAX; i++) {
    delete cell[keys[i]]
  }
  writeStore(store)
}

export const removeNotebookColumnLayout = (
  bufferId: number | undefined,
  cellId: string,
  queryKey: string,
): void => {
  if (bufferId === undefined) return
  const store = readStore()
  const cell = store[bufferId]?.[cellId]
  if (!cell?.[queryKey]) return
  delete cell[queryKey]
  writeStore(store)
}

export const removeNotebookCellLayouts = (
  bufferId: number | undefined,
  cellId: string,
): void => {
  if (bufferId === undefined) return
  const store = readStore()
  if (!store[bufferId]?.[cellId]) return
  delete store[bufferId][cellId]
  writeStore(store)
}

export const removeNotebookBufferLayouts = (bufferId: number): void => {
  const store = readStore()
  if (!store[bufferId]) return
  delete store[bufferId]
  writeStore(store)
}
