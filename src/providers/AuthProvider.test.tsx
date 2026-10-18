import "../test/stubBrowserGlobals"
import React from "react"
import { Base64 } from "js-base64"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./AuthProvider"
import { QuestProvider } from "./QuestProvider"
import { questClient } from "../utils/questdb/queryClient"
import { authSessionState } from "../modules/OAuth2/authSessionState"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { StoreKey } from "../utils/localStorage/types"
import type { Settings } from "./SettingsProvider/types"
import type { TokenResponse } from "../modules/OAuth2/types"
import { isRefreshable, tokenRefresh } from "../utils/questdb/tokenRefresh"
import { SettingsProvider, useSettings } from "./SettingsProvider"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../theme"

const mocks = vi.hoisted(() => ({
  settings: {} as Settings,
  useRealSettings: false,
  toastError: vi.fn<
    [
      React.ReactElement,
      { autoClose: boolean; closeOnClick: boolean; toastId: string },
    ],
    void
  >(),
  toastDismiss: vi.fn(),
  reload: vi.fn(),
  toastActive: vi.fn(() => false),
}))
vi.mock("./SettingsProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./SettingsProvider")>()
  return {
    ...actual,
    useSettings: () => {
      const context = actual.useSettings()
      return mocks.useRealSettings ? context : { settings: mocks.settings }
    },
  }
})
vi.mock("../components/Toast", () => ({
  NOTIFICATION_SHORTCUT_LABEL: "Alt+N",
  REFRESH_FAILED_TOAST_ID: "sso-refresh-failed",
  toast: {
    error: mocks.toastError,
    dismiss: mocks.toastDismiss,
    isActive: mocks.toastActive,
  },
}))
vi.mock("../components/Button", () => ({ Button: "button" }))
vi.mock("../components/Text", () => ({ Text: "span" }))
vi.mock("../components/Box", () => ({ Box: "div" }))
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
  Box: "div",
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
const refreshToken = (
  deadline = new AbortController().signal,
  request = new AbortController().signal,
) => auth.refreshAuthToken(mocks.settings, "initial-refresh", deadline, request)
let signInToken: TokenResponse = initialToken
const tokenResponse = (body: TokenResponse) =>
  new Response(JSON.stringify(body), { status: 200 })
// Unsigned, as only the claims are read: the server verifies the signature.
const idToken = (exp: number) =>
  `header.${Base64.encodeURI(JSON.stringify({ exp }))}.signature`

