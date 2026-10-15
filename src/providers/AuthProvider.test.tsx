import "../test/stubBrowserGlobals"
import React from "react"
import { Base64 } from "js-base64"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./AuthProvider"
import { ssoAuthState } from "../modules/OAuth2/ssoAuthState"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { StoreKey } from "../utils/localStorage/types"
import type { Settings } from "./SettingsProvider/types"
import type { TokenResponse } from "../modules/OAuth2/types"
import { isRefreshable, tokenRefresh } from "../utils/questdb/tokenRefresh"

const mocks = vi.hoisted(() => ({
  settings: {} as Settings,
  toastError: vi.fn<
    [
      React.ReactElement,
      { autoClose: boolean; closeOnClick: boolean; toastId: string },
    ],
    void
  >(),
  toastDismiss: vi.fn(),
  toastActive: vi.fn(() => false),
}))
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}))
vi.mock("../components/Toast", () => ({
  toast: {
    error: mocks.toastError,
    dismiss: mocks.toastDismiss,
    isActive: mocks.toastActive,
  },
}))
vi.mock("../components/Button", () => ({ Button: "button" }))
vi.mock("../modules/OAuth2/views/login", () => ({
  Login: (props: Record<string, unknown>) =>
    React.createElement("div", { ...props, "data-hook": "mock-login" }),
}))

let renderer: ReactTestRenderer | undefined
let auth: ReturnType<typeof useAuth>
const initialToken = {
  access_token: "initial",
  id_token: "initial-id",
  refresh_token: "initial-refresh",
  expires_in: 3600,
  token_type: "Bearer",
}
let signInToken: TokenResponse = initialToken
const tokenResponse = (body: TokenResponse) =>
  new Response(JSON.stringify(body), { status: 200 })
// Unsigned, as only the claims are read: the server verifies the signature.
const idToken = (exp: number) =>
  `header.${Base64.encodeURI(JSON.stringify({ exp }))}.signature`

beforeEach(() => {
  localStorage.clear()
  signInToken = initialToken
  mocks.toastActive.mockReturnValue(false)
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })
  vi.stubGlobal("location", {
    origin: "http://localhost",
    pathname: "/",
    search: "?code=test",
    href: "http://localhost/?code=test",
  })
  mocks.settings = {
    "acl.enabled": true,
    "acl.oidc.enabled": true,
    "acl.oidc.client.id": "test-client",
    "acl.oidc.token.endpoint": "/token",
    "acl.oidc.groups.encoded.in.token": false,
  }
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url === "/token" ? tokenResponse(signInToken) : new Response(""),
      ),
    ),
  )
})

