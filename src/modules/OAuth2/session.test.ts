import { describe, expect, it } from "vitest"
import {
  AuthRefreshUnavailableError,
  isAuthFailure,
  SESSION_ENDED_MESSAGE,
  SessionEndedError,
  sessionEndedQueryMessage,
} from "./session"

// The client's rejection for a query that the end of the session aborted.
const sessionEnded = {
  position: -1,
  query: "insert into trades values (1)",
  type: "error",
  error: SESSION_ENDED_MESSAGE,
  sessionEnded: true,
}

describe("sessionEndedQueryMessage", () => {
  // Read after signing in again, so it must not ask the user to sign in.
  it("keeps a query that was sent unverified", () => {
    const message = sessionEndedQueryMessage(sessionEnded)
    expect(message).toBe(
      "Interrupted when your previous session ended. The query may have executed; verify its outcome before running it again.",
    )
    expect(message).not.toMatch(/sign in/i)
  })

  // Also a query whose own 401 or 403 ended the session: it was sent, so the
  // message must not say otherwise.
  it("reports a query that was not executed as not executed", () => {
    const message = sessionEndedQueryMessage({
      ...sessionEnded,
      requestNotSent: true,
    })
    expect(message).toBe(
      "Not executed: your previous session ended without running this query.",
    )
    expect(message).not.toMatch(/sign in|sent/i)
  })
})

describe("AuthRefreshUnavailableError", () => {
  // Also thrown after the server rejected a sent request with 401.
  it("says that nothing was executed, not that nothing was sent", () => {
    expect(new AuthRefreshUnavailableError().message).toBe(
      "Could not renew your SSO session; the request was not executed. Please retry or sign in again.",
    )
  })
})

describe("isAuthFailure", () => {
  // The client rejects with plain objects; the classes are thrown internally.
  it.each([
    ["a session end", new SessionEndedError()],
    ["a session-ended result", sessionEnded],
    ["a failed renewal", new AuthRefreshUnavailableError()],
    [
      "a failed renewal result",
      {
        position: -1,
        query: "select 1",
        type: "error",
        error: new AuthRefreshUnavailableError().message,
        authRefreshUnavailable: true,
        requestNotSent: true,
      },
    ],
  ])("recognizes %s", (_, error) => {
    expect(isAuthFailure(error)).toBe(true)
  })

  it.each([
    ["a SQL error", { position: 7, type: "error", error: "unexpected token" }],
    [
      "a network error",
      {
        position: -1,
        type: "error",
        error: "An error occurred, please try again",
        connectionError: true,
      },
    ],
    ["an unauthorized response", { status: 401, error: "Unauthorized" }],
    ["a cancelled query", { position: -1, error: "Cancelled by user" }],
    ["no error", undefined],
  ])("does not treat %s as one", (_, error) => {
    expect(isAuthFailure(error)).toBe(false)
  })
})
