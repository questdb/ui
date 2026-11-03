import "../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import type { AuthPayload } from "../modules/OAuth2/types"
import { Client } from "./questdb/client"
import {
  queryTelemetryConfig,
  TELEMETRY_STARTUP_QUERY_OPTIONS,
} from "./telemetryQueries"

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

  it.each(["near expiry", "after a failed renewal"])(
    "sends the one-shot startup read %s, as nothing retries it",
    async (scenario) => {
      // Given a login whose token expires within the refresh window, or whose
      // last renewal failed while the token still works
      authSessionState.setAuthPayload(
        token(scenario === "near expiry" ? 20_000 : 300_000),
      )
      if (scenario === "after a failed renewal") {
        authSessionState.markRefreshFailed()
      }
      const client = new Client()
      const renewed: AuthPayload = { ...token(), access_token: "renewed" }
      const refresh = vi.fn(() => {
        authSessionState.setAuthPayload(renewed)
        return Promise.resolve(renewed)
      })
      client.refreshTokenMethod = refresh
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ columns: [], dataset: [], count: 0 }),
            ),
          ),
        ),
      )

      // When the console reads the telemetry config at startup
      const response = queryTelemetryConfig(
        client,
        TELEMETRY_STARTUP_QUERY_OPTIONS,
      )

      // Then the read is sent, renewing the token first if it is due, instead
      // of leaving Metrics unavailable for the rest of the login
      await expect(response).resolves.toMatchObject({ type: "dql" })
      expect(fetch).toHaveBeenCalledOnce()
      expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
        Authorization:
          scenario === "near expiry" ? "Bearer renewed" : "Bearer idle-session",
      })
      expect(refresh).toHaveBeenCalledTimes(scenario === "near expiry" ? 1 : 0)
      expect(client.hasActiveRequests()).toBe(false)
    },
  )
})
