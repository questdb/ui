// Shared error metadata survives the raw client, notebook and agent adapters.
export type SessionFailure = {
  sessionEnded?: boolean
  requestNotSent?: boolean
}

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
  constructor() {
    super(
      "Could not renew your SSO session; the query was not sent. Please retry or sign in again.",
    )
    this.name = "AuthRefreshUnavailableError"
  }
}
