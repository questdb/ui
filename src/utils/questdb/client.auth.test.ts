import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import type { ErrorResult } from "./types"
import {
  REFRESH_RETRY_DELAY_MS,
  REFRESH_REQUEST_TIMEOUT_MS,
  REFRESH_WAIT_TIMEOUT_MS,
  tokenRefresh,
} from "./tokenRefresh"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { getTokenExpirationDate } from "../../modules/OAuth2/utils"
import { Base64 } from "js-base64"
import type { AuthPayload } from "../../modules/OAuth2/types"
import {
  isUnverifiableExecError,
  singleResultFromExec,
  summarizeCellResults,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { executeSingleRaw } from "../executeSingleRaw"
import { mapQueryRawToResult } from "../tools/runQuery"

const token = (overrides: Partial<AuthPayload> = {}): AuthPayload => ({
  access_token: "old",
  refresh_token: "refresh",
  token_type: "Bearer",
  expires_in: 300,
  expires_at: new Date(Date.now() + 300_000).toISOString(),
  ...overrides,
})
const ok = () => new Response(JSON.stringify({ dml: true }), { status: 200 })
const unauthorized = () => new Response("", { status: 401 })

const listen = (type: EventType) => {
  const listener = vi.fn()
  eventBus.subscribe(type, listener)
  return { listener, cleanup: () => eventBus.unsubscribe(type, listener) }
}

afterEach(() => {
  authSessionState.endSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("SSO refresh safety", () => {
  it.each(["SSO", "password"])(
    "records a forbidden statement as unexecuted before %s logout",
    async (login) => {
      if (login === "SSO") authSessionState.setAuthPayload(token())
      else authSessionState.markNonSSOAuthenticated()
      const client = new Client()
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ error: "Access denied to protocol [HTTP]" }),
              { status: 403 },
            ),
          ),
        ),
      )
      const forbidden = vi.fn(() => {
        expect(client.hasSentRequests()).toBe(false)
        authSessionState.endSession()
      })
      eventBus.subscribe(EventType.MSG_CONNECTION_FORBIDDEN, forbidden)
      try {
        await expect(
          client.queryRaw("insert into trades values (1)"),
        ).rejects.toMatchObject({
          sessionEnded: true,
          requestNotSent: true,
        })
        expect(forbidden).toHaveBeenCalledOnce()
      } finally {
        eventBus.unsubscribe(EventType.MSG_CONNECTION_FORBIDDEN, forbidden)
      }
    },
  )

  it("retries a forced 401 refresh after backoff even outside the expiry window", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(token())
    const client = new Client()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        (init?.headers as Record<string, string>).Authorization ===
          "Bearer recovered"
          ? ok()
          : unauthorized(),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("IdP unavailable"))
      .mockImplementationOnce(() => {
        const payload = token({ access_token: "recovered" })
        authSessionState.setAuthPayload(payload)
        return Promise.resolve(payload)
      })
    client.refreshTokenMethod = refresh
    await expect(client.queryRaw("select 1")).rejects.toMatchObject({
      requestNotSent: true,
    })
    await expect(client.queryRaw("select 1")).rejects.toMatchObject({
      requestNotSent: true,
    })
    expect(refresh).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
    await expect(client.queryRaw("select 1")).resolves.toMatchObject({
      type: "dml",
    })
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(authSessionState.hasRefreshFailed()).toBe(false)
  })

  it("retains a rotated token arriving after the query wait when the bearer was already expired", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() - 1).toISOString() }),
    )
    const client = new Client()
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    let requestSignal!: AbortSignal
    client.refreshTokenMethod = (_softDeadline, signal) => {
      requestSignal = signal
      return new Promise((resolve) =>
        setTimeout(() => {
          const payload = token({ access_token: "rotated" })
          if (!signal.aborted) authSessionState.setAuthPayload(payload)
          resolve(payload)
        }, 15_000),
      )
    }
    const pending = client.queryRaw("select 1").catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toMatchObject({ requestNotSent: true })
    expect(requestSignal.aborted).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(client.queryRaw("select 1")).resolves.toMatchObject({
      type: "dml",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer rotated" } }),
    )
  })

  it.each([0, 21_000])(
    "preserves the session after a settled transient refresh failure and a SQL 401 delayed %s ms",
    async (delay) => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      const original = token({
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      authSessionState.setAuthPayload(original)
      const fetchMock = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(unauthorized()), delay)
          }),
      )
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      const refresh = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockImplementationOnce(() => {
          const payload = token({ access_token: "recovered" })
          authSessionState.setAuthPayload(payload)
          return Promise.resolve(payload)
        })
      client.refreshTokenMethod = refresh
      const unauthorizedEvent = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
      const connectionError = listen(EventType.MSG_CONNECTION_ERROR)
      const expectRenewalFailure = async () => {
        const pending = client
          .queryRaw("INSERT INTO trades VALUES (1)")
          .catch((error: unknown) => error as ErrorResult)
        await vi.advanceTimersByTimeAsync(delay)
        const failure = await pending
        expect(failure).toMatchObject({
          type: "error",
          requestNotSent: true,
        })
        if (failure.type !== "error")
          throw new Error("Expected a renewal error")
        expect(failure.error).toContain("the request was not executed")
        expect(failure).not.toHaveProperty("sessionEnded")
        expect(isUnverifiableExecError(failure)).toBe(false)
      }
      try {
        await expectRenewalFailure()
        expect(tokenRefresh.hardDeadline).toBeUndefined()
        expect(authSessionState.getAuthPayload()).toBe(original)
        expect(authSessionState.isAuthenticated()).toBe(true)
        expect(authSessionState.hasRefreshFailed()).toBe(true)
        expect(refresh).toHaveBeenCalledOnce()
        expect(fetchMock).toHaveBeenCalledOnce()

        // A later query during backoff has no pre-fetch refresh to wait for.
        if (delay === 0) {
          await expectRenewalFailure()
          expect(refresh).toHaveBeenCalledOnce()
        }
        expect(unauthorizedEvent.listener).not.toHaveBeenCalled()
        expect(connectionError.listener).not.toHaveBeenCalled()

        fetchMock.mockImplementation(() => Promise.resolve(ok()))
        await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
        await expect(client.queryRaw("SELECT 1")).resolves.toMatchObject({
          type: "dml",
        })
        expect(refresh).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: { Authorization: "Bearer recovered" },
          }),
        )
        expect(authSessionState.hasRefreshFailed()).toBe(false)
        expect(unauthorizedEvent.listener).not.toHaveBeenCalled()
      } finally {
        unauthorizedEvent.cleanup()
        connectionError.cleanup()
      }
    },
  )

  it("reports expired-token backoff as not-sent, never as a database outage or uncertain write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() - 1).toISOString() }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.refreshTokenMethod = vi
      .fn()
      .mockRejectedValue(new Error("IdP unavailable"))
    const connection = listen(EventType.MSG_CONNECTION_ERROR)
    const refresh = listen(EventType.MSG_AUTH_REFRESH_FAILED)
    try {
      for (let i = 0; i < 2; i++) {
        const failure = await client
          .queryRaw("insert into trades values (1)")
          .catch((error: unknown) => error as ErrorResult)
        expect(failure).toMatchObject({
          type: "error",
          requestNotSent: true,
        })
        if (failure.type !== "error")
          throw new Error("Expected a renewal error")
        expect(failure.error).toContain("request was not executed")
        expect(isUnverifiableExecError(failure)).toBe(false)
      }
      expect(fetchMock).not.toHaveBeenCalled()
      expect(connection.listener).not.toHaveBeenCalled()
      expect(refresh.listener).toHaveBeenCalledOnce()
    } finally {
      connection.cleanup()
      refresh.cleanup()
    }
  })

  it.each([20_000, 300_000])(
    "waits no longer than the query wait after a 401, and keeps a late rotated token (token lifetime %s)",
    async (lifetime) => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      authSessionState.setAuthPayload(
        token({ expires_at: new Date(Date.now() + lifetime).toISOString() }),
      )
      const client = new Client()
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(unauthorized)
        .mockImplementation(ok)
      vi.stubGlobal("fetch", fetchMock)
      client.refreshTokenMethod = () =>
        new Promise((resolve) =>
          setTimeout(() => {
            const payload = token({ access_token: "rotated" })
            authSessionState.setAuthPayload(payload)
            resolve(payload)
          }, 15_000),
        )
      const unauthorizedEvent = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
      try {
        let failure: unknown
        const query = client
          .queryRaw("insert into trades values (1)")
          .catch((error: unknown) => {
            failure = error
          })
        await vi.advanceTimersByTimeAsync(9_999)
        expect(failure).toBeUndefined()
        // The renewal is reported as failed at the query wait, so the 401'd
        // statement fails with it instead of waiting for the network deadline.
        await vi.advanceTimersByTimeAsync(1)
        await query
        expect(failure).toMatchObject({
          type: "error",
          authRefreshUnavailable: true,
          requestNotSent: true,
        })
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(authSessionState.isAuthenticated()).toBe(true)
        expect(unauthorizedEvent.listener).not.toHaveBeenCalled()

        // The refresh still runs to its own deadline and installs its token.
        await vi.advanceTimersByTimeAsync(5_000)
        expect(authSessionState.getAuthPayload()?.access_token).toBe("rotated")
        expect(authSessionState.hasRefreshFailed()).toBe(false)
        await expect(client.queryRaw("select 1")).resolves.toMatchObject({
          type: "dml",
        })
        expect(fetchMock).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: { Authorization: "Bearer rotated" },
          }),
        )
        expect(unauthorizedEvent.listener).not.toHaveBeenCalled()
      } finally {
        unauthorizedEvent.cleanup()
      }
    },
  )

  it("bounds successful refreshes when the browser is ahead by an ID-token lifetime", async () => {
    vi.useFakeTimers()
    const providerNow = Date.UTC(2026, 0, 1)
    vi.setSystemTime(providerNow + 300_000)
    const issue = () => {
      const payload = token({
        groups_encoded_in_token: true,
        id_token: `header.${Base64.encodeURI(
          JSON.stringify({
            iat: providerNow / 1000,
            exp: providerNow / 1000 + 300,
          }),
        )}.signature`,
      })
      const expiresAt = getTokenExpirationDate(payload)
      if (!expiresAt) throw new Error("The test ID token must have an exp")
      return { ...payload, expires_at: expiresAt.toISOString() }
    }
    authSessionState.setAuthPayload(issue())
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const refresh = vi.fn(() => {
      const payload = issue()
      authSessionState.setAuthPayload(payload)
      // QuestProvider's sessionData effect schedules this after each success.
      void client.queryRaw("SELECT 1")
      return Promise.resolve(payload)
    })
    client.refreshTokenMethod = refresh

    await client.queryRaw("SELECT 1")
    for (let i = 0; i < 25; i++) await client.queryRaw("SELECT 1")
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    await client.queryRaw("SELECT 1")
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await client.queryRaw("SELECT 1")
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("floors refresh frequency when clock skew leaves two seconds on every token", async () => {
    vi.useFakeTimers()
    const issue = () =>
      token({ expires_at: new Date(Date.now() + 2_000).toISOString() })
    authSessionState.setAuthPayload(issue())
    vi.stubGlobal("fetch", vi.fn().mockImplementation(ok))
    const client = new Client()
    client.refreshTokenMethod = vi.fn(() => {
      const payload = issue()
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    await client.queryRaw("SELECT 1")
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
      await client.queryRaw("SELECT 1")
    }
    expect(client.refreshTokenMethod).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await client.queryRaw("SELECT 1")
    expect(client.refreshTokenMethod).toHaveBeenCalledTimes(2)
  })

  it("does not throttle a short-lived token past its expiry", async () => {
    vi.useFakeTimers()
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() + 20_000).toISOString() }),
    )
    vi.stubGlobal("fetch", vi.fn().mockImplementation(ok))
    const client = new Client()
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    await client.queryRaw("SELECT 1")
    await vi.advanceTimersByTimeAsync(10_000)
    await client.queryRaw("SELECT 2")
    expect(client.refreshTokenMethod).toHaveBeenCalledTimes(2)
  })

  it("refreshes and retries a current-bearer 401 once when the browser clock is behind", async () => {
    authSessionState.setAuthPayload(token()) // The browser thinks expiry is far away.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({ access_token: "new" })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
    try {
      await client.queryRaw("INSERT INTO trades VALUES (1)")
      expect(client.refreshTokenMethod).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: "Bearer new" } }),
      )
      expect(listener).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it("publishes one unauthorized event if the retried token is also rejected", async () => {
    authSessionState.setAuthPayload(token())
    const fetchMock = vi.fn().mockImplementation(unauthorized)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({ access_token: "new" })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
    try {
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        status: 401,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(client.refreshTokenMethod).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
    }
  })

  it("never refreshes a token of unknown expiry, and reports its 401", async () => {
    // Given a provider that sent no lifetime, although it sent a refresh token
    const { expires_at: _, ...unknownExpiry } = token()
    authSessionState.setAuthPayload(unknownExpiry)
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(ok)
      .mockImplementation(unauthorized)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    const refresh = vi.fn()
    client.refreshTokenMethod = refresh
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
    try {
      await client.queryRaw("SELECT 1")

      // When the server rejects the expired token
      await expect(client.queryRaw("SELECT 2")).rejects.toMatchObject({
        status: 401,
      })

      // Then nothing is refreshed or retried: the user signs in again.
      expect(refresh).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
    }
  })

  it.each([
    { lifetime: 20_000, requests: 0 },
    { lifetime: 300_000, requests: 1 },
  ])(
    "keeps a write definitively not-sent when refresh ends the session after $requests SQL requests",
    async ({ lifetime, requests }) => {
      authSessionState.setAuthPayload(
        token({ expires_at: new Date(Date.now() + lifetime).toISOString() }),
      )
      const fetchMock = vi.fn().mockImplementation(unauthorized)
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      client.setCommonHeaders({ Authorization: "Bearer old" })
      client.refreshTokenMethod = () => {
        authSessionState.endSession()
        return Promise.resolve(undefined)
      }
      const { listener, cleanup } = listen(EventType.MSG_CONNECTION_ERROR)
      try {
        const failure = await mapQueryRawToResult(
          client,
          "INSERT INTO trades VALUES (1)",
          100,
        )
        expect(failure).toMatchObject({
          type: "error",
          error: "Your session has ended. Please sign in again.",
          sessionEnded: true,
          requestNotSent: true,
        })
        expect(isUnverifiableExecError(failure)).toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(requests)
        expect(listener).not.toHaveBeenCalled()
      } finally {
        cleanup()
      }
    },
  )

  it.each([
    { lifetime: 20_000, requests: 0 },
    { lifetime: 300_000, requests: 1 },
  ])(
    "keeps a cancelled write definitively not-sent while refreshing after $requests SQL requests",
    async ({ lifetime, requests }) => {
      authSessionState.setAuthPayload(
        token({ expires_at: new Date(Date.now() + lifetime).toISOString() }),
      )
      const fetchMock = vi.fn().mockImplementation(unauthorized)
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      let finishRefresh!: (payload: AuthPayload) => void
      let requestSignal: AbortSignal | undefined
      let startRefresh!: () => void
      const started = new Promise<void>((resolve) => {
        startRefresh = resolve
      })
      client.refreshTokenMethod = vi.fn((_deadline, signal) => {
        requestSignal = signal
        startRefresh()
        return new Promise<AuthPayload>((resolve) => {
          finishRefresh = resolve
        })
      })
      const controller = new AbortController()
      const sql = "INSERT INTO trades VALUES (1)"
      const pending = executeSingleRaw(
        client,
        sql,
        undefined,
        controller.signal,
      )
      await started
      const completion = tokenRefresh.hardDeadline
      controller.abort()
      const result = await pending
      expect(result).toMatchObject({
        type: "error",
        error: "Cancelled by user",
        requestNotSent: true,
      })
      expect(isUnverifiableExecError(result)).toBe(false)
      const summary = summarizeCellResults({
        id: "cancelled",
        position: 0,
        value: sql,
        result: {
          results: [singleResultFromExec(result, sql)],
          activeResultIndex: 0,
          timestamp: Date.now(),
        },
      })
      expect(summary).not.toHaveProperty("unverified")
      expect(summary).not.toHaveProperty("note")
      expect(fetchMock).toHaveBeenCalledTimes(requests)
      expect(requestSignal?.aborted).toBe(false)

      const payload = token({
        access_token: "renewed",
        refresh_token: "rotated",
      })
      authSessionState.setAuthPayload(payload)
      finishRefresh(payload)
      await completion
      expect(fetchMock).toHaveBeenCalledTimes(requests)
      expect(client.refreshTokenMethod).toHaveBeenCalledOnce()
    },
  )

  it.each([false, true])(
    "keeps cancellation of an unconfirmed SQL fetch uncertain (retry: %s)",
    async (retry) => {
      authSessionState.setAuthPayload(token())
      let startRequest!: () => void
      const started = new Promise<void>((resolve) => {
        startRequest = resolve
      })
      const pendingFetch = (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
          startRequest()
        })
      const fetchMock = vi.fn(pendingFetch)
      if (retry)
        fetchMock.mockImplementationOnce(() => Promise.resolve(unauthorized()))
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      client.refreshTokenMethod = () => {
        const payload = token({ access_token: "renewed" })
        authSessionState.setAuthPayload(payload)
        return Promise.resolve(payload)
      }
      const controller = new AbortController()
      const pending = executeSingleRaw(
        client,
        "INSERT INTO trades VALUES (1)",
        undefined,
        controller.signal,
      )
      await started
      controller.abort()
      const result = await pending
      expect(result).toMatchObject({
        type: "error",
        error: "Cancelled by user",
      })
      expect(result).not.toHaveProperty("requestNotSent")
      expect(isUnverifiableExecError(result)).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(retry ? 2 : 1)
    },
  )

  it("keeps an in-flight write uncertain when its session ends", async () => {
    authSessionState.setAuthPayload(token())
    let finish!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    )
    const pending = mapQueryRawToResult(
      new Client(),
      "INSERT INTO trades VALUES (1)",
      100,
    )
    authSessionState.endSession()
    finish(ok())
    const failure = await pending
    expect(failure).toMatchObject({ type: "error", sessionEnded: true })
    expect(failure).not.toHaveProperty("requestNotSent")
    expect(isUnverifiableExecError(failure)).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("does not let an old in-flight refresh block or overwrite a new login", async () => {
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() + 20_000).toISOString() }),
    )
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    let resolveOld!: (value: AuthPayload) => void
    client.refreshTokenMethod = () =>
      new Promise<AuthPayload>((resolve) => {
        resolveOld = resolve
      })
    const parked = client.queryRaw("INSERT INTO trades VALUES (1)")
    const cancelled = expect(parked).rejects.toMatchObject({
      error: "Your session has ended. Please sign in again.",
    })
    await Promise.resolve()
    authSessionState.endSession()
    authSessionState.setAuthPayload(
      token({
        access_token: "new-login",
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      }),
    )
    client.refreshTokenMethod = () => {
      const payload = token({ access_token: "new-refreshed" })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    }
    await client.queryRaw("SELECT 1")
    resolveOld(token({ access_token: "obsolete" }))
    await cancelled
    await client.queryRaw("SELECT 2")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer new-refreshed" },
      }),
    )
  })

  it("caps failure backoff at expiry so a recovered provider gets another chance", async () => {
    vi.useFakeTimers()
    const expiry = Date.now() + 30_000
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(expiry).toISOString() }),
    )
    vi.stubGlobal("fetch", vi.fn().mockImplementation(ok))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    const refresh = vi.fn().mockRejectedValue(new Error("offline"))
    client.refreshTokenMethod = refresh
    await vi.advanceTimersByTimeAsync(1_000)
    await client.queryRaw("SELECT 1")
    await vi.advanceTimersByTimeAsync(5_000)
    await client.queryRaw("SELECT 2")
    await vi.advanceTimersByTimeAsync(10_000)
    await client.queryRaw("SELECT 3")
    expect(refresh).toHaveBeenCalledTimes(3)
    refresh.mockImplementationOnce(() => {
      const payload = token({ access_token: "recovered" })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    await vi.advanceTimersByTimeAsync(14_000)
    await client.queryRaw("SELECT 4")
    expect(refresh).toHaveBeenCalledTimes(4)
    expect(authSessionState.hasRefreshFailed()).toBe(false)
  })
})

