import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import {
  REFRESH_RETRY_DELAY_MS,
  REFRESH_REQUEST_TIMEOUT_MS,
} from "./tokenRefresh"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { getTokenExpirationDate } from "../../modules/OAuth2/utils"
import { Base64 } from "js-base64"
import type { AuthPayload } from "../../modules/OAuth2/types"

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
  ssoAuthState.clearAuthPayload()
  Client.__resetRefreshStateForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("SSO refresh safety", () => {
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
    ssoAuthState.setAuthPayload(issue())
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const refresh = vi.fn(() => {
      const payload = issue()
      ssoAuthState.setAuthPayload(payload)
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
    ssoAuthState.setAuthPayload(issue())
    vi.stubGlobal("fetch", vi.fn().mockImplementation(ok))
    const client = new Client()
    client.refreshTokenMethod = vi.fn(() => {
      const payload = issue()
      ssoAuthState.setAuthPayload(payload)
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
    ssoAuthState.setAuthPayload(
      token({ expires_at: new Date(Date.now() + 20_000).toISOString() }),
    )
    vi.stubGlobal("fetch", vi.fn().mockImplementation(ok))
    const client = new Client()
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      ssoAuthState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    await client.queryRaw("SELECT 1")
    await vi.advanceTimersByTimeAsync(10_000)
    await client.queryRaw("SELECT 2")
    expect(client.refreshTokenMethod).toHaveBeenCalledTimes(2)
  })

  it("refreshes and retries a current-bearer 401 once when the browser clock is behind", async () => {
    ssoAuthState.setAuthPayload(token()) // The browser thinks expiry is far away.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(unauthorized)
      .mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({ access_token: "new" })
      ssoAuthState.setAuthPayload(payload)
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
    ssoAuthState.setAuthPayload(token())
    const fetchMock = vi.fn().mockImplementation(unauthorized)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = vi.fn(() => {
      const payload = token({ access_token: "new" })
      ssoAuthState.setAuthPayload(payload)
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
    ssoAuthState.setAuthPayload(unknownExpiry)
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

  it("does not send parked writes after refresh ends the session", async () => {
    ssoAuthState.setAuthPayload(
      token({ expires_at: new Date(Date.now() + 20_000).toISOString() }),
    )
    const fetchMock = vi.fn().mockImplementation(ok)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = () => {
      ssoAuthState.clearAuthPayload() // AuthProvider rejected a missing ID token.
      return Promise.resolve(undefined)
    }
    const { listener, cleanup } = listen(EventType.MSG_CONNECTION_ERROR)
    try {
      await expect(
        client.queryRaw("INSERT INTO trades VALUES (1)"),
      ).rejects.toMatchObject({
        error: "Your session has ended. Please sign in again.",
        sessionEnded: true,
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it("does not let an old in-flight refresh block or overwrite a new login", async () => {
    ssoAuthState.setAuthPayload(
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
    ssoAuthState.clearAuthPayload()
    ssoAuthState.setAuthPayload(
      token({
        access_token: "new-login",
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      }),
    )
    client.refreshTokenMethod = () => {
      const payload = token({ access_token: "new-refreshed" })
      ssoAuthState.setAuthPayload(payload)
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
    ssoAuthState.setAuthPayload(
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
      ssoAuthState.setAuthPayload(payload)
      return Promise.resolve(payload)
    })
    await vi.advanceTimersByTimeAsync(14_000)
    await client.queryRaw("SELECT 4")
    expect(refresh).toHaveBeenCalledTimes(4)
    expect(ssoAuthState.hasRefreshFailed()).toBe(false)
  })
})

describe("transient post-expiry refresh recovery", () => {
  it("does not send an expired bearer during backoff and recovers on retry", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    ssoAuthState.setAuthPayload(
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
        ssoAuthState.setAuthPayload(payload)
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

  it("ends the session only after repeated post-expiry failures", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    ssoAuthState.setAuthPayload(
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
      expect(listener).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it.each([20_000, 300_000])(
    "frees and aborts a hung slot by expiry or the hard cap (%s ms lifetime)",
    async (lifetime) => {
      vi.useFakeTimers()
      vi.spyOn(console, "error").mockImplementation(() => {})
      ssoAuthState.setAuthPayload(
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
      await first
      expect(requests).toHaveLength(1)
      expect(requests[0].aborted).toBe(false)
      const duration = Math.min(lifetime, REFRESH_REQUEST_TIMEOUT_MS)
      await vi.advanceTimersByTimeAsync(duration - 10_000)
      expect(requests[0].aborted).toBe(true)
      client.refreshTokenMethod = vi.fn(() => {
        const payload = token({ access_token: "recovered" })
        ssoAuthState.setAuthPayload(payload)
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
