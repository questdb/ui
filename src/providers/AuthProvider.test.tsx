import "../test/stubBrowserGlobals"
import React from "react"
import { Base64 } from "js-base64"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./AuthProvider"
import { QuestProvider } from "./QuestProvider"
import { questClient } from "../utils/questdb/queryClient"
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
  NOTIFICATION_SHORTCUT: "Alt+N",
  toast: {
    error: mocks.toastError,
    dismiss: mocks.toastDismiss,
    isActive: mocks.toastActive,
  },
}))
vi.mock("../components/Button", () => ({ Button: "button" }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: () => undefined,
}))
vi.mock("../store", () => ({
  actions: { telemetry: { start: () => ({ type: "start" }) } },
  selectors: { telemetry: { getConfig: vi.fn() } },
}))
vi.mock("../modules/ConsoleEventTracker", () => ({
  start: vi.fn(),
  stop: vi.fn(),
}))
vi.mock("../components/QueryExecutionConfirmDialog", () => ({
  QueryExecutionConfirmDialog: () => null,
}))
vi.mock("../components", () => ({
  Text: "span",
  Button: "button",
  CenteredLayout: "section",
}))
vi.mock("../modules/OAuth2/views/login", () => ({
  Login: (props: Record<string, unknown>) =>
    React.createElement("div", {
      ...props,
      "data-hook": "mock-login",
      "data-sso-username": localStorage.getItem("sso.username.test-client"),
    }),
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
  const recoverDuringRefresh = async () => {
    const Consumer = () => {
      auth = useAuth()
      return <span data-hook="console-live" />
    }
    const tree = () => (
      <AuthProvider>
        <QuestProvider>
          <Consumer />
        </QuestProvider>
      </AuthProvider>
    )
    vi.mocked(fetch).mockImplementation((url) =>
      Promise.resolve(
        url === "/token"
          ? tokenResponse(initialToken)
          : new Response(JSON.stringify({ ddl: "OK" })),
      ),
    )
    await act(async () => {
      renderer = create(tree())
      await Promise.resolve()
    })
    expect(
      renderer!.root.findAllByProps({ "data-hook": "console-live" }),
    ).toHaveLength(1)
    const session = ssoAuthState.getAuthPayload()!
    const generation = ssoAuthState.getSessionId()
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse(session.expires_at!) - 20_000,
    )
    vi.mocked(fetch).mockClear()
    let finishRefresh!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      finishRefresh = resolve
    })
    vi.mocked(fetch).mockImplementation((url) =>
      url === "/token"
        ? pending
        : Promise.resolve(new Response(JSON.stringify({ ddl: "OK" }))),
    )
    const query = questClient
      .queryRaw("SELECT 99")
      .catch((error: unknown) => error)
    await act(async () => {
      await Promise.resolve()
    })
    expect(tokenRefresh.completion).toBeDefined()
    const requestSignal = vi.mocked(fetch).mock.lastCall?.[1]?.signal

    // Settings error/retry removes and replaces both providers without ending
    // this tab's session or cancelling its in-flight rotating refresh.
    act(() => renderer!.unmount())
    location.search = ""
    await act(async () => {
      renderer = create(tree())
      await Promise.resolve()
    })
    expect(ssoAuthState.getAuthPayload()).toBe(session)
    expect(ssoAuthState.getSessionId()).toBe(generation)
    expect(requestSignal?.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    return { finishRefresh, query }
  }

  it("shows the mounted login when a refresh started before recovery ends the session", async () => {
    const { finishRefresh, query } = await recoverDuringRefresh()
    await act(async () => {
      finishRefresh(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Revoked",
          }),
          { status: 400 },
        ),
      )
      await query
    })
    expect(ssoAuthState.isAuthenticated()).toBe(false)
    expect(
      renderer!.root.findByProps({ "data-hook": "mock-login" }).props,
    ).toMatchObject({
      errorTitle: "Your SSO session has expired",
      errorMessage: "Revoked Please sign in again.",
    })
    expect(
      renderer!.root.findAllByProps({ "data-hook": "console-live" }),
    ).toHaveLength(0)
  })

  it("keeps a rotated token when a refresh started before recovery succeeds", async () => {
    const { finishRefresh, query } = await recoverDuringRefresh()
    await act(async () => {
      finishRefresh(
        tokenResponse({
          ...initialToken,
          access_token: "renewed",
          refresh_token: "rotated",
        }),
      )
      await query
    })
    expect(ssoAuthState.getAuthPayload()).toMatchObject({
      access_token: "renewed",
      refresh_token: "rotated",
    })
    expect(
      renderer!.root.findAllByProps({ "data-hook": "mock-login" }),
    ).toHaveLength(0)
    expect(
      renderer!.root.findAllByProps({ "data-hook": "console-live" }),
    ).toHaveLength(1)
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer renewed",
    })
  })

  it.each([StoreKey.REST_TOKEN, StoreKey.BASIC_AUTH_HEADER])(
    "resumes and refreshes retained SSO after recovery with another tab's %s",
    async (credentialKey) => {
      await mount()
      const retained = auth.sessionData
      const generation = ssoAuthState.getSessionId()
      act(() => renderer?.unmount())
      localStorage.setItem(credentialKey, "another-tab")
      location.search = ""
      vi.mocked(fetch).mockImplementation((url) =>
        Promise.resolve(
          url === "/token"
            ? tokenResponse({ ...initialToken, access_token: "renewed" })
            : new Response(JSON.stringify({ ddl: "OK" })),
        ),
      )
      const Consumer = () => {
        auth = useAuth()
        return null
      }
      await act(async () => {
        renderer = create(
          <AuthProvider>
            <QuestProvider>
              <Consumer />
            </QuestProvider>
          </AuthProvider>,
        )
        await Promise.resolve()
      })
      expect(auth.sessionData).toBe(retained)
      expect(ssoAuthState.getSessionId()).toBe(generation)
      expect(questClient.refreshTokenMethod).toBeTypeOf("function")
      expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({
        Authorization: "Bearer initial",
      })

      const expiry = Date.parse(retained!.expires_at!)
      vi.spyOn(Date, "now").mockReturnValue(expiry + 1)
      await act(async () => {
        await questClient.queryRaw("select 1")
      })
      expect(auth.sessionData?.access_token).toBe("renewed")
      expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({
        Authorization: "Bearer renewed",
      })
      expect(localStorage.getItem(credentialKey)).toBe("another-tab")
      expect(ssoAuthState.getSessionId()).toBe(generation)
    },
  )

  it.each([
    {
      mode: "password",
      key: StoreKey.REST_TOKEN,
      value: "password-token",
      authorization: "Bearer password-token",
    },
    {
      mode: "password",
      key: StoreKey.BASIC_AUTH_HEADER,
      value: "Basic password",
      authorization: "Basic password",
    },
    {
      mode: "browser basic",
      key: undefined,
      value: undefined,
      authorization: undefined,
    },
    {
      mode: "disabled ACL",
      key: undefined,
      value: undefined,
      authorization: undefined,
    },
  ])(
    "ends retained SSO when settings recovery switches to $mode ($key)",
    async ({ mode, key, value, authorization }) => {
      await mount()
      const generation = ssoAuthState.getSessionId()
      const oldSession = ssoAuthState.capture()
      act(() => renderer!.unmount())
      location.search = ""
      mocks.settings = {
        "acl.enabled": mode !== "disabled ACL",
        "acl.oidc.enabled": false,
        "acl.basic.auth.realm.enabled": mode === "browser basic",
      }
      if (key && value) localStorage.setItem(key, value)
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ddl: "OK" }))),
      )
      await act(async () => {
        renderer = create(
          <AuthProvider>
            <QuestProvider>
              <span data-hook="console-live" />
            </QuestProvider>
          </AuthProvider>,
        )
        await Promise.resolve()
      })
      expect(ssoAuthState.getAuthPayload()).toBeNull()
      expect(ssoAuthState.getSessionId()).toBeGreaterThan(generation)
      expect(oldSession.isCurrent()).toBe(false)
      expect(questClient.refreshTokenMethod).toBeUndefined()
      expect(
        renderer!.root.findAllByProps({ "data-hook": "console-live" }),
      ).toHaveLength(1)
      if (key) expect(localStorage.getItem(key)).toBe(value)
      await questClient.queryRaw("select 99")
      const headers = vi.mocked(fetch).mock.lastCall?.[1]?.headers as Record<
        string,
        string
      >
      expect(headers.Authorization).toBe(authorization)
    },
  )

  it("cancels a retained rotating refresh when recovered settings disable ACL", async () => {
    const { finishRefresh, query } = await recoverDuringRefresh()
    const requestSignal = vi.mocked(fetch).mock.lastCall?.[1]?.signal
    ssoAuthState.markRefreshFailed()
    act(() => renderer!.unmount())
    mocks.settings = { "acl.enabled": false }
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <QuestProvider>
            <span data-hook="console-live" />
          </QuestProvider>
        </AuthProvider>,
      )
      await Promise.resolve()
    })
    expect(requestSignal?.aborted).toBe(true)
    expect(tokenRefresh.completion).toBeUndefined()
    expect(ssoAuthState.hasRefreshFailed()).toBe(false)
    await act(async () => {
      finishRefresh(
        tokenResponse({
          ...initialToken,
          access_token: "obsolete",
          refresh_token: "obsolete",
        }),
      )
      await query
    })
    expect(ssoAuthState.getAuthPayload()).toBeNull()
    await questClient.queryRaw("select 99")
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).not.toHaveProperty(
      "Authorization",
    )
    expect(
      renderer!.root.findAllByProps({ "data-hook": "console-live" }),
    ).toHaveLength(1)
  })

  it("clears the remembered identity before an asynchronous forced logout renders Login", async () => {
    await mount()
    localStorage.setItem("sso.username.test-client", "previous-user")
    localStorage.setItem(StoreKey.OAUTH_REDIRECT_COUNT, "5")
    // Deliberately outside act's outer batch: React 17 flushes the session-end
    // listener synchronously when an asynchronous SQL 401 reaches logout.
    await Promise.resolve().then(() =>
      eventBus.publish(EventType.MSG_CONNECTION_UNAUTHORIZED),
    )
    expect(localStorage.getItem("sso.username.test-client")).toBeNull()
    expect(
      renderer!.root.findByProps({ "data-hook": "mock-login" }).props[
        "data-sso-username"
      ],
    ).toBeNull()
  })

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
    expect(sync).toHaveBeenCalled()
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
    expect(warning.root.findByType("small").children).toEqual([
      "Close any open dialog, then press ",
      "Alt+N",
      " to focus this notification.",
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
  it.each([0, "0"])(
    "renews a zero-lifetime response (%j) before sending SQL",
    async (expiresIn) => {
      vi.mocked(fetch).mockImplementation((url, init) => {
        const grant = (init?.body as URLSearchParams | undefined)?.get(
          "grant_type",
        )
        return Promise.resolve(
          url === "/token"
            ? new Response(
                JSON.stringify({
                  ...initialToken,
                  expires_in: expiresIn,
                  ...(grant === "refresh_token"
                    ? {
                        access_token: "renewed",
                        refresh_token: "rotated",
                        expires_in: 3600,
                      }
                    : {}),
                }),
              )
            : new Response(JSON.stringify({ ddl: "OK" })),
        )
      })
      const Consumer = () => {
        auth = useAuth()
        return <span data-hook="console-live" />
      }
      await act(async () => {
        renderer = create(
          <AuthProvider>
            <QuestProvider>
              <Consumer />
            </QuestProvider>
          </AuthProvider>,
        )
        await Promise.resolve()
      })
      expect(auth.sessionData).toMatchObject({
        access_token: "renewed",
        refresh_token: "rotated",
      })
      const refreshes = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url, init]) =>
            url === "/token" &&
            (init?.body as URLSearchParams).get("grant_type") ===
              "refresh_token",
        )
      expect(refreshes).toHaveLength(1)
      expect(
        (refreshes[0][1]?.body as URLSearchParams).get("refresh_token"),
      ).toBe("initial-refresh")
      const sqlCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("exec?") &&
            !url.includes("session=true"),
        )
      expect(sqlCalls.length).toBeGreaterThan(0)
      for (const [, init] of sqlCalls)
        expect(init?.headers).toMatchObject({ Authorization: "Bearer renewed" })
      expect(
        renderer!.root.findAllByProps({ "data-hook": "console-live" }),
      ).toHaveLength(1)
    },
  )

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
