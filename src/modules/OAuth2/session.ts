import type { AuthSession } from "./ssoAuthState"
import type { SessionFailure } from "../../utils/questdb/types"

export type { SessionFailure } from "../../utils/questdb/types"

export const CANCELLED_BY_USER = "Cancelled by user"

export const isCancelledByUser = (error: unknown): boolean =>
  error === CANCELLED_BY_USER ||
  (typeof error === "object" &&
    error !== null &&
    "error" in error &&
    error.error === CANCELLED_BY_USER)

export const endedFor = (session: AuthSession, error?: unknown): boolean =>
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

export class SessionEndedError extends Error {
  constructor() {
    super("Your session has ended. Please sign in again.")
    this.name = "SessionEndedError"
  }
}

export const isSessionEnded = (error: unknown): boolean =>
  error instanceof SessionEndedError ||
  (typeof error === "object" &&
    error !== null &&
    "sessionEnded" in error &&
    error.sessionEnded === true)

export class AuthRefreshUnavailableError extends Error {
  readonly requestNotSent = true

  constructor() {
    super(
      "Could not renew your SSO session; the query was not sent. Please retry or sign in again.",
    )
    this.name = "AuthRefreshUnavailableError"
  }
}
