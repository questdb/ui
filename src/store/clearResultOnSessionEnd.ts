import { authSessionState } from "../modules/OAuth2/authSessionState"
import queryActions from "./Query/actions"
import type { QueryAction } from "../types"

// The store outlives the console: signing in again with a password remounts
// it in the same document. Clear the last query result when the session ends,
// so that whoever signs in next does not see the previous login's rows.
// Query notifications stay: they report what the end of the session
// interrupted.
export const clearResultOnSessionEnd = (
  dispatch: (action: QueryAction) => void,
) =>
  authSessionState.onEnd(() => {
    dispatch(queryActions.setResult(undefined))
  })
