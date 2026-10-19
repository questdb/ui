import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../../modules/OAuth2/authSessionState"
import type { SessionFailure } from "../../../modules/OAuth2/session"
import { runScriptStatements } from "./runScriptStatements"

type Outcome = SessionFailure & { success: boolean; notification?: string }
afterEach(() => authSessionState.endSession())

describe("script session boundaries", () => {
  it("discards confirmed notifications when a later statement ends the session", async () => {
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
      results: [],
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

  it.each([0, 2])(
    "discards %s completed outcomes when the next statement was never sent",
    async (confirmed) => {
      const queries = Array.from({ length: confirmed + 2 }, (_, i) => i)
      const execute = vi.fn((query: number): Promise<Outcome> => {
        if (query === confirmed) {
          authSessionState.endSession()
          return Promise.resolve({
            success: false,
            sessionEnded: true,
            requestNotSent: true,
          })
        }
        return Promise.resolve({ success: true })
      })
      const result = await runScriptStatements(
        queries,
        authSessionState.capture(),
        execute,
        () => false,
      )
      expect(result).toEqual({
        results: [],
        sessionEnded: true,
      })
      expect(execute).toHaveBeenCalledTimes(confirmed + 1)
    },
  )

  it("discards a session-ended failure from a statement already in flight", async () => {
    const execute = vi.fn((): Promise<Outcome> => {
      authSessionState.endSession()
      return Promise.resolve({ success: false, sessionEnded: true })
    })
    expect(
      await runScriptStatements(
        [1, 2],
        authSessionState.capture(),
        execute,
        () => false,
      ),
    ).toEqual({ results: [], sessionEnded: true })
    expect(execute).toHaveBeenCalledOnce()
  })

  it("discards a completed response after logout and in-tab re-login", async () => {
    authSessionState.markNonSSOAuthenticated()
    const session = authSessionState.capture()
    let finish!: (result: Outcome) => void
    const execute = vi.fn(
      () =>
        new Promise<Outcome>((resolve) => {
          finish = resolve
        }),
    )
    const run = runScriptStatements([1, 2], session, execute, () => false)
    authSessionState.endSession()
    authSessionState.markNonSSOAuthenticated()
    finish({ success: true, notification: "old user's result" })
    expect(await run).toEqual({ results: [], sessionEnded: true })
    expect(execute).toHaveBeenCalledOnce()
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