describe("transient post-expiry refresh recovery", () => {
  it("does not send an expired bearer during backoff and recovers on retry", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
    )
    const fetchMock = vi
      .fn<[string, RequestInit], Promise<Response>>()
      .mockImplementation(() => Promise.resolve(ok()))
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementationOnce(() => {
        const payload = token({ access_token: "recovered" })
        authSessionState.setAuthPayload(payload)
        return Promise.resolve(payload)
      })
    client.refreshTokenMethod = refresh
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
    try {
      await expect(
        client.queryRaw("INSERT INTO trades VALUES (1)"),
      ).rejects.toMatchObject({ type: "error" })
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        type: "error",
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
      expect(refresh).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
      await client.queryRaw("SELECT 1")
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
        Authorization: "Bearer recovered",
      })
    } finally {
      cleanup()
    }
  })

  describe("a retry by a person", () => {
    const expiredLogin = () => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      authSessionState.setAuthPayload(
        token({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
      )
      const fetchMock = vi
        .fn<[string, RequestInit], Promise<Response>>()
        .mockImplementation(() => Promise.resolve(ok()))
      vi.stubGlobal("fetch", fetchMock)
      return { client: new Client(), fetchMock }
    }
    const renewed = (access_token: string) => () => {
      const payload = token({ access_token })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    }

    it("renews at once during the backoff", async () => {
      // Given a failed renewal, whose backoff refuses the next query at once
      const { client, fetchMock } = expiredLogin()
      const refresh = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockImplementationOnce(renewed("recovered"))
      client.refreshTokenMethod = refresh
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        authRefreshUnavailable: true,
      })
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        authRefreshUnavailable: true,
      })
      expect(refresh).toHaveBeenCalledOnce()
      expect(tokenRefresh.inBackoff()).toBe(true)

      // When a person retries before the backoff has passed
      await client.prepareRenewalRetry()

      // Then the query renews the session and is sent with the new bearer
      await expect(client.queryRaw("SELECT 1")).resolves.toMatchObject({
        type: "dml",
      })
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
        Authorization: "Bearer recovered",
      })
    })

    it("waits for a renewal still in flight instead of starting another", async () => {
      // Given a query released by the wait deadline while the identity
      // provider has not answered its renewal yet
      const { client, fetchMock } = expiredLogin()
      let answer!: () => void
      const refresh = vi.fn(
        () =>
          new Promise<AuthPayload>((resolve) => {
            answer = () => void renewed("late")().then(resolve)
          }),
      )
      client.refreshTokenMethod = refresh
      const query = client.queryRaw("SELECT 1").catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(REFRESH_WAIT_TIMEOUT_MS)
      expect(await query).toMatchObject({ authRefreshUnavailable: true })

      // When a person retries
      let prepared = false
      const retry = client.prepareRenewalRetry().then(() => {
        prepared = true
      })
      await vi.advanceTimersByTimeAsync(5_000)

      // Then the retry waits for that renewal, which may rotate the only
      // usable refresh token, and then uses its bearer
      expect(prepared).toBe(false)
      answer()
      await retry
      await expect(client.queryRaw("SELECT 1")).resolves.toMatchObject({
        type: "dml",
      })
      expect(refresh).toHaveBeenCalledOnce()
      expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
        Authorization: "Bearer late",
      })
    })

    it("renews again once a renewal in flight reaches its network deadline", async () => {
      // Given a renewal the identity provider never answers
      const { client, fetchMock } = expiredLogin()
      const refresh = vi
        .fn()
        .mockImplementationOnce(() => new Promise<AuthPayload>(() => {}))
        .mockImplementationOnce(renewed("recovered"))
      client.refreshTokenMethod = refresh
      const query = client.queryRaw("SELECT 1").catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(REFRESH_WAIT_TIMEOUT_MS)
      expect(await query).toMatchObject({ authRefreshUnavailable: true })

      // When a person retries, it waits until that request is given up
      let prepared = false
      const retry = client.prepareRenewalRetry().then(() => {
        prepared = true
      })
      await vi.advanceTimersByTimeAsync(
        REFRESH_REQUEST_TIMEOUT_MS - REFRESH_WAIT_TIMEOUT_MS - 1,
      )
      expect(prepared).toBe(false)
      expect(refresh).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1)
      await retry

      // Then the retried query starts a new renewal
      await expect(client.queryRaw("SELECT 1")).resolves.toMatchObject({
        type: "dml",
      })
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
        Authorization: "Bearer recovered",
      })
    })

    it("keeps the throttle after a successful renewal", async () => {
      // Given a renewal that has just succeeded
      const { client } = expiredLogin()
      client.refreshTokenMethod = vi.fn(renewed("recovered"))
      await client.queryRaw("SELECT 1")
      expect(tokenRefresh.inBackoff()).toBe(true)

      // When a person retries
      await client.prepareRenewalRetry()

      // Then only the wait after a failure is skipped, not the throttle that
      // keeps a fast browser clock from renewing again and again
      expect(tokenRefresh.inBackoff()).toBe(true)
    })

    describe("running a statement again while the failed renewal is in flight", () => {
      // A renewal that the identity provider never answers fails at the wait
      // deadline, but holds the slot until its network deadline. The next one
      // succeeds.
      const renewalFailedAtWaitDeadline = async () => {
        const { client, fetchMock } = expiredLogin()
        const refresh = vi
          .fn()
          .mockImplementationOnce(() => new Promise<AuthPayload>(() => {}))
          .mockImplementationOnce(renewed("recovered"))
        client.refreshTokenMethod = refresh
        const query = client
          .queryRaw("SELECT 1")
          .catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(REFRESH_WAIT_TIMEOUT_MS)
        expect(await query).toMatchObject({ authRefreshUnavailable: true })
        return { client, fetchMock, refresh }
      }
      const untilGivenUp =
        REFRESH_REQUEST_TIMEOUT_MS -
        REFRESH_WAIT_TIMEOUT_MS -
        REFRESH_RETRY_DELAY_MS

      it("waits for that renewal to be given up after the backoff, then renews", async () => {
        // Given a renewal that failed at its wait deadline
        const { client, fetchMock, refresh } =
          await renewalFailedAtWaitDeadline()

        // When the statement runs again during the backoff, it fails at once,
        // as after any failed renewal
        await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
          authRefreshUnavailable: true,
          requestNotSent: true,
        })

        // When it runs again after the backoff
        await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
        const onRefreshWait = vi.fn()
        let settled = false
        const rerun = client
          .queryRaw("SELECT 1", undefined, { onRefreshWait })
          .finally(() => {
            settled = true
          })

        // Then it waits for that renewal, which may still rotate the only
        // usable refresh token, until it is given up
        expect(onRefreshWait).toHaveBeenCalledWith(untilGivenUp)
        await vi.advanceTimersByTimeAsync(untilGivenUp - 1)
        expect(settled).toBe(false)
        expect(refresh).toHaveBeenCalledOnce()

        // And then renews the session, and is sent with the new bearer
        await vi.advanceTimersByTimeAsync(1)
        await expect(rerun).resolves.toMatchObject({ type: "dml" })
        expect(refresh).toHaveBeenCalledTimes(2)
        expect(onRefreshWait).toHaveBeenLastCalledWith(REFRESH_WAIT_TIMEOUT_MS)
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
          Authorization: "Bearer recovered",
        })
      })

      it("sends it with the token that renewal returns late", async () => {
        // Given a renewal that failed at its wait deadline, but whose request
        // is still in flight
        const { client, fetchMock } = expiredLogin()
        let answer!: () => void
        const refresh = vi.fn(
          () =>
            new Promise<AuthPayload>((resolve) => {
              answer = () => void renewed("late")().then(resolve)
            }),
        )
        client.refreshTokenMethod = refresh
        const query = client
          .queryRaw("SELECT 1")
          .catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(REFRESH_WAIT_TIMEOUT_MS)
        expect(await query).toMatchObject({ authRefreshUnavailable: true })

        // When the statement runs again after the backoff, and the identity
        // provider then answers
        await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
        const rerun = client.queryRaw("SELECT 1")
        await vi.advanceTimersByTimeAsync(5_000)
        answer()

        // Then it is sent with that token, without another renewal
        await expect(rerun).resolves.toMatchObject({ type: "dml" })
        expect(refresh).toHaveBeenCalledOnce()
        expect(fetchMock.mock.lastCall?.[1]?.headers).toEqual({
          Authorization: "Bearer late",
        })
      })

      it("does not hold a background read", async () => {
        const { client, fetchMock, refresh } =
          await renewalFailedAtWaitDeadline()
        await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)

        await expect(
          client.queryRaw("tables()", { background: true }),
        ).rejects.toMatchObject({ authRefreshUnavailable: true })
        expect(refresh).toHaveBeenCalledOnce()
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it("stops waiting when the statement is cancelled", async () => {
        const { client, fetchMock, refresh } =
          await renewalFailedAtWaitDeadline()
        await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)

        const { promise, queryId } = client.queryRaw("SELECT 1", {
          cancellable: true,
        })
        client.abort(queryId)

        await expect(promise).rejects.toMatchObject({
          error: "Cancelled by user",
          requestNotSent: true,
        })
        await vi.advanceTimersByTimeAsync(untilGivenUp)
        expect(refresh).toHaveBeenCalledOnce()
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })
  })

  it("keeps the session during repeated transient post-expiry failures", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(
      token({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
    )
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.refreshTokenMethod = vi.fn().mockRejectedValue(new Error("offline"))
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_UNAUTHORIZED)
    try {
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        type: "error",
      })
      await vi.advanceTimersByTimeAsync(5_000)
      await expect(client.queryRaw("SELECT 2")).rejects.toMatchObject({
        type: "error",
      })
      expect(listener).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(client.queryRaw("SELECT 3")).rejects.toMatchObject({
        type: "error",
      })
      expect(listener).not.toHaveBeenCalled()
      expect(authSessionState.isAuthenticated()).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it.each([20_000, 300_000])(
    "frees and aborts a hung slot at the fixed hard deadline (%s ms lifetime)",
    async (lifetime) => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      authSessionState.setAuthPayload(
        token({ expires_at: new Date(Date.now() + lifetime).toISOString() }),
      )
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementationOnce(unauthorized).mockImplementation(ok),
      )
      const client = new Client()
      const requests: AbortSignal[] = []
      client.refreshTokenMethod = vi.fn(
        (_deadline: AbortSignal, network: AbortSignal) => {
          requests.push(network)
          return new Promise<AuthPayload>(() => {})
        },
      )
      const first = client.queryRaw("SELECT 1").catch(() => {})
      // If not in the refresh window, the server-side 401 starts recovery.
      await vi.advanceTimersByTimeAsync(10_000)
      expect(requests).toHaveLength(1)
      expect(requests[0].aborted).toBe(false)
      const duration = REFRESH_REQUEST_TIMEOUT_MS
      await vi.advanceTimersByTimeAsync(duration - 10_000)
      expect(requests[0].aborted).toBe(true)
      await first
      client.refreshTokenMethod = vi.fn(() => {
        const payload = token({ access_token: "recovered" })
        authSessionState.setAuthPayload(payload)
        return Promise.resolve(payload)
      })
      // Move into the refresh window for the long-lifetime case.
      if (lifetime > duration)
        await vi.advanceTimersByTimeAsync(lifetime - duration)
      await client.queryRaw("SELECT 2")
      expect(client.refreshTokenMethod).toHaveBeenCalledTimes(1)
    },
  )
})

