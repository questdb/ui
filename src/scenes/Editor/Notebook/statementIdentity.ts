import { format } from "@questdb/sql-parser"
import type { CellResult, SingleQueryResult } from "../../../store/notebook"
import { getQueriesFromText, normalizeQueryText } from "../Monaco/utils"

// Result identity ignores presentation-only edits while preserving SQL values:
// the QuestDB formatter canonicalizes whitespace/newlines and keyword casing,
// but keeps literals, identifiers and aliases as written. SQL it cannot read
// comes back unchanged, so mid-typing statements keep their trimmed text.
// `capitalize` is pinned here: identity must not follow the editor's
// keyword-casing setting, or every stored result key would change with it.
// Formatting costs about 1 ms per KB and runs several times per edit, so
// statements above the limit keep their trimmed text as identity.
export const MAX_FORMATTED_IDENTITY_LENGTH = 8 * 1024

export const normalizeStatementIdentity = (query: string): string => {
  const normalized = normalizeQueryText(query)
  if (!normalized || normalized.length > MAX_FORMATTED_IDENTITY_LENGTH) {
    return normalized
  }
  try {
    return format(normalized, { capitalize: true })
  } catch {
    return normalized
  }
}

// Every frame is written with the statement text it ran as, so at rest both
// sides are byte-equal and the formatter never runs.
export const sameStatementIdentity = (a: string, b: string): boolean =>
  a === b || normalizeStatementIdentity(a) === normalizeStatementIdentity(b)

export const snapshotResultsMatchQueries = (
  results: SingleQueryResult[],
  queries: string[],
): boolean =>
  results.length > 0 &&
  results.length === queries.length &&
  results.every((result, index) =>
    sameStatementIdentity(result.query, queries[index]),
  )

// Statement identity across edits: normalized text plus occurrence order for
// duplicates. Results follow this key, never their position.
export type StatementKey = string

const STATEMENT_KEY_SEPARATOR = "\u0001"

export const statementKeysForIdentities = (
  identities: string[],
): StatementKey[] => {
  const occurrences = new Map<string, number>()
  return identities.map((identity) => {
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return `${identity}${STATEMENT_KEY_SEPARATOR}${occurrence}`
  })
}

export const statementKeysFor = (texts: string[]): StatementKey[] =>
  statementKeysForIdentities(texts.map(normalizeStatementIdentity))

export const statementIdentityOfKey = (key: StatementKey): string =>
  key.slice(0, key.lastIndexOf(STATEMENT_KEY_SEPARATOR))

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

export const resultStatementKeys = (
  results: SingleQueryResult[],
): StatementKey[] => statementKeysFor(results.map((r) => r.query))

// Callers that already hold the previous frame's keys pass them in, so the
// formatter runs once per result on a hydration. A survivor takes the text of
// the statement it now belongs to: a presentation-only edit keeps the rows,
// and everything that reads `result.query` as raw text (chart resolution,
// snapshots, the tab frame) sees the SQL as the editor holds it.
export const reconcileKeyedResults = (
  statements: string[],
  slotKeys: StatementKey[],
  resultKeys: StatementKey[],
  previous: CellResult,
): ReconciledCellResult | null => {
  if (slotKeys.length === 0 || previous.results.length === 0) return null
  const oldIndexByKey = new Map<StatementKey, number>()
  resultKeys.forEach((key, index) => oldIndexByKey.set(key, index))
  const survivors: SingleQueryResult[] = []
  const survivorKeys: StatementKey[] = []
  const sourceIndices: number[] = []
  const newKeyByOldIndex = new Map<number, StatementKey>()
  slotKeys.forEach((key, slotIndex) => {
    const oldIndex = oldIndexByKey.get(key)
    if (oldIndex === undefined) return
    const candidate = previous.results[oldIndex]
    // A placeholder is not a carryable result: carrying one would resurrect a
    // ghost "Running" slot no execution backs (e.g. from a snapshot a crash
    // left behind). The slot regenerates as "Not run" at display time.
    if (candidate.type === "running" || candidate.type === "queued") return
    const sql = statements[slotIndex]
    survivors.push(
      candidate.query === sql ? candidate : { ...candidate, query: sql },
    )
    survivorKeys.push(key)
    sourceIndices.push(oldIndex)
    newKeyByOldIndex.set(oldIndex, key)
  })
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

export const reconcileResultsForSlotKeys = (
  statements: string[],
  slotKeys: StatementKey[],
  previous: CellResult,
): ReconciledCellResult | null =>
  statements.length === 0
    ? null
    : reconcileKeyedResults(
        statements,
        slotKeys,
        resultStatementKeys(previous.results),
        previous,
      )

export const reconcileResultsForStatements = (
  statements: string[],
  previous: CellResult,
): ReconciledCellResult | null =>
  reconcileResultsForSlotKeys(
    statements,
    statementKeysFor(statements),
    previous,
  )

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
  slotKeys: StatementKey[],
  resultKeys: StatementKey[],
): CellResult | null => {
  // A pending frame is run-owned: the run writes results into it by position,
  // so reshaping it here would land rows under the wrong statement. The frame
  // stays pending until the run's last slot settles, and every completion step
  // after that runs synchronously — deferring the reconcile is always safe.
  if (hasPendingResult(result)) return result
  if (statements.length === 0) return null
  const reconciled = reconcileKeyedResults(
    statements,
    slotKeys,
    resultKeys,
    result,
  )
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
): CellResult | null => {
  if (result == null) return null
  const statements = getQueriesFromText(value)
  return reconcileCellResultForStatements(
    result,
    statements,
    statementKeysFor(statements),
    resultStatementKeys(result.results),
  )
}

