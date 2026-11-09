import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { Client } from "./client"

const install = (remaining: number) =>
  authSessionState.setAuthPayload({
    access_token: "idle-user",
    refresh_token: "refresh",
    token_type: "Bearer",
    expires_at: new Date(Date.now() + remaining).toISOString(),
  })
afterEach(() => {
  authSessionState.endSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("non-renewing background SQL", () => {
  it.each([-1, 10_000])(
    "does not send or renew a bearer with %s ms remaining",
    async (remaining) => {
      install(remaining)
      const client = new Client()
      client.refreshTokenMethod = vi.fn()
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      await expect(
        client.queryRaw("telemetry", { refreshAuth: false }),
      ).rejects.toMatchObject({ requestNotSent: true })
      expect(client.refreshTokenMethod).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(authSessionState.isAuthenticated()).toBe(true)
    },
  )

  it("neither refreshes nor logs out after a server-side 401 (clock skew)", async () => {
    install(300_000)
    const session = authSessionState.capture()
    const client = new Client()
    client.refreshTokenMethod = vi.fn()
    const publish = vi.spyOn(eventBus, "publish")
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 401 }))),
    )
    await expect(
      client.queryRaw("telemetry", { refreshAuth: false }),
    ).rejects.toMatchObject({ requestNotSent: true })
    expect(client.refreshTokenMethod).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalledWith(
      EventType.MSG_CONNECTION_UNAUTHORIZED,
      expect.anything(),
    )
    expect(publish).not.toHaveBeenCalledWith(EventType.MSG_AUTH_REFRESH_FAILED)
    expect(session.isCurrent()).toBe(true)
  })

  it("uses the shared current bearer without serializing the local option", async () => {
    install(300_000)
    const fetchMock = vi.fn<[string, RequestInit], Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify({ ddl: "OK" }))),
    )
    vi.stubGlobal("fetch", fetchMock)
    await new Client().queryRaw("telemetry", { refreshAuth: false })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).not.toContain("refreshAuth")
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer idle-user" },
    })
  })
})
