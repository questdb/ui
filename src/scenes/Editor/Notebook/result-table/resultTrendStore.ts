import type { ColumnDefinition } from "../../../../utils/questdb/types"
import type { DqlQueryResult } from "../../../../store/notebook"
import {
  buildIdentityIndex,
  identityColumnIndexes,
  type IdentityIndex,
} from "../../../../components/ResultGrid/highlight"

export type TrendEntry = {
  result: DqlQueryResult
  identityColumns: string[]
  previous: IdentityIndex | null
  revision: number
  capturedAt: number
}

// When a result first showed: a result read back from storage landed when
// it was saved, a run lands now.
export type ResultLanding = { at: number; restored: boolean }

// One per notebook, keyed per cell and statement. Fed once, when the cells
// state changes, so every statement advances its baseline whether or not its
// tab is mounted, and a cell remount keeps it. The grid only reads. A flash
// is timed from the landing, so a result read back from storage never
// replays it.
export type ResultTrendStore = {
  get: (cellId: string, statementKey: string) => TrendEntry | undefined
  capture: (
    cellId: string,
    statementKey: string,
    result: DqlQueryResult,
    identityColumns: string[],
    landing: ResultLanding,
  ) => TrendEntry
  // Forgets the cell's other statements: an edited statement gets a new key,
  // and the old one would otherwise hold its rows for good.
  retainStatements: (cellId: string, statementKeys: string[]) => void
  releaseCell: (cellId: string) => void
  clearCell: (cellId: string) => void
}

const KEY_SEPARATOR = "\u0000"

const entryKey = (cellId: string, statementKey: string) =>
  `${cellId}${KEY_SEPARATOR}${statementKey}`

const sameStrings = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const sameColumns = (a: ColumnDefinition[], b: ColumnDefinition[]) =>
  a.length === b.length &&
  a.every(
    (column, index) =>
      column.name === b[index].name && column.type === b[index].type,
  )

const indexOf = (
  result: DqlQueryResult,
  identityColumns: string[],
): IdentityIndex | null => {
  const indexes = identityColumnIndexes(result.columns, identityColumns)
  return indexes ? buildIdentityIndex(result.dataset, indexes) : null
}

// A truncated result is a restored snapshot prefix; rows past it would read
// as new against it, so it never becomes a baseline.
const baselineIndexOf = (
  result: DqlQueryResult,
  identityColumns: string[],
): IdentityIndex | null =>
  result.truncated ? null : indexOf(result, identityColumns)

type ReplacedResult = Pick<TrendEntry, "revision" | "capturedAt"> & {
  result: WeakRef<DqlQueryResult>
}

// A run discarded mid-flight puts the replaced result back as the same
// object; remembering it lets that restore return to what was shown, with
// its landing time, instead of comparing against the discarded rows or
// flashing as new. The run holds that object only until it settles, so a
// weak reference lasts exactly as long as the restore is possible and never
// keeps a whole result alive after it.
type LiveEntry = TrendEntry & {
  current: IdentityIndex | null
  replaced: ReplacedResult | null
}

// A released result leaves behind only what its rehydrate needs: the baseline
// it was compared against, and the shape that tells the same rows read back
// from storage apart from a new run.
type ReleasedEntry = Omit<TrendEntry, "result" | "previous"> & {
  result: null
  previous: IdentityIndex
  columns: ColumnDefinition[]
  effectiveQuery: string | undefined
}

type StoredEntry = LiveEntry | ReleasedEntry

const replacedResultOf = (
  existing: LiveEntry | undefined,
): ReplacedResult | null =>
  existing !== undefined
    ? {
        result: new WeakRef(existing.result),
        revision: existing.revision,
        capturedAt: existing.capturedAt,
      }
    : null

const releasedEntryOf = (entry: LiveEntry): ReleasedEntry | null =>
  entry.previous === null
    ? null
    : {
        result: null,
        identityColumns: entry.identityColumns,
        previous: entry.previous,
        revision: entry.revision,
        capturedAt: entry.capturedAt,
        columns: entry.result.columns,
        effectiveQuery: entry.result.effectiveQuery,
      }

