import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Base64 } from "js-base64"
import type { Settings } from "../../providers/SettingsProvider/types"
import {
  TOKEN_REQUEST_TIMEOUT_MS,
  exchangeAuthorizationCode,
  getAuthToken,
  getMissingIdTokenError,
  getBearerAuthorization,
  getTokenExpirationDate,
  readAuthTokenResponse,
} from "./utils"
import type { AuthPayload } from "./types"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("token expiration", () => {
  const now = Date.UTC(2026, 0, 1)
  const nowSeconds = now / 1000

  // Unsigned, as only the claims are read: the server verifies the signature.
  const jwt = (claims: Record<string, unknown>) =>
    [{ alg: "RS256", typ: "JWT" }, claims]
      .map((part) => Base64.encodeURI(JSON.stringify(part)))
      .concat("signature")
      .join(".")

  const expiration = (tokenResponse: {
    groups_encoded_in_token: boolean
    expires_in: number
    id_token?: string
  }) => getTokenExpirationDate(tokenResponse as AuthPayload).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  it("uses expires_in when the access token is the bearer", () => {
    expect(
      expiration({
        groups_encoded_in_token: false,
        expires_in: 300,
        id_token: jwt({ iat: nowSeconds, exp: nowSeconds + 3600 }),
      }),
    ).toBe(now + 300_000)
  })

  it.each([
    { relation: "expires before", expiresIn: 3600, idTokenLifetime: 300 },
    { relation: "outlives", expiresIn: 300, idTokenLifetime: 3600 },
  ])(
    "uses the exp claim when the ID token bearer $relation the access token",
    ({ expiresIn, idTokenLifetime }) => {
      expect(
        expiration({
          groups_encoded_in_token: true,
          expires_in: expiresIn,
          id_token: jwt({
            iat: nowSeconds,
            exp: nowSeconds + idTokenLifetime,
          }),
        }),
      ).toBe(now + idTokenLifetime * 1000)
    },
  )

  it("does not rebase exp onto a backdated iat", () => {
    // Entra ID backdates iat by 5 minutes; the token still expires at exp.
    expect(
      expiration({
        groups_encoded_in_token: true,
        expires_in: 7200,
        id_token: jwt({ iat: nowSeconds - 300, exp: nowSeconds + 3600 }),
      }),
    ).toBe(now + 3_600_000)
  })

  it("decodes a base64url payload without padding", () => {
    const idToken = jwt({
      iat: nowSeconds,
      exp: nowSeconds + 300,
      name: "Zoë ???>>>",
    })
    const payload = idToken.split(".")[1]
    // Guard the fixture: it must differ from standard, padded base64.
    expect(payload).toMatch(/[-_]/)
    expect(payload.length % 4).not.toBe(0)
    expect(payload).not.toContain("=")

    expect(
      expiration({
        groups_encoded_in_token: true,
        expires_in: 3600,
        id_token: idToken,
      }),
    ).toBe(now + 300_000)
  })

  it.each([
    { problem: "is missing", idToken: undefined },
    { problem: "is not a JWT", idToken: "opaque-token" },
    { problem: "has an empty payload", idToken: "header..signature" },
    { problem: "has an undecodable payload", idToken: "header.%%%.signature" },
    {
      problem: "has a payload that is not JSON",
      idToken: `header.${Base64.encodeURI("not json")}.signature`,
    },
    {
      problem: "has a null payload",
      idToken: `header.${Base64.encodeURI("null")}.signature`,
    },
    { problem: "has no exp claim", idToken: jwt({ iat: nowSeconds }) },
    {
      problem: "has a non-numeric exp claim",
      idToken: jwt({ iat: nowSeconds, exp: String(nowSeconds + 3600) }),
    },
  ])("falls back to expires_in when the ID token $problem", ({ idToken }) => {
    expect(
      expiration({
        groups_encoded_in_token: true,
        expires_in: 300,
        id_token: idToken,
      }),
    ).toBe(now + 300_000)
  })
})

