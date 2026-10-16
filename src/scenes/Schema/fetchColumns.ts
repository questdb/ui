import { isSessionEnded } from "../../modules/OAuth2/session"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { Type } from "../../utils/questdb/types"
import type { InformationSchemaColumn } from "../../utils/questdb/types"
import type { Client } from "../../utils/questdb/client"

// Both compatibility attempts belong to one operation. A terminal rejection
// must not start a fresh request in the logged-out (or next user's) session.
export const fetchColumns = async (
  quest: Pick<Client, "query">,
  onColumns: (columns: InformationSchemaColumn[]) => void,
  onError: (error: unknown) => void,
): Promise<void> => {
  const { isCurrent: isCurrentSession } = ssoAuthState.capture()
  const queries = [
    "information_schema.questdb_columns()",
    "information_schema.columns()", // fallback for older servers
  ]

  let failure: unknown = new Error("Could not load schema columns.")
  for (const query of queries) {
    if (!isCurrentSession()) return
    try {
      const response = await quest.query<InformationSchemaColumn>(query)
      if (!isCurrentSession()) return
      if (response?.type === Type.DQL) {
        onColumns(response.data)
        return
      }
      if (response?.type === Type.ERROR) failure = response
    } catch (error) {
      if (!isCurrentSession() || isSessionEnded(error)) return
      failure = error
      // Only ordinary query failures are eligible for the compatibility retry.
    }
  }

  if (isCurrentSession()) onError(failure)
}