describe("query completion session isolation", () => {
  const resultBody = JSON.stringify({
    columns: [{ name: "table_name", type: "STRING" }],
    dataset: [["private_old_session_table"]],
    count: 1,
  })

  describe.each(["response", "body"] as const)("delayed %s", (phase) => {
    it.each(phase === "response" ? [200, 400, 401, 403, 502] : [200, 400, 403])(
      "discards HTTP %s after refresh logout and password re-login",
      async (status) => {
        vi.useFakeTimers()
        authSessionState.setAuthPayload(
          token({
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
        )
        const body =
          status === 200
            ? resultBody
            : JSON.stringify({ error: "Access denied to protocol [HTTP]" })
        let finish!: () => void
        const held = new Promise<Response>((resolve) => {
          if (phase === "response") {
            finish = () => resolve(new Response(body, { status }))
          } else {
            const text = new Promise<string>((resolveBody) => {
              finish = () => resolveBody(body)
            })
            resolve({
              ok: status === 200,
              status,
              text: () => text,
            } as Response)
          }
        })
        vi.stubGlobal("fetch", vi.fn().mockReturnValue(held))
        const client = new Client()
        client.setCommonHeaders({ Authorization: "Bearer old" })
        const commitCatalog = vi.fn()
        const publish = vi.spyOn(eventBus, "publish")
        const oldQuery = client.showTables().then(commitCatalog)
        const rejected = expect(oldQuery).rejects.toMatchObject({
          sessionEnded: true,
        })
        await vi.advanceTimersByTimeAsync(31_000)
        client.refreshTokenMethod = () => {
          authSessionState.endSession()
          return Promise.resolve(undefined)
        }
        await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
          sessionEnded: true,
        })
        authSessionState.markNonSSOAuthenticated()
        client.setCommonHeaders({ Authorization: "Bearer new-user" })
        publish.mockClear()

        finish()
        await rejected

        expect(commitCatalog).not.toHaveBeenCalled()
        expect(publish).not.toHaveBeenCalled()
        expect(authSessionState.isAuthenticated()).toBe(true)
      },
    )
  })

  it.each(["network", "body"] as const)(
    "suppresses an old session's delayed %s failure",
    async (phase) => {
      authSessionState.setAuthPayload(token())
      let fail!: (error: Error) => void
      const pending = new Promise<never>((_, reject) => {
        fail = reject
      })
      const readBody = vi.fn(() => pending)
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockReturnValue(
            phase === "network"
              ? pending
              : Promise.resolve({ ok: true, status: 200, text: readBody }),
          ),
      )
      const publish = vi.spyOn(eventBus, "publish")
      const client = new Client()
      const query = client.queryRaw("SELECT 1")
      const rejected = expect(query).rejects.toMatchObject({
        sessionEnded: true,
      })
      if (phase === "body")
        await vi.waitFor(() => expect(readBody).toHaveBeenCalled())
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      fail(new Error("Old request failed"))
      await rejected
      expect(publish).not.toHaveBeenCalled()
    },
  )

  it.each([200, 403, 502])(
    "discards a password session's delayed HTTP %s result after re-login",
    async (status) => {
      authSessionState.markNonSSOAuthenticated()
      let finish!: (response: Response) => void
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve
            }),
        ),
      )
      const publish = vi.spyOn(eventBus, "publish")
      const client = new Client()
      client.setCommonHeaders({ Authorization: "Bearer user-a" })
      const query = client.queryRaw("SELECT 1")
      const rejected = expect(query).rejects.toMatchObject({
        sessionEnded: true,
      })
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      client.setCommonHeaders({ Authorization: "Bearer user-b" })
      finish(
        new Response(
          status === 200 ? resultBody : "Access denied to protocol [HTTP]",
          { status },
        ),
      )
      await rejected
      expect(publish).not.toHaveBeenCalled()
      expect(authSessionState.isAuthenticated()).toBe(true)
    },
  )

  it("allows a delayed result after token refresh in the same session", async () => {
    authSessionState.setAuthPayload(token())
    let finish!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const client = new Client()
    const query = client.showTables()
    authSessionState.setAuthPayload(token({ access_token: "refreshed" }))
    finish(new Response(resultBody))
    await expect(query).resolves.toMatchObject({
      type: "dql",
      data: [{ table_name: "private_old_session_table" }],
    })
  })
})