beforeEach(() => {
  localStorage.clear()
  signInToken = initialToken
  mocks.useRealSettings = false
  mocks.toastActive.mockReturnValue(false)
  const tabStorage = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => tabStorage.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => tabStorage.set(key, value)),
    removeItem: vi.fn((key: string) => tabStorage.delete(key)),
  })
  vi.stubGlobal("location", {
    origin: "http://localhost",
    pathname: "/",
    search: "?code=test",
    href: "http://localhost/?code=test",
    reload: mocks.reload,
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
  authSessionState.endSession()
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
    const session = authSessionState.getAuthPayload()!
    const generation = authSessionState.getSessionId()
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
    expect(tokenRefresh.hardDeadline).toBeDefined()
    const requestSignal = vi.mocked(fetch).mock.lastCall?.[1]?.signal

    // Settings error/retry removes and replaces both providers without ending
    // this tab's session or cancelling its in-flight rotating refresh.
    act(() => renderer!.unmount())
    location.search = ""
    await act(async () => {
      renderer = create(tree())
      await Promise.resolve()
    })
    expect(authSessionState.getAuthPayload()).toBe(session)
    expect(authSessionState.getSessionId()).toBe(generation)
    expect(requestSignal?.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    return { finishRefresh, query }
  }

  it.each(["failure while unmounted", "warning removed on unmount"])(
    "restores the retained refresh warning after %s",
    async (phase) => {
      await mount()
      if (phase === "warning removed on unmount") {
        authSessionState.markRefreshFailed()
        act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
      }
      act(() => renderer!.unmount())
      authSessionState.markRefreshFailed()
      eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED)
      mocks.toastError.mockClear()
      location.search = ""
      await mount()
      expect(mocks.toastError).toHaveBeenCalledOnce()
      expect(mocks.toastError.mock.calls[0][1].toastId).toBe(
        "sso-refresh-failed",
      )
    },
  )

  it("confirms interruption before signing in again and explains the ended work on Login", async () => {
    await mount()
    vi.spyOn(questClient, "hasActiveRequests").mockReturnValue(true)
    const confirm = vi.fn(() => false)
    vi.stubGlobal("confirm", confirm)
    act(() => auth.signInAgain())
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Statements may already have executed"),
    )
    expect(authSessionState.isAuthenticated()).toBe(true)
    confirm.mockReturnValue(true)
    act(() => auth.signInAgain())
    const login = renderer!.root.findByProps({ "data-hook": "mock-login" })
    expect(login.props.errorMessage).toContain("Verify their outcomes")
    expect(authSessionState.isAuthenticated()).toBe(false)
  })

  it("confirms a real pending CSV upload with no SQL activity before signing in again", async () => {
    await mount()
    expect(questClient.hasActiveRequests()).toBe(false)
    let finishUpload!: () => void
    class UploadRequest {
      status = 200
      response = "{}"
      upload = { addEventListener: vi.fn() }
      open = vi.fn()
      setRequestHeader = vi.fn()
      send = vi.fn(() => {
        finishUpload = () => this.onload?.()
      })
      onload?: () => void
    }
    vi.stubGlobal("XMLHttpRequest", UploadRequest)
    const upload = questClient.uploadCSVFile({
      file: new File(["x\n1"], "probe.csv"),
      name: "probe",
      owner: "admin",
      onProgress: vi.fn(),
    })
    const rejected = expect(upload).rejects.toMatchObject({
      name: "SessionEndedError",
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(questClient.hasActiveRequests()).toBe(true)
    const confirm = vi.fn(() => false)
    vi.stubGlobal("confirm", confirm)
    act(() => auth.signInAgain())
    expect(confirm).toHaveBeenCalledOnce()
    expect(authSessionState.isAuthenticated()).toBe(true)
    confirm.mockReturnValue(true)
    act(() => auth.signInAgain())
    expect(
      renderer!.root.findByProps({ "data-hook": "mock-login" }).props
        .errorMessage,
    ).toContain("Verify their outcomes")
    finishUpload()
    await rejected
    expect(questClient.hasActiveRequests()).toBe(false)
  })

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
    expect(authSessionState.isAuthenticated()).toBe(false)
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
    expect(authSessionState.getAuthPayload()).toMatchObject({
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
      const generation = authSessionState.getSessionId()
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
      expect(authSessionState.getSessionId()).toBe(generation)
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
      expect(authSessionState.getSessionId()).toBe(generation)
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
      const generation = authSessionState.getSessionId()
      const oldSession = authSessionState.capture()
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
      expect(authSessionState.getAuthPayload()).toBeNull()
      expect(authSessionState.getSessionId()).toBeGreaterThan(generation)
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
    authSessionState.markRefreshFailed()
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
    expect(tokenRefresh.hardDeadline).toBeUndefined()
    expect(authSessionState.hasRefreshFailed()).toBe(false)
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
    expect(authSessionState.getAuthPayload()).toBeNull()
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
    authSessionState.setAuthPayload({
      ...initialToken,
      expires_at: new Date(Date.now() - 1).toISOString(),
    })
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledOnce()
    const warning = create(mocks.toastError.mock.calls[0][0])
    expect(warning.root.findAllByType("span")[0].children).toEqual([
      expect.stringContaining("Queries are not being sent"),
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
    expect(authSessionState.isAuthenticated()).toBe(false)
    warning.unmount()
  })

  it.each(["sso", "password"])(
    "retains this tab's %s login choice on reload with shared credentials",
    async (method) => {
      location.search = ""
      localStorage.setItem(StoreKey.REST_TOKEN, "password-tab-token")
      localStorage.setItem("sso.username.test-client", "sso-user")
      localStorage.setItem(StoreKey.SSO_SESSION_ACTIVE, "true")
      sessionStorage.setItem(StoreKey.LOGIN_METHOD, method)
      mocks.settings["acl.oidc.authorization.endpoint"] =
        "https://identity.example/authorize"
      await act(async () => {
        renderer = create(
          <AuthProvider>
            <span data-hook="live" />
          </AuthProvider>,
        )
        await Promise.resolve()
      })
      expect(localStorage.getItem(StoreKey.REST_TOKEN)).toBe(
        "password-tab-token",
      )
      if (method === "sso") {
        expect(location.href).toContain("https://identity.example/authorize?")
        expect(new URL(location.href).searchParams.get("prompt")).toBe("none")
      } else {
        expect(location.href).toBe("http://localhost/?code=test")
        expect(
          renderer!.root.findAllByProps({ "data-hook": "live" }),
        ).toHaveLength(1)
        expect(authSessionState.isSSOAuthenticated()).toBe(false)
      }
    },
  )

  it("preserves another tab's password credentials on both sign-in and refresh", async () => {
    localStorage.setItem(StoreKey.REST_TOKEN, "stale")
    localStorage.setItem(StoreKey.BASIC_AUTH_HEADER, "Basic stale")
    await mount()
    expect(localStorage.getItem(StoreKey.REST_TOKEN)).toBe("stale")
    expect(localStorage.getItem(StoreKey.BASIC_AUTH_HEADER)).toBe("Basic stale")
    expect(sessionStorage.getItem(StoreKey.LOGIN_METHOD)).toBe("sso")
    localStorage.setItem(StoreKey.REST_TOKEN, "another-tab")
    localStorage.setItem(StoreKey.BASIC_AUTH_HEADER, "Basic another-tab")
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ access_token: "renewed", expires_in: 3600 }),
    )
    await act(async () => {
      const result = await refreshToken()
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
      await expect(refreshToken()).resolves.toBeUndefined()
    })
    expect(authSessionState.getAuthPayload()).toBeNull()
    expect(
      renderer?.root.findByProps({ "data-hook": "mock-login" }).props
        .errorTitle,
    ).toBe("Missing ID token")
    expect(body).not.toHaveProperty("groups_encoded_in_token")
  })

  it.each([false, true])(
    "synchronizes refresh teardown on logout (reload=%s)",
    async (reload) => {
      await mount()
      const session = authSessionState.getAuthPayload()
      if (!isRefreshable(session))
        throw new Error("Expected refreshable session")
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
      const wait = tokenRefresh.softDeadline
      expect(wait).toBeDefined()
      const sync = vi.spyOn(tokenRefresh, "syncSession")
      act(() => auth.logout({ reload }))
      expect(sync).toHaveBeenCalledOnce()
      expect(mocks.reload).toHaveBeenCalledTimes(reload ? 1 : 0)
      expect(authSessionState.getAuthPayload()).toBeNull()
      expect(tokenRefresh.softDeadline).toBeUndefined()
      expect(requestSignal?.aborted).toBe(true)
      request.abort()
      await wait
    },
  )

  it("ignores an initial code response after the mounted owner's session ends", async () => {
    let finish!: (response: Response) => void
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <span data-hook="console-live" />
        </AuthProvider>,
      )
      await Promise.resolve()
    })
    expect(finish).toBeDefined()
    act(() => authSessionState.endSession())
    await act(async () => {
      finish(tokenResponse(initialToken))
      await Promise.resolve()
    })
    expect(authSessionState.isAuthenticated()).toBe(false)
    expect(
      renderer!.root.findAllByProps({ "data-hook": "mock-login" }),
    ).toHaveLength(1)
    expect(fetch).toHaveBeenCalledOnce()
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
    const refresh = refreshToken()
    act(() => auth.logout())
    await act(async () => {
      resolve(tokenResponse({ ...initialToken, access_token: "late" }))
      await expect(refresh).resolves.toBeUndefined()
    })
    expect(authSessionState.getAuthPayload()).toBeNull()
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
      await expect(refreshToken(deadline.signal)).resolves.toMatchObject({
        refresh_token: "rotated",
      })
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
    expect(authSessionState.getAuthPayload()?.refresh_token).toBe("rotated")
  })

  it.each([429, 500, 503])(
    "keeps the session on JSON HTTP %s refresh failure",
    async (status) => {
      await mount()
      const session = authSessionState.getAuthPayload()
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
          status,
        }),
      )
      await expect(refreshToken()).rejects.toThrow(
        `Identity provider unavailable (HTTP ${status})`,
      )
      expect(authSessionState.getAuthPayload()).toBe(session)
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
      await expect(refreshToken()).resolves.toBeUndefined()
    })
    expect(authSessionState.getAuthPayload()).toBeNull()
  })

  it("discards an aborted request's late body even before logout", async () => {
    await mount()
    const session = authSessionState.getAuthPayload()
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
    expect(authSessionState.getAuthPayload()).toBe(session)
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.signal).toBe(network.signal)
  })

  it("keeps public callbacks stable after successful refresh", async () => {
    await mount()
    const before = auth
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ ...initialToken, access_token: "renewed" }),
    )
    await act(async () => {
      await refreshToken()
    })
    expect(auth.refreshAuthToken).toBe(before.refreshAuthToken)
    expect(auth.logout).toBe(before.logout)
    expect(auth.redirectToAuthorizationUrl).toBe(
      before.redirectToAuthorizationUrl,
    )
  })

  it("shows a persistent consequence-aware warning and dismisses it on success or logout", async () => {
    await mount()
    authSessionState.markRefreshFailed()
    act(() => eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED))
    expect(mocks.toastError).toHaveBeenCalledWith(expect.any(Object), {
      autoClose: false,
      closeOnClick: false,
      toastId: "sso-refresh-failed",
    })
    const warning = create(mocks.toastError.mock.calls[0][0])
    expect(warning.root.findAllByType("span")[0].children).toEqual([
      expect.stringContaining("expires at"),
    ])
    expect(warning.root.findByType("button").children).toEqual([
      "Sign in again",
    ])
    expect(warning.root.findAllByType("span")[1].children).toEqual([
      expect.stringContaining("interrupts running requests"),
    ])
    expect(warning.root.findAllByType("span")[2].children).toEqual(
      expect.arrayContaining([expect.stringContaining("Escape to return")]),
    )
    warning.unmount()
    mocks.toastDismiss.mockClear()
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ ...initialToken, access_token: "renewed" }),
    )
    await act(async () => {
      await refreshToken()
    })
    expect(mocks.toastDismiss).toHaveBeenCalledWith("sso-refresh-failed")
    expect(authSessionState.hasRefreshFailed()).toBe(false)
    mocks.toastDismiss.mockClear()
    act(() => auth.logout())
    expect(mocks.toastDismiss).toHaveBeenCalledWith("sso-refresh-failed")
  })
})

