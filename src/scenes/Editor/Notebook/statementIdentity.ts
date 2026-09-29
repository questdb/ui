import type { CellResult, SingleQueryResult } from "../../../store/notebook"
import { getQueriesFromText, normalizeQueryText } from "../Monaco/utils"

export const snapshotResultsMatchQueries = (
  results: SingleQueryResult[],
  queries: string[],
): boolean =>
  results.length > 0 &&
  results.length === queries.length &&
  results.every(
    (result, index) =>
      normalizeQueryText(result.query) === normalizeQueryText(queries[index]),
  )

// Statement identity across edits: normalized text plus occurrence order for
// duplicates. Results follow this key, never their position.
export type StatementKey = string

const STATEMENT_KEY_SEPARATOR = "\u0001"

export const statementKeysFor = (texts: string[]): StatementKey[] => {
  const occurrences = new Map<string, number>()
  return texts.map((text) => {
    const normalized = normalizeQueryText(text)
    const occurrence = occurrences.get(normalized) ?? 0
    occurrences.set(normalized, occurrence + 1)
    return `${normalized}${STATEMENT_KEY_SEPARATOR}${occurrence}`
  })
}

const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0))

const nearestCarriedKey = (
  newKeyByOldIndex: Map<number, StatementKey>,
  anchor: number,
  length: number,
): StatementKey | undefined => {
  for (let distance = 0; distance < length; distance++) {
    const before = newKeyByOldIndex.get(anchor - distance)
    if (before !== undefined) return before
    const after = newKeyByOldIndex.get(anchor + distance)
    if (after !== undefined) return after
  }
  return undefined
}

export type ReconciledCellResult = {
  results: SingleQueryResult[]
  activeStatementKey: StatementKey
  activeResultIndex: number
  // Every previous result survived in its original order, so a script
  // summary still describes the frame.
  allResultsKept: boolean
}

export const reconcileResultsForStatements = (
  statements: string[],
  previous: CellResult,
): ReconciledCellResult | null => {
  if (statements.length === 0 || previous.results.length === 0) return null
  const slotKeys = statementKeysFor(statements)
  const resultKeys = statementKeysFor(previous.results.map((r) => r.query))
  const oldIndexByKey = new Map<StatementKey, number>()
  resultKeys.forEach((key, index) => oldIndexByKey.set(key, index))
  const survivors: SingleQueryResult[] = []
  const survivorKeys: StatementKey[] = []
  const sourceIndices: number[] = []
  const newKeyByOldIndex = new Map<number, StatementKey>()
  for (const key of slotKeys) {
    const oldIndex = oldIndexByKey.get(key)
    if (oldIndex === undefined) continue
    const candidate = previous.results[oldIndex]
    // A placeholder is not a carryable result: carrying one would resurrect a
    // ghost "Running" slot no execution backs (e.g. from a snapshot a crash
    // left behind). The slot regenerates as "Not run" at display time.
    if (candidate.type === "running" || candidate.type === "queued") continue
    survivors.push(candidate)
    survivorKeys.push(key)
    sourceIndices.push(oldIndex)
    newKeyByOldIndex.set(oldIndex, key)
  }
  if (survivors.length === 0) return null
  const carriedActiveKey =
    previous.activeStatementKey !== undefined &&
    slotKeys.includes(previous.activeStatementKey)
      ? previous.activeStatementKey
      : nearestCarriedKey(
          newKeyByOldIndex,
          clampIndex(previous.activeResultIndex, previous.results.length),
          previous.results.length,
        )
  const activeStatementKey = carriedActiveKey ?? slotKeys[0]
  return {
    results: survivors,
    activeStatementKey,
    activeResultIndex: Math.max(0, survivorKeys.indexOf(activeStatementKey)),
    allResultsKept:
      sourceIndices.length === previous.results.length &&
      sourceIndices.every((oldIndex, index) => oldIndex === index),
  }
}

// Legacy records hold the raw cell text — comments included — as the
// statement's query. Parsing it back to the statement lets those results
// survive key matching.
export const normalizeSnapshotResultQuery = (
  result: SingleQueryResult,
): SingleQueryResult => {
  const parsed = getQueriesFromText(result.query)
  if (parsed.length !== 1) return result
  if (normalizeQueryText(parsed[0]) === normalizeQueryText(result.query)) {
    return result
  }
  return { ...result, query: parsed[0] }
}