describe("REST/basic 401 comparison", () => {
  it.each(["Bearer rest-token", "Basic dXNlcjpwYXNz"])(
    "publishes a 401 for the current %s header",
    async (authorization) => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(unauthorized))
      const client = new Client()
      client.setCommonHeaders({ Authorization: authorization })
      const { listener, cleanup } = listen(
        EventType.MSG_CONNECTION_UNAUTHORIZED,
      )
      try {
        await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
          status: 401,
        })
        expect(listener).toHaveBeenCalledTimes(1)
      } finally {
        cleanup()
      }
    },
  )

  it.each(["Bearer rest-token", "Basic dXNlcjpwYXNz"])(
    "ignores a stale 401 after replacing %s",
    async (authorization) => {
      let resolve!: (response: Response) => void
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((done) => {
              resolve = done
            }),
        ),
      )
      const client = new Client()
      client.setCommonHeaders({ Authorization: authorization })
      const { listener, cleanup } = listen(
        EventType.MSG_CONNECTION_UNAUTHORIZED,
      )
      try {
        const query = client.queryRaw("SELECT 1")
        client.setCommonHeaders({ Authorization: "Bearer replacement" })
        resolve(unauthorized())
        await expect(query).rejects.toMatchObject({ status: 401 })
        expect(listener).not.toHaveBeenCalled()
      } finally {
        cleanup()
      }
    },
  )
})

