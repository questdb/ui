import { authSessionState } from "../modules/OAuth2/authSessionState"
import queryActions from "./Query/actions"
import type { QueryAction } from "../types"

// The store outlives the console: signing in again with a password remounts
// it in the same document. When the session ends, clear what its login read,
// so that whoever signs in next does not see it: the last query result, and
// the tables and columns that autocomplete, the AI assistant and CSV import
// read until the schema of the next login loads. Query notifications stay:
// they report what the end of the session interrupted. A logout that reloads
// the page discards the store anyway, and keeps the console on screen until
// then: clearing it first would only blank the console before the reload.
export const clearLoginDataOnSessionEnd = (
  dispatch: (action: QueryAction) => void,
) =>
  authSessionState.onEnd((options) => {
    if (options?.reload) return
    dispatch(queryActions.setResult(undefined))
    dispatch(queryActions.setTables([]))
    dispatch(queryActions.setColumns([]))
  })
