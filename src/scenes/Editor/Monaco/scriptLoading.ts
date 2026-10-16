import type { QueryId } from "../../../utils/questdb/client"

// A script's published progress outlives its mutable request/abort target.
// Keep settlement run-local so session teardown cannot erase its identity.
export const createScriptLoading = (settle: (queryId: QueryId) => void) => {
  let loadingQueryId: QueryId | null = null
  return {
    started: (queryId: QueryId) => {
      loadingQueryId = queryId
    },
    finish: () => {
      if (loadingQueryId === null) return
      settle(loadingQueryId)
      loadingQueryId = null
    },
  }
}