describe.each([
  {
    key: StoreKey.REST_TOKEN,
    value: "recovered-password",
    authorization: "Bearer recovered-password",
  },
  {
    key: StoreKey.BASIC_AUTH_HEADER,
    value: "Basic recovered-password",
    authorization: "Basic recovered-password",
  },
])(
  "AuthProvider initial exchange ownership ($key)",
  ({ key, value, authorization }) => {
    it.each(["success", "OAuth error", "network error"])(
      "ignores late %s after Settings Retry recovery and password login",
      async (outcome) => {
        mocks.useRealSettings = true
        mocks.settings["acl.oidc.state.required"] = true
        location.search = "?code=test&state=expected"
        localStorage.setItem(StoreKey.OAUTH_STATE, "expected")
        vi.stubGlobal("history", {
          replaceState: (_state: unknown, _title: string, url: string) => {
            location.search = new URL(url, "http://localhost").search
          },
        })
        let settingsCalls = 0
        const settingsGates: Array<(response: Response) => void> = []
        let finishCode!: (response: Response) => void
        let rejectCode!: (error: Error) => void
        const config = () =>
          new Response(
            JSON.stringify({
              config: mocks.settings,
              preferences: {},
              "preferences.version": 1,
            }),
          )
        vi.mocked(fetch).mockImplementation((url) => {
          if (url === "settings") {
            settingsCalls++
            if (settingsCalls === 1)
              return Promise.resolve(new Response("", { status: 503 }))
            if (settingsCalls === 2 || settingsCalls === 3)
              return new Promise((resolve) => settingsGates.push(resolve))
            return Promise.resolve(config())
          }
          if (url === "warnings") return Promise.resolve(new Response("[]"))
          if (url === "assets/console-configuration.json")
            return Promise.resolve(new Response("{}"))
          if (url === "/token")
            return new Promise((resolve, reject) => {
              finishCode = resolve
              rejectCode = reject
            })
          return Promise.resolve(new Response(JSON.stringify({ ddl: "OK" })))
        })
        const Consumer = () => {
          auth = useAuth()
          return <span data-hook="console-live" />
        }
        let reloadSettings!: ReturnType<
          typeof useSettings
        >["refreshSettingsAndPreferences"]
        const SettingsDriver = () => {
          reloadSettings = useSettings().refreshSettingsAndPreferences
          return null
        }
        await act(async () => {
          renderer = create(
            <ThemeProvider theme={darkTheme}>
              <SettingsProvider>
                <SettingsDriver />
                <AuthProvider>
                  <QuestProvider>
                    <Consumer />
                  </QuestProvider>
                </AuthProvider>
              </SettingsProvider>
            </ThemeProvider>,
          )
          await Promise.resolve()
        })
        const retry = () =>
          renderer!.root
            .findAllByType("button")
            .find((button) => button.children.includes("Retry"))!
        // Retry re-entry is guarded. A later settings refresh can still remove
        // the Auth owner while its initial code exchange is pending.
        await act(async () => {
          retry().props.onClick()
          retry().props.onClick()
          await Promise.resolve()
        })
        expect(settingsGates).toHaveLength(1)
        await act(async () => {
          settingsGates.shift()!(config())
          await Promise.resolve()
        })
        expect(finishCode).toBeDefined()
        expect(location.search).toBe("")
        let settingsRefresh!: Promise<unknown>
        await act(async () => {
          settingsRefresh = reloadSettings()
          await Promise.resolve()
        })
        await act(async () => {
          settingsGates.shift()!(new Response("", { status: 503 }))
          await settingsRefresh
          await Promise.resolve()
        })
        await act(async () => {
          retry().props.onClick()
          await Promise.resolve()
        })
        const login = renderer!.root.findByProps({ "data-hook": "mock-login" })
        await act(async () => {
          localStorage.setItem(key, value)
          login.props.onBasicAuthSuccess()
          await Promise.resolve()
        })
        const recoveredSession = authSessionState.capture()
        const callsBefore = vi.mocked(fetch).mock.calls.length
        await act(async () => {
          if (outcome === "network error") rejectCode(new Error("Offline"))
          else
            finishCode(
              outcome === "success"
                ? tokenResponse(initialToken)
                : new Response(JSON.stringify({ error: "invalid_grant" }), {
                    status: 400,
                  }),
            )
          await Promise.resolve()
        })
        expect(localStorage.getItem(key)).toBe(value)
        expect(authSessionState.getAuthPayload()).toBeNull()
        expect(recoveredSession.isCurrent()).toBe(true)
        expect(fetch).toHaveBeenCalledTimes(callsBefore)
        expect(
          renderer!.root.findAllByProps({ "data-hook": "console-live" }),
        ).toHaveLength(1)
        await questClient.queryRaw("SELECT 987")
        expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({
          Authorization: authorization,
        })
      },
    )
  },
)

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
      await expect(refreshToken()).resolves.toMatchObject({
        id_token: idToken(refreshExpiry),
        expires_at: new Date(refreshExpiry * 1000).toISOString(),
      })
    })
    expect(authSessionState.getAuthPayload()?.id_token).toBe(
      idToken(refreshExpiry),
    )
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
      expect(authSessionState.getAuthPayload()?.expires_at).toBeUndefined()
    },
  )

  it("installs a refreshed token of unknown expiry", async () => {
    await mount()
    vi.mocked(fetch).mockResolvedValueOnce(
      tokenResponse({ access_token: "renewed", token_type: "Bearer" }),
    )
    await act(async () => {
      await expect(refreshToken()).resolves.toMatchObject({
        access_token: "renewed",
        expires_at: undefined,
      })
    })
    expect(authSessionState.getAuthPayload()?.access_token).toBe("renewed")
    expect(authSessionState.getAuthPayload()?.expires_at).toBeUndefined()
  })
})
