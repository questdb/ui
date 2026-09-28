import { afterEach, describe, expect, it, vi } from "vitest"
import type { Settings } from "../../providers/SettingsProvider/types"
import { getAuthToken, readAuthTokenResponse } from "./utils"
import type { AuthPayload } from "./types"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OIDC refresh requests", () => {
  it("passes the refresh deadline's AbortSignal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({})
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    await getAuthToken(
      { "acl.oidc.token.endpoint": "/token" } as Settings,
      { grant_type: "refresh_token", refresh_token: "old" },
      controller.signal,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "/token",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "old",
        }),
      }),
    )
  })

  it("discards a response body that resolves after the deadline", async () => {
    const controller = new AbortController()
    let resolveBody!: (value: AuthPayload) => void
    const body = new Promise<AuthPayload>((resolve) => {
      resolveBody = resolve
    })
    const result = readAuthTokenResponse(
      { json: () => body } as Response,
      controller.signal,
    )

    controller.abort()
    resolveBody({ access_token: "late" } as AuthPayload)
    await expect(result).rejects.toThrow("Token refresh timed out")
  })
})
