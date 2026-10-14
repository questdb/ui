import "../test/stubBrowserGlobals"
import React from "react"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./AuthProvider"
import { ssoAuthState } from "../modules/OAuth2/ssoAuthState"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { StoreKey } from "../utils/localStorage/types"
import type { Settings } from "./SettingsProvider/types"
import type { TokenResponse } from "../modules/OAuth2/types"

const mocks = vi.hoisted(() => ({
  settings: {} as Settings,
  toastError: vi.fn(),
  toastDismiss: vi.fn(),
}))
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}))
vi.mock("../components/Toast", () => ({
  toast: { error: mocks.toastError, dismiss: mocks.toastDismiss },
}))
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
const tokenResponse = (body: TokenResponse) =>
  new Response(JSON.stringify(body), { status: 200 })

beforeEach(() => {
  localStorage.clear()
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
        url === "/token" ? tokenResponse(initialToken) : new Response(""),
      ),
    ),
  )
})

afterEach(() => {
  act(() => renderer?.unmount())
  ssoAuthState.clearAuthPayload()
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
  expect(auth.sessionData?.access_token).toBe("initial")
}

describe("AuthProvider token installation", () => {
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
    expect(refreshCall?.[1]?.signal).toBeUndefined()
    expect(ssoAuthState.getAuthPayload()?.refresh_token).toBe("rotated")
  })

  it("shows a persistent consequence-aware warning and dismisses it on success or logout", async () => {
    await mount()
    ssoAuthState.markRefreshFailed()
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining("you may be signed out"),
      { autoClose: false, toastId: "sso-refresh-failed" },
    )
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
