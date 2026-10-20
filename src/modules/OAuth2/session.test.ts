import { describe, expect, it } from "vitest"
import { SESSION_ENDED_MESSAGE, sessionEndedQueryMessage } from "./session"

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

  it("reports a query that was never sent as not run", () => {
    const message = sessionEndedQueryMessage({
      ...sessionEnded,
      requestNotSent: true,
    })
    expect(message).toBe(
      "Not run: your previous session ended before this query was sent.",
    )
    expect(message).not.toMatch(/sign in/i)
  })
})
