import { endedFor, type SessionFailure } from "../../../modules/OAuth2/session"

import type { AuthSession } from "../../../modules/OAuth2/authSessionState"

// Keep confirmed outcomes even when a later statement ends the session. The
// caller records these in history, but must not publish stale datasets/schema.
export const runScriptStatements = async <Q, R extends SessionFailure>(
  queries: readonly Q[],
  session: AuthSession,
  execute: (query: Q, index: number) => Promise<R>,
  shouldStop: (result: R) => boolean,
): Promise<{
  results: R[]
  sessionEnded: boolean
  outcomeUnknown: boolean
}> => {
  const results: R[] = []
  for (let i = 0; i < queries.length; i++) {
    if (!session.isCurrent())
      return { results, sessionEnded: true, outcomeUnknown: false }
    const result = await execute(queries[i], i)
    if (endedFor(session, result)) {
      return {
        results,
        sessionEnded: true,
        outcomeUnknown: result.requestNotSent !== true,
      }
    }
    results.push(result)
    if (shouldStop(result)) break
  }
  return { results, sessionEnded: false, outcomeUnknown: false }
}