describe("missing ID token", () => {
  it.each([
    {
      grantType: "authorization_code",
      detail: "needed to sign you in.",
    },
    {
      grantType: "refresh_token",
      detail: "needed to keep you signed in.",
    },
  ] as const)(
    "explains a missing ID token bearer after the $grantType grant",
    ({ grantType, detail }) => {
      const error = getMissingIdTokenError(
        { groups_encoded_in_token: true } as AuthPayload,
        grantType,
      )
      expect(error?.errorTitle).toBe("Missing ID token")
      expect(error?.errorMessage).toContain(
        "ask your administrator to check the SSO configuration",
      )
      expect(error?.errorMessage).toContain(detail)
      expect(error?.errorMessage).not.toContain("acl.oidc")
    },
  )

  it.each([
    {
      bearer: "the access token",
      tokenResponse: { groups_encoded_in_token: false },
    },
    {
      bearer: "a present ID token",
      tokenResponse: { groups_encoded_in_token: true, id_token: "id-token" },
    },
  ])("reports nothing when $bearer is the bearer", ({ tokenResponse }) => {
    expect(
      getMissingIdTokenError(tokenResponse as AuthPayload, "refresh_token"),
    ).toBeUndefined()
  })
})

describe("authorization code exchange", () => {
  const settings = { "acl.oidc.token.endpoint": "/token" } as Settings
  const payload = { grant_type: "authorization_code", code: "code" }

  it("resolves with the token response, even an OAuth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 400,
        json: () => Promise.resolve({ error: "invalid_grant" }),
      }),
    )

    await expect(exchangeAuthorizationCode(settings, payload)).resolves.toEqual(
      {
        tokenResponse: { error: "invalid_grant" },
      },
    )
  })

  it("explains a provider that cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    )

    await expect(exchangeAuthorizationCode(settings, payload)).resolves.toEqual(
      {
        signInError: {
          errorTitle: "Something went wrong.",
          errorMessage:
            "Could not reach the identity provider to complete the sign-in. Please try again.",
        },
      },
    )
  })

  it("explains a response that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 502,
        json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
      }),
    )

    await expect(exchangeAuthorizationCode(settings, payload)).resolves.toEqual(
      {
        signInError: {
          errorTitle: "Something went wrong.",
          errorMessage:
            "The identity provider returned an unexpected response (HTTP 502). Please try again.",
        },
      },
    )
  })

  const timedOut = {
    signInError: {
      errorTitle: "Something went wrong.",
      errorMessage:
        "The identity provider did not respond within 10 seconds. Please try again.",
    },
  }

  it("aborts a request that gets no response within the timeout", async () => {
    vi.useFakeTimers()
    // Like a browser fetch, the request only ends when it is aborted
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    let settled = false
    const exchange = exchangeAuthorizationCode(settings, payload).finally(
      () => {
        settled = true
      },
    )

    await vi.advanceTimersByTimeAsync(TOKEN_REQUEST_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(exchange).resolves.toEqual(timedOut)
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
  })

  it("gives up on a response body that ignores the abort", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: () => new Promise(() => {}),
      }),
    )
    const exchange = exchangeAuthorizationCode(settings, payload)

    await vi.advanceTimersByTimeAsync(TOKEN_REQUEST_TIMEOUT_MS)

    await expect(exchange).resolves.toEqual(timedOut)
  })

  it.each([
    null,
    [],
    "token",
    123,
    { access_token: 123 },
    { expires_in: "3600" },
    { expires_in: 1e20 },
    { expires_in: 0 },
    { expires_in: -1 },
  ])("explains an invalid JSON token response: %j", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ status: 200, json: () => Promise.resolve(body) }),
    )
    await expect(
      exchangeAuthorizationCode(settings, payload),
    ).resolves.toMatchObject({
      signInError: {
        errorMessage:
          "The identity provider returned an unexpected response (HTTP 200). Please try again.",
      },
    })
  })

  it("clears the timeout once the response arrives", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ access_token: "token" }),
      }),
    )

    await expect(exchangeAuthorizationCode(settings, payload)).resolves.toEqual(
      { tokenResponse: { access_token: "token" } },
    )
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("bearer authorization", () => {
  it("uses the access token unless the server requires the ID token", () => {
    expect(
      getBearerAuthorization({ access_token: "access", id_token: "id" }),
    ).toBe("Bearer access")
    expect(
      getBearerAuthorization({
        access_token: "access",
        id_token: "id",
        groups_encoded_in_token: true,
      }),
    ).toBe("Bearer id")
    expect(
      getBearerAuthorization({
        access_token: "access",
        groups_encoded_in_token: true,
      }),
    ).toBeUndefined()
    expect(getBearerAuthorization({})).toBeUndefined()
  })
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

  it("preserves a successful response body that resolves after the wait deadline", async () => {
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
    await expect(result).resolves.toEqual({ access_token: "late" })
  })

  it("does not apply a late OAuth error after the wait deadline", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      readAuthTokenResponse(
        { json: () => Promise.resolve({ error: "invalid_grant" }) } as Response,
        controller.signal,
      ),
    ).rejects.toThrow("Token request timed out")
  })
})