// A 401 deletes the qdb_session cookie, which downloads authenticate with.
describe("cookie session after a rejected bearer", () => {
  const asksForSession = ([url]: unknown[]) =>
    new URLSearchParams(String(url).split("?")[1]).get("session") === "true"
  const unavailable = () => new Response("", { status: 503 })
  const renewTo = (accessToken: string) =>
    vi.fn(() => {
      const payload = token({ access_token: accessToken })
      authSessionState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })

  it("asks for a new session with the request it resends after a 401", async () => {
    authSessionState.setAuthPayload(token())
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.refreshTokenMethod = renewTo("new")

    await client.queryRaw("select 1")
    await client.queryRaw("select 2")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      false,
      true,
      false,
    ])
  })

  it("asks with the next request the server accepts after a failed renewal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    authSessionState.setAuthPayload(token())
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.refreshTokenMethod = vi.fn(() =>
      Promise.reject(new Error("IdP unavailable")),
    )
    await expect(client.queryRaw("select 1")).rejects.toMatchObject({
      authRefreshUnavailable: true,
    })

    // A later renewal installs a bearer the server accepts.
    authSessionState.setAuthPayload(token({ access_token: "recovered" }))
    await client.queryRaw("select 2")
    await client.queryRaw("select 3")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      false,
      true,
      false,
    ])
  })

  // The bearer can be renewed before any SQL request is rejected, so the 401
  // of another endpoint must be remembered too.
  const nonSqlRequests: Array<[string, (client: Client) => Promise<unknown>]> =
    [
      ["validation", (client) => client.validateQuery("select 1")],
      ["a CSV check", (client) => client.checkCSVFile("probe.csv")],
      [
        "a settings save",
        (client) =>
          client.savePreferences({ version: 1, instance_name: "Test" }),
      ],
    ]

  it.each(nonSqlRequests)(
    "asks after %s is rejected, even if no SQL request is",
    async (_, request) => {
      authSessionState.setAuthPayload(token())
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(unauthorized)
        .mockImplementation(ok)
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      await request(client).catch(() => {})

      authSessionState.setAuthPayload(token({ access_token: "renewed" }))
      await client.queryRaw("select 2")
      await client.queryRaw("select 3")

      expect(fetchMock.mock.calls.slice(1).map(asksForSession)).toEqual([
        true,
        false,
      ])
    },
  )

  it("asks after an upload is rejected, even if no SQL request is", async () => {
    authSessionState.setAuthPayload(token())
    class RejectedUpload {
      status = 401
      statusText = "Unauthorized"
      response = ""
      upload = { addEventListener: vi.fn() }
      open = vi.fn()
      setRequestHeader = vi.fn()
      onload?: () => void
      send = vi.fn(() => this.onload?.())
    }
    vi.stubGlobal("XMLHttpRequest", RejectedUpload)
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    await expect(
      client.uploadCSVFile({
        file: new File(["value\n1\n"], "probe.csv", { type: "text/csv" }),
        name: "probe",
        owner: "admin",
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 401 })

    authSessionState.setAuthPayload(token({ access_token: "renewed" }))
    await client.queryRaw("select 2")
    await client.queryRaw("select 3")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([true, false])
  })

  it("asks with one request at a time", async () => {
    authSessionState.setAuthPayload(token())
    const responses: Array<(response: Response) => void> = []
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(
        () => new Promise<Response>((resolve) => responses.push(resolve)),
      )
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    // Housekeeping neither renews nor resends, but its 401 closes the session.
    await expect(
      client.queryRaw("select 1", { refreshAuth: false }),
    ).rejects.toMatchObject({ authRefreshUnavailable: true })

    const first = client.queryRaw("select 2")
    const second = client.queryRaw("select 3")
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      false,
      true,
      false,
    ])
    responses[0](ok())
    responses[1](ok())
    await Promise.all([first, second])

    const third = client.queryRaw("select 4")
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      false,
      true,
      false,
      false,
    ])
    responses[2](ok())
    await third
  })

  it("asks again when the request that asked could not open the session", async () => {
    authSessionState.setAuthPayload(token())
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementationOnce(unavailable)
      .mockImplementationOnce(() =>
        Promise.reject(new TypeError("Failed to fetch")),
      )
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    await expect(
      client.queryRaw("select 1", { refreshAuth: false }),
    ).rejects.toMatchObject({ authRefreshUnavailable: true })

    await expect(client.queryRaw("select 2")).rejects.toMatchObject({
      status: 503,
    })
    await expect(client.queryRaw("select 3")).rejects.toMatchObject({
      connectionError: true,
    })
    await client.queryRaw("select 4")
    await client.queryRaw("select 5")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it.each(["Bearer rest-token", "Basic dXNlcjpwYXNz"])(
    "never asks with %s credentials",
    async (authorization) => {
      authSessionState.markNonSSOAuthenticated()
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(unauthorized)
        .mockImplementation(ok)
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      client.setCommonHeaders({ Authorization: authorization })

      await expect(client.queryRaw("select 1")).rejects.toMatchObject({
        status: 401,
      })
      await client.queryRaw("select 2")

      expect(fetchMock.mock.calls.map(asksForSession)).toEqual([false, false])
    },
  )

  it("asks when the sign-in request opened no session, only in that login", async () => {
    authSessionState.setAuthPayload(token())
    const signIn = authSessionState.capture()
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()

    client.noteCookieSessionNotOpened(signIn)
    await client.queryRaw("select 1")
    await client.queryRaw("select 2")
    // A sign-in answer that arrives after its login ended changes nothing.
    authSessionState.endSession()
    authSessionState.setAuthPayload(token({ access_token: "next-login" }))
    client.noteCookieSessionNotOpened(signIn)
    await client.queryRaw("select 3")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([
      true,
      false,
      false,
    ])
  })

  it("leaves the next login's session to its sign-in", async () => {
    authSessionState.setAuthPayload(token())
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    await expect(
      client.queryRaw("select 1", { refreshAuth: false }),
    ).rejects.toMatchObject({ authRefreshUnavailable: true })

    authSessionState.endSession()
    authSessionState.setAuthPayload(token({ access_token: "next-login" }))
    await client.queryRaw("select 2")

    expect(fetchMock.mock.calls.map(asksForSession)).toEqual([false, false])
  })
})