afterEach(() => {
  act(() => renderer?.unmount())
  ssoAuthState.clearAuthPayload()
  tokenRefresh.syncSession()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const mount = async () => {
  const Consumer = () => {
    auth = useAuth()
    return null
  }
  await act(async () => {
    renderer = create(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    )
    await Promise.resolve()
  })
  // Signed in, so `auth` comes from this render rather than an earlier test.
  expect(
    renderer?.root.findAllByProps({ "data-hook": "mock-login" }),
  ).toHaveLength(0)
  expect(auth.sessionData?.access_token).toBe("initial")
}

describe("AuthProvider token installation", () => {
  it("warns after expiry, avoids duplicates, and restores a dismissed warning", async () => {
    await mount()
    ssoAuthState.setAuthPayload({
      ...initialToken,
      expires_at: new Date(Date.now() - 1).toISOString(),
    })
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledOnce()
    const warning = create(mocks.toastError.mock.calls[0][0])
    expect(warning.root.findByType("p").children).toEqual([
      expect.stringContaining("Queries are paused"),
    ])
    mocks.toastActive.mockReturnValue(true)
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledOnce()
    mocks.toastActive.mockReturnValue(false)
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
    act(() => {
      ;(
        warning.root.findByType("button").props as { onClick: () => void }
      ).onClick()
    })
    expect(ssoAuthState.isAuthenticated()).toBe(false)
    warning.unmount()
  })

  it("clears password credentials on sign-in, but preserves another tab's credentials on refresh", async () => {
    localStorage.setItem(StoreKey.REST_TOKEN, "stale")
    localStorage.setItem(StoreKey.BASIC_AUTH_HEADER, "Basic stale")
    await mount()
    expect(localStorage.getItem(StoreKey.REST_TOKEN)).toBeNull()
    expect(localStorage.getItem(StoreKey.BASIC_AUTH_HEADER)).toBeNull()
    localStorage.setItem(StoreKey.REST_TOKEN, "another-tab")
    localStorage.setItem(StoreKey.BASIC_AUTH_HEADER, "Basic another-tab")
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ access_token: "renewed", expires_in: 3600 }),
    )
    await act(async () => {
      const result = await auth.refreshAuthToken(
        mocks.settings,
        "initial-refresh",
      )
      expect(result?.access_token).toBe("renewed")
      // A refresh reply that doesn't rotate the token keeps the original.
      expect(result?.refresh_token).toBe("initial-refresh")
    })
    expect(localStorage.getItem(StoreKey.REST_TOKEN)).toBe("another-tab")
    expect(localStorage.getItem(StoreKey.BASIC_AUTH_HEADER)).toBe(
      "Basic another-tab",
    )
  })

  it("returns no token when the server requires an ID token omitted on refresh", async () => {
    mocks.settings["acl.oidc.groups.encoded.in.token"] = true
    vi.spyOn(console, "warn").mockImplementation(() => {})
    await mount()
    const body = { access_token: "rejected", expires_in: 3600 }
    vi.mocked(fetch).mockResolvedValueOnce(tokenResponse(body))
    await act(async () => {
      await expect(
        auth.refreshAuthToken(mocks.settings, "initial-refresh"),
      ).resolves.toBeUndefined()
    })
    expect(ssoAuthState.getAuthPayload()).toBeNull()
    expect(
      renderer?.root.findByProps({ "data-hook": "mock-login" }).props
        .errorTitle,
    ).toBe("Missing ID token")
    expect(body).not.toHaveProperty("groups_encoded_in_token")
  })

  it("synchronizes the refresh coordinator immediately on non-reloading logout", async () => {
    await mount()
    const session = ssoAuthState.getAuthPayload()
    if (!isRefreshable(session)) throw new Error("Expected refreshable session")
    const request = new AbortController()
    let requestSignal: AbortSignal | undefined
    tokenRefresh.syncSession()
    tokenRefresh.start(session, (_deadline, signal) => {
      requestSignal = signal
      return new Promise((resolve) =>
        request.signal.addEventListener("abort", () => resolve(undefined)),
      )
    })
    await Promise.resolve()
    const wait = tokenRefresh.wait
    expect(wait).toBeDefined()
    const sync = vi.spyOn(tokenRefresh, "syncSession")
    act(() => auth.logout())
    expect(sync).toHaveBeenCalledOnce()
    expect(ssoAuthState.getAuthPayload()).toBeNull()
    expect(tokenRefresh.wait).toBeUndefined()
    expect(requestSignal?.aborted).toBe(true)
    request.abort()
    await wait
  })

  it("ignores a late success after logout instead of reinstalling the session", async () => {
    await mount()
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const refresh = auth.refreshAuthToken(mocks.settings, "initial-refresh")
    act(() => auth.logout())
    await act(async () => {
      resolve(tokenResponse({ ...initialToken, access_token: "late" }))
      await expect(refresh).resolves.toBeUndefined()
    })
    expect(ssoAuthState.getAuthPayload()).toBeNull()
  })

  it("keeps a late rotated token after the wait deadline without aborting fetch", async () => {
    await mount()
    const deadline = new AbortController()
    deadline.abort()
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({
        ...initialToken,
        access_token: "late",
        refresh_token: "rotated",
      }),
    )
    await act(async () => {
      await expect(
        auth.refreshAuthToken(
          mocks.settings,
          "initial-refresh",
          deadline.signal,
        ),
      ).resolves.toMatchObject({ refresh_token: "rotated" })
    })
    const refreshCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          url === "/token" &&
          init?.body instanceof URLSearchParams &&
          init.body.get("grant_type") === "refresh_token",
      )
    expect(refreshCall?.[1]?.signal?.aborted).toBe(false)
    expect(ssoAuthState.getAuthPayload()?.refresh_token).toBe("rotated")
  })

  it.each([429, 500, 503])(
    "keeps the session on JSON HTTP %s refresh failure",
    async (status) => {
      await mount()
      const session = ssoAuthState.getAuthPayload()
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
          status,
        }),
      )
      await expect(
        auth.refreshAuthToken(mocks.settings, "initial-refresh"),
      ).rejects.toThrow(`Identity provider unavailable (HTTP ${status})`)
      expect(ssoAuthState.getAuthPayload()).toBe(session)
      expect(
        renderer?.root.findAllByProps({ "data-hook": "mock-login" }),
      ).toHaveLength(0)
    },
  )

  it("ends the session for an explicit invalid_grant refresh error", async () => {
    await mount()
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    )
    await act(async () => {
      await expect(
        auth.refreshAuthToken(mocks.settings, "initial-refresh"),
      ).resolves.toBeUndefined()
    })
    expect(ssoAuthState.getAuthPayload()).toBeNull()
  })

  it("discards an aborted request's late body even before logout", async () => {
    await mount()
    const session = ssoAuthState.getAuthPayload()
    const network = new AbortController()
    const deadline = new AbortController()
    let finishBody!: (body: TokenResponse) => void
    const body = new Promise<TokenResponse>((resolve) => {
      finishBody = resolve
    })
    vi.mocked(fetch).mockResolvedValueOnce({
      status: 200,
      json: () => body,
    } as Response)
    const result = auth.refreshAuthToken(
      mocks.settings,
      "initial-refresh",
      deadline.signal,
      network.signal,
    )
    await Promise.resolve()
    network.abort()
    finishBody({
      ...initialToken,
      access_token: "obsolete",
      refresh_token: "obsolete",
    })
    await expect(result).resolves.toBeUndefined()
    expect(ssoAuthState.getAuthPayload()).toBe(session)
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.signal).toBe(network.signal)
  })

  it("keeps public callbacks stable after successful refresh", async () => {
    await mount()
    const before = auth
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ ...initialToken, access_token: "renewed" }),
    )
    await act(async () => {
      await auth.refreshAuthToken(mocks.settings, "initial-refresh")
    })
    expect(auth.refreshAuthToken).toBe(before.refreshAuthToken)
    expect(auth.logout).toBe(before.logout)
    expect(auth.redirectToAuthorizationUrl).toBe(
      before.redirectToAuthorizationUrl,
    )
  })

  it("shows a persistent consequence-aware warning and dismisses it on success or logout", async () => {
    await mount()
    ssoAuthState.markRefreshFailed()
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledWith(expect.any(Object), {
      autoClose: false,
      closeOnClick: false,
      toastId: "sso-refresh-failed",
    })
    const warning = create(mocks.toastError.mock.calls[0][0])
    expect(warning.root.findByType("p").children).toEqual([
      expect.stringContaining("expires at"),
    ])
    expect(warning.root.findByType("button").children).toEqual([
      "Sign in again",
    ])
    warning.unmount()
    mocks.toastDismiss.mockClear()
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ ...initialToken, access_token: "renewed" }),
    )
    await act(async () => {
      await auth.refreshAuthToken(mocks.settings, "initial-refresh")
    })
    expect(mocks.toastDismiss).toHaveBeenCalledWith("sso-refresh-failed")
    expect(ssoAuthState.hasRefreshFailed()).toBe(false)
    mocks.toastDismiss.mockClear()
    act(() => auth.logout())
    expect(mocks.toastDismiss).toHaveBeenCalledWith("sso-refresh-failed")
  })
})

