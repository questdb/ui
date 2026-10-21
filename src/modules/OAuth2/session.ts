import type { AuthSession } from "./authSessionState"
import type { SessionFailure } from "../../utils/questdb/types"

export type { SessionFailure } from "../../utils/questdb/types"

export const endedFor = (session: AuthSession, error: unknown): boolean =>
  !session.isCurrent() || isSessionEnded(error)

export const sessionFailureOf = (error: unknown): SessionFailure => ({
  ...(isSessionEnded(error) ? { sessionEnded: true } : {}),
  ...(typeof error === "object" &&
  error !== null &&
  "requestNotSent" in error &&
  error.requestNotSent === true
    ? { requestNotSent: true }
    : {}),
})

export const SESSION_ENDED_MESSAGE =
  "Your session has ended. Please sign in again."

// For a query that ending the session interrupted. Its notification outlives
// the session and is read after signing in again, so unlike
// SESSION_ENDED_MESSAGE it must not ask the user to sign in. A query whose
// own 401 or 403 ended the session was sent, but not executed: say only that.
export const sessionEndedQueryMessage = (error: unknown): string =>
  sessionFailureOf(error).requestNotSent
    ? "Not executed: your previous session ended without running this query."
    : "Interrupted when your previous session ended. The query may have executed; verify its outcome before running it again."

export class SessionEndedError extends Error {
  constructor() {
    super(SESSION_ENDED_MESSAGE)
    this.name = "SessionEndedError"
  }
}

export const isSessionEnded = (error: unknown): boolean =>
  error instanceof SessionEndedError ||
  (typeof error === "object" &&
    error !== null &&
    "sessionEnded" in error &&
    error.sessionEnded === true)

export const isAuthRefreshUnavailable = (error: unknown): boolean =>
  error instanceof AuthRefreshUnavailableError ||
  (typeof error === "object" &&
    error !== null &&
    "authRefreshUnavailable" in error &&
    error.authRefreshUnavailable === true)

// The query failed for an authentication reason: its session ended around
// it, or its SSO session could not be renewed. That says nothing about the
// SQL, and has no position in it to mark.
export const isAuthFailure = (error: unknown): boolean =>
  isSessionEnded(error) || isAuthRefreshUnavailable(error)

// Also thrown after the server rejected a sent request with 401, so the
// message says that nothing was executed, not that nothing was sent.
export class AuthRefreshUnavailableError extends Error {
  readonly requestNotSent = true
  readonly authRefreshUnavailable = true

  constructor() {
    super(
      "Could not renew your SSO session; the request was not executed. Please retry or sign in again.",
    )
    this.name = "AuthRefreshUnavailableError"
  }
}
