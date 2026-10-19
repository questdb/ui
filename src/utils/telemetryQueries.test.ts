import "../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import type { AuthPayload } from "../modules/OAuth2/types"
import { Client } from "./questdb/client"
import { queryTelemetryConfig } from "./telemetryQueries"

const token = (expiresIn = 300_000): AuthPayload => ({
  access_token: "idle-session",
  refresh_token: "refresh",
  token_type: "Bearer",
  expires_at: new Date(Date.now() + expiresIn).toISOString(),
})

afterEach(() => {
  authSessionState.endSession()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("telemetry config queries", () => {
  it("uses the non-interactive options shared by startup and settings saves", async () => {
    authSessionState.setAuthPayload(token())
    const client = new Client()
    const query = vi.spyOn(client, "query")
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
    const pending = queryTelemetryConfig(client)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(query).toHaveBeenCalledWith("telemetry_config limit -1", {
      refreshAuth: false,
      background: true,
    })
    expect(client.hasActiveRequests()).toBe(false)
    expect(client.hasSentRequests()).toBe(false)
    finish(new Response(JSON.stringify({ columns: [], dataset: [], count: 0 })))
    await expect(pending).resolves.toMatchObject({ type: "dql", count: 0 })
  })

  it.each(["near expiry", "rejected bearer"])(
    "skips %s without refreshing or ending the SSO session",
    async (scenario) => {
      authSessionState.setAuthPayload(
        token(scenario === "near expiry" ? 20_000 : 300_000),
      )
      const session = authSessionState.capture()
      const payload = authSessionState.getAuthPayload()
      const client = new Client()
      const refresh = vi.fn()
      client.refreshTokenMethod = refresh
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response("", { status: 401 }))),
      )
      await expect(queryTelemetryConfig(client)).rejects.toMatchObject({
        authRefreshUnavailable: true,
        requestNotSent: true,
      })
      expect(refresh).not.toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledTimes(scenario === "near expiry" ? 0 : 1)
      expect(session.isCurrent()).toBe(true)
      expect(authSessionState.getAuthPayload()).toBe(payload)
      expect(authSessionState.hasRefreshFailed()).toBe(false)
      expect(client.hasActiveRequests()).toBe(false)
    },
  )
})