export type StatementSlot = {
  key: StatementKey
  sql: string
  result: SingleQueryResult | null
}

export type StatementFrame = {
  slots: StatementSlot[]
  activeSlotIndex: number
}

type SlotResults = Array<SingleQueryResult | null>

// Display and sizing claim results by raw text in slot order, skipping a
// statement no result text matches (one added, one edited away). Every run
// and settle writes results with the text they ran as, so at rest this is
// one string compare per statement and the formatter never runs. The slot a
// result lands in only decides where its rows show until the next reconcile,
// so a skipped case-variant duplicate costs nothing here. A result no
// statement text claims (mid-typing, a selection run) sends the frame to the
// keys.
export const slotResultsByText = (
  statements: string[],
  results: SingleQueryResult[],
): SlotResults | null => {
  const slots: SlotResults = statements.map(() => null)
  let slot = 0
  for (const result of results) {
    while (slot < statements.length && statements[slot] !== result.query) {
      slot++
    }
    if (slot === statements.length) return null
    slots[slot] = result
    slot++
  }
  return slots
}

// Keys must be exact: a run that lands inside the edit debounce writes text
// the entry has not adopted yet, and reading past a statement to claim a
// later one could number a case-variant duplicate wrong. A frame takes the
// statements' keys only when it leads them in order; any other shape goes to
// the formatter.
export const resultKeysByText = (
  statements: string[],
  slotKeys: StatementKey[],
  results: SingleQueryResult[],
): StatementKey[] | null =>
  results.length <= statements.length &&
  results.every((result, index) => result.query === statements[index])
    ? slotKeys.slice(0, results.length)
    : null

export const slotResultsByKey = (
  slotKeys: StatementKey[],
  results: SingleQueryResult[],
): SlotResults => {
  const resultByKey = new Map<StatementKey, SingleQueryResult>()
  resultStatementKeys(results).forEach((key, index) => {
    resultByKey.set(key, results[index])
  })
  return slotKeys.map((key) => resultByKey.get(key) ?? null)
}

const activeSlotIndexOf = (
  slotKeys: StatementKey[],
  slotResults: SlotResults,
  result: CellResult,
): number => {
  if (result.activeStatementKey !== undefined) {
    return Math.max(0, slotKeys.indexOf(result.activeStatementKey))
  }
  const active =
    result.results[clampIndex(result.activeResultIndex, result.results.length)]
  return Math.max(0, slotResults.indexOf(active))
}

export const deriveStatementFrame = (
  statements: string[],
  result: CellResult | null | undefined,
  slotKeys: StatementKey[],
): StatementFrame | null => {
  if (!result || statements.length === 0 || result.results.length === 0) {
    return null
  }
  const slotResults =
    slotResultsByText(statements, result.results) ??
    slotResultsByKey(slotKeys, result.results)
  if (slotResults.every((slot) => slot === null)) return null
  return {
    slots: statements.map((sql, index) => ({
      key: slotKeys[index],
      sql,
      result: slotResults[index],
    })),
    activeSlotIndex: activeSlotIndexOf(slotKeys, slotResults, result),
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
  const statements = getQueriesFromText(value)
  const frame =
    deriveStatementFrame(statements, result, statementKeysFor(statements)) ??
    derivePositionalFrame(result)
  return frame?.slots[frame.activeSlotIndex]?.sql
}
