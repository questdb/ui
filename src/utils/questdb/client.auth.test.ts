import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
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
      return {
        ...payload,
        expires_at: getTokenExpirationDate(payload).toISOString(),
      }
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
