import { endedFor, type SessionFailure } from "../../../modules/OAuth2/session"

import type { AuthSession } from "../../../modules/OAuth2/authSessionState"

// Outcomes belong to the launching session. Discard even a confirmed prefix
// after logout: its notifications must not repopulate the reset query history.
export const runScriptStatements = async <Q, R extends SessionFailure>(
  queries: readonly Q[],
  session: AuthSession,
  execute: (query: Q, index: number) => Promise<R>,
  shouldStop: (result: R) => boolean,
): Promise<{
  results: R[]
  sessionEnded: boolean
}> => {
  const results: R[] = []
  for (let i = 0; i < queries.length; i++) {
    if (!session.isCurrent()) return { results: [], sessionEnded: true }
    const result = await execute(queries[i], i)
    if (endedFor(session, result)) {
      return { results: [], sessionEnded: true }
    }
    results.push(result)
    if (shouldStop(result)) break
  }
  return { results, sessionEnded: false }
}
