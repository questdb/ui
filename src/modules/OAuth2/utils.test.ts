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
  buildInstalledPayload,
  getStoredCredentialAuthorization,
  sessionRenewalError,
} from "./utils"
import "../../test/stubBrowserGlobals"
import { StoreKey } from "../../utils/localStorage/types"
import type { AuthPayload } from "./types"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe("installed payload normalization", () => {
  const previous = {
    access_token: "old",
    refresh_token: "r1",
    token_type: "Bearer",
  }
  it("retains only a refresh grant's omitted refresh token", () => {
    expect(
      buildInstalledPayload(
        { access_token: "new" },
        false,
        "refresh_token",
        previous,
      ),
    ).toMatchObject({
      payload: {
        access_token: "new",
        refresh_token: "r1",
        expires_at: undefined,
      },
    })
    expect(
      buildInstalledPayload(
        { access_token: "new" },
        false,
        "authorization_code",
        previous,
      ),
    ).toMatchObject({ payload: { refresh_token: undefined } })
  })
  it("installs a rotated refresh token", () => {
    expect(
      buildInstalledPayload(
        { access_token: "new", refresh_token: "r2" },
        false,
        "refresh_token",
        previous,
      ),
    ).toMatchObject({ payload: { refresh_token: "r2" } })
  })
  it("uses consistent actionable wording for a rejected refresh grant", () => {
    expect(
      buildInstalledPayload(
        { error: "invalid_grant", error_description: "Revoked." },
        false,
        "refresh_token",
        previous,
      ),
    ).toEqual({
      error: {
        errorTitle: "Your SSO session has expired",
        errorMessage: "Revoked. Please sign in again.",
      },
    })
  })
  it.each([
    ["Token is not active", "Token is not active. Please sign in again."],
    ["Session not active ", "Session not active. Please sign in again."],
    ["Revoked!", "Revoked! Please sign in again."],
    [undefined, "Could not renew your SSO session. Please sign in again."],
    [" ", "Could not renew your SSO session. Please sign in again."],
  ])(
    "ends the renewal reason %j as a sentence before the instruction",
    (description, errorMessage) => {
      expect(sessionRenewalError(description)).toEqual({
        errorTitle: "Your SSO session has expired",
        errorMessage,
      })
    },
  )
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
    expires_in?: number
    id_token?: string
  }) => getTokenExpirationDate(tokenResponse as AuthPayload)?.getTime()

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

  it("does not need expires_in for an ID token bearer with an exp claim", () => {
    // OAuth recommends, but does not require, the access token's lifetime.
    expect(
      expiration({
        groups_encoded_in_token: true,
        id_token: jwt({ iat: nowSeconds, exp: nowSeconds + 600 }),
      }),
    ).toBe(now + 600_000)
  })

  it.each([false, true])(
    "expires immediately for zero lifetime (ID token bearer: %s)",
    (groupsEncodedInToken) => {
      expect(
        expiration({
          groups_encoded_in_token: groupsEncodedInToken,
          expires_in: 0,
          id_token: "opaque-token",
        }),
      ).toBe(now)
    },
  )

  it.each([
    {
      bearer: "an access token without expires_in",
      tokenResponse: {
        groups_encoded_in_token: false,
        id_token: jwt({ iat: nowSeconds, exp: nowSeconds + 600 }),
      },
    },
    {
      bearer: "an ID token without an exp claim or expires_in",
      tokenResponse: {
        groups_encoded_in_token: true,
        id_token: jwt({ iat: nowSeconds }),
      },
    },
    {
      bearer: "an access token with a negative expires_in",
      tokenResponse: { groups_encoded_in_token: false, expires_in: -1 },
    },
  ])("has no expiration for $bearer", ({ tokenResponse }) => {
    expect(expiration(tokenResponse)).toBeUndefined()
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

describe("normalised token responses", () => {
  it.each(["3599", 3599, "0", 0])("accepts lifetime %j", async (expires_in) => {
    const result = await readAuthTokenResponse(
      new Response(
        JSON.stringify({
          access_token: "access",
          expires_in,
        }),
      ),
    )
    expect(result).toEqual({
      access_token: "access",
      expires_in: Number(expires_in),
    })
  })

  it.each([-1, 1e20, null, "unknown", "", {}, "Infinity"])(
    "treats unusable optional lifetime %j as unknown",
    async (expires_in) => {
      await expect(
        readAuthTokenResponse(
          new Response(
            JSON.stringify({
              access_token: "access",
              expires_in,
            }),
          ),
        ),
      ).resolves.toEqual({ access_token: "access" })
    },
  )

  it("drops null optional fields, OAuth errors and client-derived fields", async () => {
    await expect(
      readAuthTokenResponse(
        new Response(
          JSON.stringify({
            access_token: "access",
            id_token: null,
            refresh_token: null,
            token_type: null,
            error: null,
            error_description: null,
            expires_at: "2000-01-01",
            groups_encoded_in_token: true,
            extra: "ignored",
          }),
        ),
      ),
    ).resolves.toEqual({ access_token: "access" })
  })

  it("does not expose a malformed response body through parser diagnostics", async () => {
    await expect(
      readAuthTokenResponse(
        new Response('{"access_token":"secret"} malformed'),
      ),
    ).rejects.toThrow("Invalid token response: expected JSON")
  })

  it("identifies the malformed field without including credentials", async () => {
    await expect(
      readAuthTokenResponse(
        new Response(
          JSON.stringify({
            access_token: "secret",
            refresh_token: 123,
          }),
        ),
      ),
    ).rejects.toThrow("Invalid token response: refresh_token must be a string")
  })
})

describe("credential precedence", () => {
  it("prefers the tab's SSO bearer over stored REST/basic credentials", () => {
    localStorage.setItem(StoreKey.REST_TOKEN, "rest")
    localStorage.setItem(StoreKey.BASIC_AUTH_HEADER, "Basic password")
    expect(getBearerAuthorization({ access_token: "sso" })).toBe("Bearer sso")
    expect(getStoredCredentialAuthorization()).toBe("Bearer rest")
    localStorage.removeItem(StoreKey.REST_TOKEN)
    expect(getStoredCredentialAuthorization()).toBe("Basic password")
    localStorage.clear()
    expect(getStoredCredentialAuthorization()).toBeUndefined()
  })
})

describe("authorization code exchange", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
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
    { id_token: 123 },
    { refresh_token: {} },
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
          "The identity provider returned an invalid token response. Please ask your administrator to check the SSO configuration.",
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
  it("passes an explicit network cancellation signal to fetch", async () => {
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
    ).rejects.toThrow("Request timed out")
  })
})
