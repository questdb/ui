import {
  isSettledResult,
  type SingleQueryResult,
} from "../../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../../store/notebookResults"
import { normalizeQueryText } from "../../Monaco/utils"
import { statementKeysForIdentities, type StatementKey } from "../notebookUtils"

export type SnapshotStatementKeys = Pick<
  NotebookResultSnapshot,
  "activeStatementKey" | "refreshErrors"
>

// Snapshots saved before formatter-based identity keyed statements by their
// trimmed text. Those snapshots predate the fetch time on results too, so a
// settled result without one marks the whole snapshot as legacy-keyed; a key
// alone cannot, because a legacy key can spell another statement's head key.
// The saved results are the statements in order, so the legacy key of each
// result maps to the head key of the same result. Keys of statements that are
// gone pass through for the live-key filter to drop. Returns null when the
// snapshot needed no translation.
const keyedByTrimmedText = (results: SingleQueryResult[]): boolean =>
  results.some(
    (result) => isSettledResult(result) && result.fetchedAt === undefined,
  )

export const rekeyLegacyStatementKeys = (
  results: SingleQueryResult[],
  headKeys: StatementKey[],
  keys: SnapshotStatementKeys,
): SnapshotStatementKeys | null => {
  if (!keyedByTrimmedText(results)) return null
  const headByLegacy = new Map<StatementKey, StatementKey>()
  statementKeysForIdentities(
    results.map((result) => normalizeQueryText(result.query)),
  ).forEach((legacyKey, index) => headByLegacy.set(legacyKey, headKeys[index]))
  let rekeyed = false
  const rekey = (key: StatementKey): StatementKey => {
    const headKey = headByLegacy.get(key)
    if (headKey === undefined || headKey === key) return key
    rekeyed = true
    return headKey
  }
  const translated: SnapshotStatementKeys = {
    ...(keys.activeStatementKey !== undefined
      ? { activeStatementKey: rekey(keys.activeStatementKey) }
      : {}),
    ...(keys.refreshErrors
      ? {
          refreshErrors: keys.refreshErrors.map((error) => ({
            ...error,
            statementKey: rekey(error.statementKey),
          })),
        }
      : {}),
  }
  return rekeyed ? translated : null
}
