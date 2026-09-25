import type { SingleQueryResult } from "../../../../store/notebook"
import type { NotebookResultSnapshot } from "../../../../store/notebookResults"
import { normalizeQueryText } from "../../Monaco/utils"
import { statementKeysForIdentities, type StatementKey } from "../notebookUtils"

export type SnapshotStatementKeys = Pick<
  NotebookResultSnapshot,
  "activeStatementKey" | "refreshErrors" | "slotFetchedAt"
>

// Snapshots saved before formatter-based identity keyed statements by their
// trimmed text. The saved results are those statements in order, so the
// legacy key of each result maps to the head key of the same result. Keys in
// neither format belong to statements that are gone and pass through for the
// live-key filter to drop. Returns null when no key needed translation.
export const rekeyLegacyStatementKeys = (
  results: SingleQueryResult[],
  headKeys: StatementKey[],
  keys: SnapshotStatementKeys,
): SnapshotStatementKeys | null => {
  const headKeySet = new Set(headKeys)
  const headByLegacy = new Map<StatementKey, StatementKey>()
  statementKeysForIdentities(
    results.map((result) => normalizeQueryText(result.query)),
  ).forEach((legacyKey, index) => headByLegacy.set(legacyKey, headKeys[index]))
  let rekeyed = false
  const rekey = (key: StatementKey): StatementKey => {
    if (headKeySet.has(key)) return key
    const headKey = headByLegacy.get(key)
    if (headKey === undefined) return key
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
    ...(keys.slotFetchedAt
      ? {
          slotFetchedAt: keys.slotFetchedAt.map((stamp) => ({
            ...stamp,
            statementKey: rekey(stamp.statementKey),
          })),
        }
      : {}),
  }
  return rekeyed ? translated : null
}
