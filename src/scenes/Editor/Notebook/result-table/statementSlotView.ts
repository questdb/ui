import type { SingleQueryResult } from "../../../../store/notebook"
import type { CellFetchState } from "../cellRefresh/cellRefreshEngine"
import type { StatementFrame } from "../notebookUtils"

// One tab's view model. Tabs follow the editor's statement list, not the
// compact result array: a statement with no result yet renders the neutral
// "Not run" state, and refresh state attaches by content, never by index.
export type StatementSlotView = {
  key: string
  sql: string
  result: SingleQueryResult | null
  refreshing: boolean
  refreshError?: string
  // Last successful poll — the status line's time.
  fetchedAt?: number
  // Last poll that changed the rows — the grid's viewport/focus reset token.
  swappedAt?: number
}

export const buildStatementSlotViews = (
  frame: StatementFrame,
  fetchState: CellFetchState | undefined,
): StatementSlotView[] =>
  frame.slots.map((slot) => {
    const refreshError = fetchState?.slotErrors.get(slot.key)
    const fetchedAt = fetchState?.slotFetchedAt.get(slot.key)
    const swappedAt = fetchState?.slotSwappedAt.get(slot.key)
    return {
      key: slot.key,
      sql: slot.sql,
      result: slot.result,
      refreshing: fetchState?.slotFetching.has(slot.key) ?? false,
      ...(refreshError !== undefined ? { refreshError } : {}),
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
      ...(swappedAt !== undefined ? { swappedAt } : {}),
    }
  })
