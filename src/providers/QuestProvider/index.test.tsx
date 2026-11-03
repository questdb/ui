import "../../test/stubBrowserGlobals"
import React, { useContext } from "react"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../theme"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StoreKey } from "../../utils/localStorage/types"
import type { AuthPayload } from "../../modules/OAuth2/types"
import type { Settings } from "../SettingsProvider/types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { questClient } from "../../utils/questdb/queryClient"

const mocks = vi.hoisted(() => ({
  sessionData: undefined as AuthPayload | undefined,
  refresh: vi.fn(),
  queryRaw: vi.fn(),
  prepareRenewalRetry: vi.fn(),
  headers: vi.fn<[Record<string, string>], void>(),
  dispatch: vi.fn(),
  headingFocus: vi.fn(),
  mainFocus: vi.fn(),
  signInAgain: vi.fn(),
  mainSetAttribute: vi.fn(),
  mainRemoveAttribute: vi.fn(),
  mainAddEventListener: vi.fn<[string, () => void, unknown?], void>(),
  settings: {
    "acl.enabled": true,
    "acl.basic.auth.realm.enabled": false,
  } as Settings,
}))
vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    sessionData: mocks.sessionData,
    refreshAuthToken: mocks.refresh,
    signInAgain: mocks.signInAgain,
  }),
}))
vi.mock("../SettingsProvider", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}))
vi.mock("../../utils/questdb/queryClient", () => ({
  questClient: {
    queryRaw: mocks.queryRaw,
    prepareRenewalRetry: mocks.prepareRenewalRetry,
    setCommonHeaders: mocks.headers,
    resetCredentials: () => {
      mocks.headers({})
      questClient.refreshTokenMethod = undefined
    },
    refreshTokenMethod: undefined,
  },
}))
vi.mock("../../utils/questdb", () => ({
  QueryExecutionManager: vi.fn(),
  Type: { DQL: "dql" },
}))
vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: () => undefined,
}))
vi.mock("../../store", () => ({
  actions: { telemetry: { start: () => ({ type: "start" }) } },
  selectors: { telemetry: { getConfig: vi.fn() } },
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({
  start: vi.fn(),
  stop: vi.fn(),
}))
vi.mock("../../components/QueryExecutionConfirmDialog", () => ({
  QueryExecutionConfirmDialog: () => null,
}))
vi.mock("../../components", () => ({
  Text: "span",
  Button: "button",
  CenteredLayout: "section",
  Box: "div",
}))
vi.mock("../../utils/questdb/queryExecution", () => ({ questExecution: {} }))
vi.mock("../../components/Box", () => ({
  Box: ({ children }: React.PropsWithChildren<unknown>) => (
    <div>{children}</div>
  ),
}))

import { QuestContext, QuestProvider as ActualQuestProvider } from "."
const QuestProvider = ({ children }: React.PropsWithChildren<unknown>) => (
  <ThemeProvider theme={darkTheme}>
    <ActualQuestProvider>{children}</ActualQuestProvider>
  </ThemeProvider>
)

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  mocks.sessionData = undefined
  mocks.settings = {
    "acl.enabled": true,
    "acl.basic.auth.realm.enabled": false,
  }
  mocks.queryRaw.mockReset().mockResolvedValue({ type: "dml" })
  mocks.prepareRenewalRetry.mockReset().mockResolvedValue(undefined)
  mocks.headers.mockClear()
  localStorage.clear()
  authSessionState.endSession()
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.clearAllMocks()
  vi.useRealTimers()
})
const mount = async (children = <div data-hook="ready" />) => {
  await act(async () => {
    renderer = create(<QuestProvider>{children}</QuestProvider>, {
      createNodeMock: (element) => ({
        focus: element.type === "h1" ? mocks.headingFocus : mocks.mainFocus,
        setAttribute: mocks.mainSetAttribute,
        removeAttribute: mocks.mainRemoveAttribute,
        addEventListener: mocks.mainAddEventListener,
        removeEventListener: vi.fn(),
      }),
    })
    await Promise.resolve()
  })
}

