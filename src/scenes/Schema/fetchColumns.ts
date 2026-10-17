import { endedFor } from "../../modules/OAuth2/session"
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
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
  const session = authSessionState.capture()
  const queries = [
    "information_schema.questdb_columns()",
    "information_schema.columns()", // fallback for older servers
  ]

  let failure: unknown = new Error("Could not load schema columns.")
  for (const query of queries) {
    if (endedFor(session)) return
    try {
      const response = await quest.query<InformationSchemaColumn>(query)
      if (endedFor(session)) return
      if (response?.type === Type.DQL) {
        onColumns(response.data)
        return
      }
    } catch (error) {
      // Only ordinary query failures are eligible for the compatibility retry.
      if (endedFor(session, error)) return
      failure = error
    }
  }

  if (!endedFor(session)) onError(failure)
}