describe("AuthProvider bearer expiry", () => {
  it("installs an ID token bearer without expires_in at sign-in and on refresh", async () => {
    // OAuth only recommends expires_in, the access token's lifetime.
    mocks.settings["acl.oidc.groups.encoded.in.token"] = true
    const signInExpiry = Math.floor(Date.now() / 1000) + 600
    signInToken = {
      ...initialToken,
      id_token: idToken(signInExpiry),
      expires_in: undefined,
    }
    await mount()
    expect(auth.sessionData?.expires_at).toBe(
      new Date(signInExpiry * 1000).toISOString(),
    )

    const refreshExpiry = signInExpiry + 600
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({
        access_token: "renewed",
        id_token: idToken(refreshExpiry),
        token_type: "Bearer",
      }),
    )
    await act(async () => {
      await expect(
        auth.refreshAuthToken(mocks.settings, "initial-refresh"),
      ).resolves.toMatchObject({
        id_token: idToken(refreshExpiry),
        expires_at: new Date(refreshExpiry * 1000).toISOString(),
      })
    })
    expect(ssoAuthState.getAuthPayload()?.id_token).toBe(idToken(refreshExpiry))
  })

  it.each([
    { bearer: "access token", groupsInToken: false, id_token: "initial-id" },
    { bearer: "ID token", groupsInToken: true, id_token: "not-a-jwt" },
  ])(
    "signs in with an $bearer bearer of unknown expiry, leaving it unscheduled",
    async ({ groupsInToken, id_token }) => {
      // A provider without lifetimes wants the token used until it is rejected.
      mocks.settings["acl.oidc.groups.encoded.in.token"] = groupsInToken
      // A provider's extra field is deliberately outside TokenResponse.
      const wireResponse = {
        ...initialToken,
        id_token,
        expires_in: undefined,
        expires_at: "2000-01-01T00:00:00.000Z",
      }
      signInToken = wireResponse
      await mount()
      expect(auth.sessionData?.expires_at).toBeUndefined()
      expect(ssoAuthState.getAuthPayload()?.expires_at).toBeUndefined()
    },
  )

  it("installs a refreshed token of unknown expiry", async () => {
    await mount()
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ access_token: "renewed", token_type: "Bearer" }),
    )
    await act(async () => {
      await expect(
        auth.refreshAuthToken(mocks.settings, "initial-refresh"),
      ).resolves.toMatchObject({
        access_token: "renewed",
        expires_at: undefined,
      })
    })
    expect(ssoAuthState.getAuthPayload()?.access_token).toBe("renewed")
    expect(ssoAuthState.getAuthPayload()?.expires_at).toBeUndefined()
  })
})
