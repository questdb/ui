import type { SingleQueryResult } from "../../../../store/notebook"
import type { CellFetchState } from "../cellRefresh/cellRefreshEngine"
import type { StatementFrame } from "../statementIdentity"

// One tab's view model. Tabs follow the editor's statement list, not the
// compact result array: a statement with no result yet renders the neutral
// "Not run" state, and refresh state attaches by content, never by index.
export type StatementSlotView = {
  key: string
  sql: string
  result: SingleQueryResult | null
  refreshing: boolean
  refreshError?: string
  // The status line's time: when the slot's rows were fetched, or the later
  // poll that verified them unchanged.
  fetchedAt?: number
}

const resultFetchedAt = (result: SingleQueryResult | null) =>
  result !== null && "fetchedAt" in result ? result.fetchedAt : undefined

const latest = (a: number | undefined, b: number | undefined) =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b)

export const buildStatementSlotViews = (
  frame: StatementFrame,
  fetchState: CellFetchState | undefined,
): StatementSlotView[] =>
  frame.slots.map((slot) => {
    const refreshError = fetchState?.slotErrors.get(slot.key)
    const fetchedAt = latest(
      resultFetchedAt(slot.result),
      fetchState?.slotVerifiedAt.get(slot.key),
    )
    return {
      key: slot.key,
      sql: slot.sql,
      result: slot.result,
      refreshing: fetchState?.slotFetching.has(slot.key) ?? false,
      ...(refreshError !== undefined ? { refreshError } : {}),
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
    }
  })
