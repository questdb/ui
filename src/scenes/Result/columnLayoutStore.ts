import type { ColumnDefinition } from "../../utils/questdb/types"

const STORAGE_KEY = "result.grid.layout"
const LRU_MAX = 50

export type ColumnLayout = {
  columnSizing?: Record<string, number>
  columnOrder?: string[]
  pinnedColumns?: string[]
}

type LayoutStore = Record<string, ColumnLayout>

const hashColumnSet = (columns: ColumnDefinition[]): string => {
  const str = JSON.stringify(
    columns.map((c) => ({ name: c.name, type: c.type })),
  )
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return (hash >>> 0).toString(36)
}

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

export const loadColumnLayout = (
  columns: ColumnDefinition[],
): ColumnLayout | null => {
  if (!columns.length) return null
  return readStore()[hashColumnSet(columns)] ?? null
}

export const removeColumnLayout = (columns: ColumnDefinition[]): void => {
  if (!columns.length) return
  const store = readStore()
  delete store[hashColumnSet(columns)]
  writeStore(store)
}

export const saveColumnLayout = (
  columns: ColumnDefinition[],
  layout: ColumnLayout,
): void => {
  if (!columns.length) return
  const key = hashColumnSet(columns)
  const store = readStore()
  const existing = store[key]
  delete store[key]
  store[key] = { ...existing, ...layout }
  const keys = Object.keys(store)
  for (let i = 0; i < keys.length - LRU_MAX; i++) {
    delete store[keys[i]]
  }
  writeStore(store)
}
