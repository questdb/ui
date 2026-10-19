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

export class AuthRefreshUnavailableError extends Error {
  readonly requestNotSent = true
  readonly authRefreshUnavailable = true

  constructor() {
    super(
      "Could not renew your SSO session; the request was not sent. Please retry or sign in again.",
    )
    this.name = "AuthRefreshUnavailableError"
  }
}