const rehydratedEntryOf = (
  released: ReleasedEntry,
  result: DqlQueryResult,
  identityColumns: string[],
  landing: ResultLanding,
): LiveEntry => {
  const sameRun =
    sameStrings(released.identityColumns, identityColumns) &&
    released.effectiveQuery === result.effectiveQuery &&
    sameColumns(released.columns, result.columns)
  return {
    result,
    identityColumns,
    previous: sameRun ? released.previous : null,
    current: baselineIndexOf(result, identityColumns),
    revision: sameRun ? released.revision : released.revision + 1,
    capturedAt: sameRun ? released.capturedAt : landing.at,
    replaced: null,
  }
}

// A run over a released statement has nothing to compare with: the released
// rows are gone, and the baseline they were compared with is one run too old.
const entryAfterReleaseOf = (
  released: ReleasedEntry,
  result: DqlQueryResult,
  identityColumns: string[],
  landing: ResultLanding,
): LiveEntry => ({
  result,
  identityColumns,
  previous: null,
  current: baselineIndexOf(result, identityColumns),
  revision: released.revision + 1,
  capturedAt: landing.at,
  replaced: null,
})

export const createResultTrendStore = (): ResultTrendStore => {
  const entries = new Map<string, StoredEntry>()

  const cellKeys = (cellId: string) => {
    const prefix = entryKey(cellId, "")
    return [...entries.keys()].filter((key) => key.startsWith(prefix))
  }

  return {
    get(cellId, statementKey) {
      const entry = entries.get(entryKey(cellId, statementKey))
      return entry !== undefined && entry.result !== null ? entry : undefined
    },

    capture(cellId, statementKey, result, identityColumns, landing) {
      const key = entryKey(cellId, statementKey)
      const stored = entries.get(key)

      if (stored !== undefined && stored.result === null) {
        const entry = landing.restored
          ? rehydratedEntryOf(stored, result, identityColumns, landing)
          : entryAfterReleaseOf(stored, result, identityColumns, landing)
        entries.set(key, entry)
        return entry
      }

      const existing = stored
      const sameIdentity =
        existing !== undefined &&
        sameStrings(existing.identityColumns, identityColumns)

      if (existing && existing.result === result && sameIdentity) {
        return existing
      }

      const replaced = existing?.replaced
      if (existing && replaced?.result.deref() === result && sameIdentity) {
        const restored = {
          result,
          revision: replaced.revision,
          capturedAt: replaced.capturedAt,
          identityColumns,
          previous: null,
          current: existing.previous,
          replaced: null,
        }
        entries.set(key, restored)
        return restored
      }

      const isNewResult = existing === undefined || existing.result !== result
      const keepsBaseline =
        existing !== undefined &&
        sameIdentity &&
        existing.result.effectiveQuery === result.effectiveQuery &&
        sameColumns(existing.result.columns, result.columns)

      const entry = {
        result,
        identityColumns,
        previous: keepsBaseline ? existing.current : null,
        current: baselineIndexOf(result, identityColumns),
        revision: isNewResult
          ? (existing?.revision ?? 0) + 1
          : existing.revision,
        capturedAt: isNewResult ? landing.at : existing.capturedAt,
        replaced: isNewResult ? replacedResultOf(existing) : existing.replaced,
      }
      entries.set(key, entry)
      return entry
    },

    retainStatements(cellId, statementKeys) {
      const retained = new Set(
        statementKeys.map((statementKey) => entryKey(cellId, statementKey)),
      )
      for (const key of cellKeys(cellId)) {
        if (!retained.has(key)) entries.delete(key)
      }
    },

    releaseCell(cellId) {
      for (const key of cellKeys(cellId)) {
        const entry = entries.get(key)
        if (entry === undefined || entry.result === null) continue
        const released = releasedEntryOf(entry)
        if (released === null) entries.delete(key)
        else entries.set(key, released)
      }
    },

    clearCell(cellId) {
      for (const key of cellKeys(cellId)) entries.delete(key)
    },
  }
}
