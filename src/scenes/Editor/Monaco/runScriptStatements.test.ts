import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../../modules/OAuth2/ssoAuthState"
import type { SessionFailure } from "../../../modules/OAuth2/session"
import { runScriptStatements } from "./runScriptStatements"

type Outcome = SessionFailure & { success: boolean; notification?: string }
afterEach(() => authSessionState.endSession())

describe("script session boundaries", () => {
  it("retains two confirmed writes when the third statement ends the session", async () => {
    authSessionState.markNonSSOAuthenticated()
    const execute = vi.fn((sql: string): Promise<Outcome> => {
      if (sql === "third") {
        authSessionState.endSession()
        return Promise.resolve({ success: false, sessionEnded: true })
      }
      return Promise.resolve({ success: true, notification: sql })
    })
    const result = await runScriptStatements(
      ["first insert", "second insert", "third", "never sent"],
      authSessionState.capture(),
      execute,
      () => false,
    )
    expect(result).toEqual({
      results: [
        { success: true, notification: "first insert" },
        { success: true, notification: "second insert" },
      ],
      sessionEnded: true,
    })
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it("does not launch SQL queued before logout/re-login", async () => {
    const session = authSessionState.capture()
    authSessionState.endSession()
    authSessionState.markNonSSOAuthenticated()
    const execute = vi.fn<[], Promise<Outcome>>()
    expect(
      await runScriptStatements(["insert"], session, execute, () => false),
    ).toEqual({ results: [], sessionEnded: true })
    expect(execute).not.toHaveBeenCalled()
  })

  it("preserves the failing outcome when stop-on-failure ends an ordinary script", async () => {
    const execute = vi.fn(
      (): Promise<Outcome> =>
        Promise.resolve({ success: false, notification: "error" }),
    )
    const result = await runScriptStatements(
      [1, 2],
      authSessionState.capture(),
      execute,
      (r) => !r.success,
    )
    expect(result).toEqual({
      results: [{ success: false, notification: "error" }],
      sessionEnded: false,
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
