import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import { Type } from "./types"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { AuthPayload } from "../../modules/OAuth2/types"

const response = (body: Record<string, unknown>): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Client queryRaw NOTICE timings", () => {
  it("adds fetch timing when the notice carries server timings", async () => {
    // Given a notice response with the regular query timing fields
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          notice: "partition converted",
          timings: {
            compiler: 1,
            authentication: 2,
            count: 3,
            execute: 4,
          },
        }),
      ),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then NOTICE keeps its fields and receives the measured fetch timing
    expect(result.type).toBe(Type.NOTICE)
    if (result.type !== Type.NOTICE) throw new Error("expected notice")
    expect(result.timings).toMatchObject({
      compiler: 1,
      authentication: 2,
      count: 3,
      execute: 4,
    })
    expect(typeof result.timings?.fetch).toBe("number")
  })

  it("keeps timings absent when the notice has none", async () => {
    // Given a message-only notice response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint applied" })),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then no partial timing object is invented
    expect(result.type).toBe(Type.NOTICE)
    expect(result).not.toHaveProperty("timings")
  })
})

describe("Client token refresh", () => {
  afterEach(() => {
    ssoAuthState.clearAuthPayload()
  })

  it("does not deadlock when a token refresh fails at the transport level", async () => {
    // Given an active SSO session whose token is inside the 30s refresh window
    ssoAuthState.setAuthPayload({
      access_token: "stale",
      refresh_token: "refresh",
      expires_at: new Date(new Date().getTime() + 10_000).toString(),
    } as AuthPayload)

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint applied" })),
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    // And a refresh that rejects, e.g. the token endpoint is unreachable or
    // answers with a non-JSON body
    const client = new Client()
    client.refreshTokenMethod = () => Promise.reject(new Error("network down"))

    // When a query runs, it must not hang waiting on a stuck refresh flag: the
    // failure is swallowed and the request proceeds with the stale token (the
    // server would then answer 401 and drive the normal re-auth flow).
    const result = await client.queryRaw("SELECT 1")

    expect(result.type).toBe(Type.NOTICE)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()

    // And a subsequent query still goes through — the flag was reset
    await client.queryRaw("SELECT 1")
    expect(fetch).toHaveBeenCalledTimes(2)

    errorSpy.mockRestore()
  })
})