// Passive invalidation and mounted hydration must agree about whether a
// snapshot contains anything displayable. In particular, matching
// running/queued placeholders are not durable results.
export const snapshotResultsHaveMatchingStatement = (
  results: SingleQueryResult[],
  statements: string[],
): boolean =>
  reconcileResultsForStatements(statements, {
    results: results.map(normalizeSnapshotResultQuery),
    activeResultIndex: 0,
    timestamp: 0,
  }) !== null

export const hasPendingResult = (
  result: CellResult | null | undefined,
): boolean =>
  result?.results.some((r) => r.type === "running" || r.type === "queued") ??
  false

// Applies the carryover to a cell's in-memory result after an SQL edit:
// unchanged statements keep their results, everything else drops. A frame
// that loses slots also loses its script summary — the counts no longer
// describe what is on screen. Zero survivors collapse the frame to null.
export const reconcileCellResultForStatements = (
  result: CellResult,
  statements: string[],
): CellResult | null => {
  // A pending frame is run-owned: the run writes results into it by position,
  // so reshaping it here would land rows under the wrong statement. The frame
  // stays pending until the run's last slot settles, and every completion step
  // after that runs synchronously — deferring the reconcile is always safe.
  if (hasPendingResult(result)) return result
  const reconciled = reconcileResultsForStatements(statements, result)
  if (!reconciled) return null
  const next: CellResult = {
    ...result,
    results: reconciled.results,
    activeResultIndex: reconciled.activeResultIndex,
    activeStatementKey: reconciled.activeStatementKey,
  }
  if (!reconciled.allResultsKept) delete next.script
  return next
}

export const reconcileCellResultForValue = (
  result: CellResult | null | undefined,
  value: string,
): CellResult | null =>
  result == null
    ? null
    : reconcileCellResultForStatements(result, getQueriesFromText(value))

export type StatementSlot = {
  key: StatementKey
  sql: string
  result: SingleQueryResult | null
}

export type StatementFrame = {
  slots: StatementSlot[]
  activeSlotIndex: number
}

export const deriveStatementFrame = (
  statements: string[],
  result: CellResult | null | undefined,
): StatementFrame | null => {
  if (!result || statements.length === 0 || result.results.length === 0) {
    return null
  }
  const slotKeys = statementKeysFor(statements)
  const resultKeys = statementKeysFor(result.results.map((r) => r.query))
  const resultByKey = new Map<StatementKey, SingleQueryResult>()
  resultKeys.forEach((key, index) => {
    resultByKey.set(key, result.results[index])
  })
  const slots = slotKeys.map((key, index) => ({
    key,
    sql: statements[index],
    result: resultByKey.get(key) ?? null,
  }))
  if (slots.every((slot) => slot.result === null)) return null
  const activeKey =
    result.activeStatementKey ??
    resultKeys[clampIndex(result.activeResultIndex, resultKeys.length)]
  const activeSlotIndex = slotKeys.indexOf(activeKey)
  return {
    slots,
    activeSlotIndex: activeSlotIndex === -1 ? 0 : activeSlotIndex,
  }
}

// Fallback for a frame no statement claims: a selection or cursor-fragment
// run records the fragment it executed, so tabs follow the results
// themselves. Display-only — an edit or reload still drops the orphans.
export const derivePositionalFrame = (
  result: CellResult | null | undefined,
): StatementFrame | null => {
  if (!result || result.results.length === 0) return null
  const keys = statementKeysFor(result.results.map((r) => r.query))
  return {
    slots: result.results.map((r, index) => ({
      key: keys[index],
      sql: r.query,
      result: r,
    })),
    activeSlotIndex: clampIndex(
      result.activeResultIndex,
      result.results.length,
    ),
  }
}

// The single-run target mirrors the tab the bottom slot renders — the active
// slot carries its statement even before it has run, so a "Not run" tab
// resolves to its own SQL, never to a stale result index.
export const resolveActiveStatementSql = (
  value: string,
  result: CellResult | null | undefined,
): string | undefined => {
  const frame =
    deriveStatementFrame(getQueriesFromText(value), result) ??
    derivePositionalFrame(result)
  return frame?.slots[frame.activeSlotIndex]?.sql
}