describe("QuestProvider authentication gate", () => {
  it.each([
    new AuthRefreshUnavailableError(),
    {
      error: "renewal unavailable",
      authRefreshUnavailable: true,
      requestNotSent: true,
    },
  ])(
    "explains an IdP renewal failure and offers sign-in independently of the toast",
    async (failure) => {
      mocks.queryRaw.mockRejectedValue(failure)
      await mount()
      expect(renderer!.root.findByType("h1").children).toEqual([
        "Could not renew your SSO session",
      ])
      const signIn = renderer!.root
        .findAllByType("button")
        .find((button) => button.children.includes("Sign in again"))!
      const onSignIn = signIn.props.onClick as () => void
      act(onSignIn)
      expect(mocks.signInAgain).toHaveBeenCalledOnce()
      expect(
        renderer!.root.findByProps({ role: "status" }).findByType("span")
          .children,
      ).toEqual(["Renewal failed. Retry connection, or sign in again."])
    },
  )

  it("renews before a Retry, but not before the automatic check", async () => {
    // Given a startup check that failed because renewal failed
    mocks.queryRaw.mockRejectedValue(new AuthRefreshUnavailableError())
    await mount()
    expect(mocks.prepareRenewalRetry).not.toHaveBeenCalled()
    const checks = () =>
      mocks.queryRaw.mock.calls.filter(([query]) => query === "SELECT 1").length
    const failedChecks = checks()
    let renewed!: () => void
    mocks.prepareRenewalRetry.mockImplementation(
      () => new Promise<void>((resolve) => (renewed = resolve)),
    )

    // When the user retries, while a renewal is still being answered
    const retry = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Retry connection"))!
    await act(async () => {
      retry.props.onClick()
      await Promise.resolve()
    })

    // Then it shows that it is reconnecting, and checks only once renewed
    expect(mocks.prepareRenewalRetry).toHaveBeenCalledOnce()
    expect(checks()).toBe(failedChecks)
    expect(retry.props["aria-busy"]).toBe(true)
    expect(
      renderer!.root.findByProps({ role: "status" }).findByType("span")
        .children,
    ).toEqual(["Reconnecting…"])
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      renewed()
      await Promise.resolve()
    })
    expect(checks()).toBe(failedChecks + 1)
    expect(
      renderer!.root.findAllByProps({ "data-hook": "ready" }),
    ).toHaveLength(1)
  })

  it("shows a delayed status while an auth check waits, then removes it on completion", async () => {
    vi.useFakeTimers()
    let finish!: (result: { type: string }) => void
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? new Promise((resolve) => {
            finish = resolve
          })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(0)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(
      renderer!.root.findByProps({ role: "status" }).findByType("span")
        .children,
    ).toEqual(["Checking your session…"])
    await act(async () => {
      finish({ type: "dml" })
      await Promise.resolve()
    })
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(0)
    expect(renderer!.root.findByType("main").props.tabIndex).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("reads a rotated refresh token when the installed refresh method runs", async () => {
    mocks.sessionData = {
      access_token: "old",
      refresh_token: "r1",
      token_type: "Bearer",
    }
    authSessionState.setAuthPayload(mocks.sessionData)
    await mount()
    const refresh = questClient.refreshTokenMethod!
    authSessionState.setAuthPayload({
      ...mocks.sessionData,
      refresh_token: "r2",
    })
    const deadline = new AbortController().signal
    const network = new AbortController().signal
    await refresh(deadline, network)
    expect(mocks.refresh).toHaveBeenLastCalledWith(
      mocks.settings,
      "r2",
      deadline,
      network,
    )
  })

  it("releases password headers and refresh callbacks on unmount", async () => {
    localStorage.setItem(StoreKey.REST_TOKEN, "private")
    await mount()
    act(() => renderer?.unmount())
    expect(mocks.headers).toHaveBeenLastCalledWith({})
    expect(questClient.refreshTokenMethod).toBeUndefined()
  })

  it("focuses recovery and then the console after a successful Retry", async () => {
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "Offline" })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    expect(mocks.headingFocus).toHaveBeenCalledOnce()
    mocks.mainFocus.mockClear()
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      renderer!.root.findByType("button").props.onClick()
      await Promise.resolve()
    })
    expect(mocks.mainFocus).toHaveBeenCalledOnce()
    expect(mocks.mainSetAttribute).toHaveBeenCalledWith("tabindex", "-1")
    expect(renderer!.root.findByType("main").props.tabIndex).toBeUndefined()
    const release = mocks.mainAddEventListener.mock.calls.find(
      ([event]) => event === "blur",
    )![1]
    release()
    expect(mocks.mainRemoveAttribute).toHaveBeenCalledWith("tabindex")
  })

  it.each([StoreKey.REST_TOKEN, StoreKey.BASIC_AUTH_HEADER])(
    "does not let retained %s overwrite SSO credentials",
    async (key) => {
      // These are deliberately NOT cleared by AuthProvider in this test.
      localStorage.setItem(key, "other-tab")
      mocks.sessionData = { access_token: "sso", token_type: "Bearer" }
      await mount()
      expect(localStorage.getItem(key)).toBe("other-tab")
      expect(
        mocks.headers.mock.calls.every(
          ([headers]) => headers.Authorization === undefined,
        ),
      ).toBe(true)
    },
  )

  describe.each([
    {
      key: StoreKey.REST_TOKEN,
      credential: "first-user",
      authorization: "Bearer first-user",
      replacement: "other-user",
      replacementAuthorization: "Bearer other-user",
    },
    {
      key: StoreKey.BASIC_AUTH_HEADER,
      credential: "Basic first-user",
      authorization: "Basic first-user",
      replacement: "Basic other-user",
      replacementAuthorization: "Basic other-user",
    },
  ])(
    "$key session snapshot",
    ({
      key,
      credential,
      authorization,
      replacement,
      replacementAuthorization,
    }) => {
      it.each(["replacement", "removal"])(
        "keeps its credentials after another tab's %s during the initial check",
        async (change) => {
          let finishAuthCheck!: (result: { type: string }) => void
          const authCheck = new Promise<{ type: string }>((resolve) => {
            finishAuthCheck = resolve
          })
          mocks.queryRaw.mockImplementation((query: string) =>
            query === "SELECT 1" ? authCheck : Promise.resolve({ type: "dml" }),
          )
          localStorage.setItem(key, credential)
          await mount()
          expect(mocks.headers).toHaveBeenLastCalledWith({
            Authorization: authorization,
          })
          expect(
            renderer?.root.findAllByProps({ "data-hook": "ready" }),
          ).toHaveLength(0)
          expect(mocks.dispatch).not.toHaveBeenCalled()

          if (change === "replacement") {
            localStorage.setItem(key, replacement)
          } else {
            localStorage.removeItem(key)
          }
          await act(async () => {
            finishAuthCheck({ type: "dml" })
            await Promise.resolve()
          })

          expect(
            renderer?.root.findAllByProps({ "data-hook": "ready" }),
          ).toHaveLength(1)
          expect(mocks.headers).toHaveBeenLastCalledWith({
            Authorization: authorization,
          })
          expect(mocks.dispatch).toHaveBeenCalledTimes(1)
          expect(mocks.dispatch).toHaveBeenCalledWith({ type: "start" })
          expect(mocks.headers.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.dispatch.mock.invocationCallOrder[0],
          )
        },
      )

      it("keeps its credentials when settings change", async () => {
        localStorage.setItem(key, credential)
        await mount()
        localStorage.setItem(key, replacement)
        mocks.settings = { ...mocks.settings, "release.version": "updated" }
        await act(async () => {
          renderer?.update(
            <QuestProvider>
              <div data-hook="ready" />
            </QuestProvider>,
          )
          await Promise.resolve()
        })
        expect(mocks.headers).toHaveBeenLastCalledWith({
          Authorization: authorization,
        })
      })

      it("captures the current credentials on a new provider mount", async () => {
        localStorage.setItem(key, credential)
        await mount()
        localStorage.setItem(key, replacement)
        act(() => renderer?.unmount())
        await mount()
        expect(mocks.headers).toHaveBeenLastCalledWith({
          Authorization: replacementAuthorization,
        })
      })
    },
  )

  it("fetches build information after Retry succeeds", async () => {
    const versions: string[] = []
    const Consumer = () => {
      versions.push(useContext(QuestContext).buildVersion.version ?? "")
      return null
    }
    mocks.queryRaw.mockRejectedValue({ error: "Offline" })
    await mount(<Consumer />)
    expect(mocks.queryRaw).not.toHaveBeenCalledWith(
      "select build",
      expect.anything(),
    )
    mocks.queryRaw.mockImplementation((query: string) =>
      Promise.resolve(
        query === "select build"
          ? {
              type: "dql",
              count: 1,
              dataset: [
                [
                  "Build Information: QuestDB Enterprise 9.0.0, Commit Hash abc123",
                ],
              ],
            }
          : { type: "dml" },
      ),
    )
    await act(async () => {
      renderer!.root.findByType("button").props.onClick()
      await Promise.resolve()
    })
    expect(mocks.queryRaw).toHaveBeenCalledWith("select build", {
      limit: "0,1000",
      background: true,
    })
    expect(versions.some((version) => version.length > 0)).toBe(true)
  })

  it("renders a recoverable error when SELECT 1 fails", async () => {
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "QuestDB is not reachable [502]" })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    expect(
      renderer?.root.findByProps({ role: "alert" }).findByType("span").children,
    ).toEqual(["QuestDB is not reachable [502]"])
    expect(
      renderer?.root.findByProps({ role: "alert" }).findByType("span").props
        .color,
    ).toBe("statusDanger")
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      renderer?.root.findByType("button").props.onClick()
      await Promise.resolve()
    })
    expect(
      renderer?.root.findAllByProps({ "data-hook": "ready" }),
    ).toHaveLength(1)
  })

  it("keeps the recovery panel and retry button mounted while retrying", async () => {
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "QuestDB is not reachable [502]" })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    const button = renderer!.root.findByType("button")
    let failRetry!: (error: { error: string }) => void
    const retry = new Promise((_, reject) => {
      failRetry = reject
    })
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1" ? retry : Promise.resolve({ type: "dml" }),
    )
    await act(async () => {
      button.props.onClick()
      await Promise.resolve()
    })

    expect(renderer!.root.findByType("button")).toBe(button)
    expect(button.props.disabled).not.toBe(true)
    expect(button.props["aria-disabled"]).toBe(true)
    expect(button.props["aria-busy"]).toBe(true)
    expect(renderer!.root.findByProps({ role: "alert" })).toBeDefined()
    expect(
      renderer!.root.findByProps({ role: "status" }).findByType("span")
        .children,
    ).toContain("Reconnecting…")
    const attempts = mocks.queryRaw.mock.calls.length
    act(() => {
      button.props.onClick()
    })
    expect(mocks.queryRaw).toHaveBeenCalledTimes(attempts)
    expect(
      renderer!.root.findAllByProps({ "data-hook": "ready" }),
    ).toHaveLength(0)

    await act(async () => {
      failRetry({ error: "Still unavailable" })
      await Promise.resolve()
    })
    expect(renderer!.root.findByType("button")).toBe(button)
    expect(button.props["aria-disabled"]).toBe(false)
    expect(button.props["aria-busy"]).toBe(false)
    expect(
      renderer!.root.findByProps({ role: "alert" }).findByType("span").children,
    ).toEqual(["Still unavailable"])

    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      button.props.onClick()
      await Promise.resolve()
    })
    expect(
      renderer!.root.findAllByProps({ "data-hook": "ready" }),
    ).toHaveLength(1)
  })

  it("does not start another probe when credentials refresh during a retry", async () => {
    mocks.sessionData = { access_token: "old", token_type: "Bearer" }
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "QuestDB is not reachable [502]" })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    let failRetry!: (error: { error: string }) => void
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? new Promise((_, reject) => {
            failRetry = reject
          })
        : Promise.resolve({ type: "dml" }),
    )
    const button = renderer!.root.findByType("button")
    await act(async () => {
      button.props.onClick()
      await Promise.resolve()
    })
    mocks.sessionData = { access_token: "refreshed", token_type: "Bearer" }
    await act(async () => {
      renderer!.update(
        <QuestProvider>
          <div data-hook="ready" />
        </QuestProvider>,
      )
      await Promise.resolve()
    })
    expect(
      mocks.queryRaw.mock.calls.filter(([query]) => query === "SELECT 1"),
    ).toHaveLength(2)
    expect(button.props["aria-busy"]).toBe(true)
    expect(mocks.headers).toHaveBeenLastCalledWith({})
    await act(async () => {
      failRetry({ error: "QuestDB is not reachable [502]" })
      await Promise.resolve()
    })
    expect(button.props["aria-busy"]).toBe(false)
  })

  it("announces consecutive identical retry failures", async () => {
    const error = { error: "QuestDB is not reachable [502]" }
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject(error)
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    const alert = renderer!.root.findByProps({ role: "alert" })
    const button = renderer!.root.findByType("button")
    let reject!: (error: { error: string }) => void
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? new Promise((_, rejectQuery) => {
            reject = rejectQuery
          })
        : Promise.resolve({ type: "dml" }),
    )
    const status = renderer!.root.findByProps({ role: "status" })
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => {
        button.props.onClick()
        await Promise.resolve()
      })
      expect(status.findByType("span").children).toEqual(["Reconnecting…"])
      await act(async () => {
        reject(error)
        await Promise.resolve()
      })
      expect(renderer!.root.findByProps({ role: "alert" })).toBe(alert)
      expect(alert.findByType("span").children).toEqual([error.error])
      expect(renderer!.root.findByProps({ role: "status" })).toBe(status)
      expect(status.findByType("span").children).toEqual([
        "Connection failed. Retry connection.",
      ])
      expect(renderer!.root.findByType("button")).toBe(button)
      expect(button.props["aria-busy"]).toBe(false)
    }
  })

  it("does not persist session-ended errors into the authentication gate", async () => {
    mocks.queryRaw.mockRejectedValue({
      error: "Your session has ended",
      sessionEnded: true,
    })
    await mount()
    expect(renderer?.root.findAllByProps({ role: "alert" })).toHaveLength(0)
  })

  it("keeps QuestContext stable and skips SELECT 1 on token refresh", async () => {
    const values: Array<React.ContextType<typeof QuestContext>> = []
    const Consumer = () => {
      values.push(useContext(QuestContext))
      return null
    }
    mocks.sessionData = { access_token: "first", token_type: "Bearer" }
    const child = <Consumer />
    await mount(child)
    const value = values[values.length - 1]
    const count = mocks.queryRaw.mock.calls.filter(
      ([q]) => q === "SELECT 1",
    ).length
    mocks.sessionData = { access_token: "refreshed", token_type: "Bearer" }
    await act(async () => {
      renderer?.update(<QuestProvider>{child}</QuestProvider>)
      await Promise.resolve()
    })
    expect(values[values.length - 1]).toBe(value)
    expect(
      mocks.queryRaw.mock.calls.filter(([q]) => q === "SELECT 1"),
    ).toHaveLength(count)
    expect(mocks.headers).toHaveBeenLastCalledWith({})
  })
})
