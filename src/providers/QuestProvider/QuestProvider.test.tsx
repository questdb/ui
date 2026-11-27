// @vitest-environment jsdom
import "../../test/stubBrowserGlobals"
import React, { act, useContext } from "react"
import {
  cleanup,
  fireEvent,
  render,
  RenderResult,
  screen,
} from "@testing-library/react"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../theme"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"
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
  signInAgain: vi.fn(),
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
vi.mock("../../components", async () => {
  const { domStandIn } = await import("../../test/domStandIn")
  return {
    Text: "span",
    Button: domStandIn("button", ["prefixIcon"]),
    CenteredLayout: domStandIn("section", ["preloadedImages"]),
    Box: domStandIn("div", ["flexDirection"]),
  }
})
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

let view: RenderResult | undefined
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
  cleanup()
  view = undefined
  vi.clearAllMocks()
  vi.useRealTimers()
})
const mount = async (children = <div data-hook="ready" />) => {
  await act(async () => {
    view = render(<QuestProvider>{children}</QuestProvider>)
    await Promise.resolve()
  })
}
const readyCount = () => document.querySelectorAll('[data-hook="ready"]').length
const textOf = (container: HTMLElement) => {
  const spans = container.querySelectorAll("span")
  expect(spans).toHaveLength(1)
  return spans[0].textContent
}
const statusText = () => textOf(screen.getByRole("status"))
const alertText = () => textOf(screen.getByRole("alert"))

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
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Could not renew your SSO session",
      )
      const signIn = screen.getByRole("button", { name: "Sign in again" })
      fireEvent.click(signIn)
      expect(mocks.signInAgain).toHaveBeenCalledOnce()
      expect(statusText()).toBe(
        "Renewal failed. Retry connection, or sign in again.",
      )
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
    const retry = screen.getByRole("button", { name: "Retry connection" })
    await act(async () => {
      fireEvent.click(retry)
      await Promise.resolve()
    })

    // Then it shows that it is reconnecting, and checks only once renewed
    expect(mocks.prepareRenewalRetry).toHaveBeenCalledOnce()
    expect(checks()).toBe(failedChecks)
    expect(retry.getAttribute("aria-busy")).toBe("true")
    expect(statusText()).toBe("Reconnecting…")
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      renewed()
      await Promise.resolve()
    })
    expect(checks()).toBe(failedChecks + 1)
    expect(readyCount()).toBe(1)
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
    expect(screen.queryAllByRole("status")).toHaveLength(0)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(statusText()).toBe("Checking your session…")
    await act(async () => {
      finish({ type: "dml" })
      await Promise.resolve()
    })
    expect(screen.queryAllByRole("status")).toHaveLength(0)
    expect(screen.getByRole("main").hasAttribute("tabindex")).toBe(false)
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
    view!.unmount()
    expect(mocks.headers).toHaveBeenLastCalledWith({})
    expect(questClient.refreshTokenMethod).toBeUndefined()
  })

  it("focuses recovery and then the console after a successful Retry", async () => {
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "Offline" })
        : Promise.resolve({ type: "dml" }),
    )
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    await mount()
    expect(focus).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    )
    focus.mockClear()
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      fireEvent.click(screen.getByRole("button"))
      await Promise.resolve()
    })
    const main = screen.getByRole("main")
    expect(focus).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(main)
    expect(main.getAttribute("tabindex")).toBe("-1")
    act(() => main.blur())
    expect(main.hasAttribute("tabindex")).toBe(false)
    focus.mockRestore()
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
          expect(readyCount()).toBe(0)
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

          expect(readyCount()).toBe(1)
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
          view!.rerender(
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
        view!.unmount()
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
      fireEvent.click(screen.getByRole("button"))
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
    expect(alertText()).toBe("QuestDB is not reachable [502]")
    expect(
      screen.getByRole("alert").querySelector("span")!.getAttribute("color"),
    ).toBe("statusDanger")
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      fireEvent.click(screen.getByRole("button"))
      await Promise.resolve()
    })
    expect(readyCount()).toBe(1)
  })

  it("keeps the recovery panel and retry button mounted while retrying", async () => {
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject({ error: "QuestDB is not reachable [502]" })
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    const button = screen.getByRole("button")
    let failRetry!: (error: { error: string }) => void
    const retry = new Promise((_, reject) => {
      failRetry = reject
    })
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1" ? retry : Promise.resolve({ type: "dml" }),
    )
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })

    expect(screen.getByRole("button")).toBe(button)
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("alert")).toBeDefined()
    expect(statusText()).toBe("Reconnecting…")
    const attempts = mocks.queryRaw.mock.calls.length
    fireEvent.click(button)
    expect(mocks.queryRaw).toHaveBeenCalledTimes(attempts)
    expect(readyCount()).toBe(0)

    await act(async () => {
      failRetry({ error: "Still unavailable" })
      await Promise.resolve()
    })
    expect(screen.getByRole("button")).toBe(button)
    expect(button.getAttribute("aria-disabled")).toBe("false")
    expect(button.getAttribute("aria-busy")).toBe("false")
    expect(alertText()).toBe("Still unavailable")

    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(readyCount()).toBe(1)
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
    const button = screen.getByRole("button")
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    mocks.sessionData = { access_token: "refreshed", token_type: "Bearer" }
    await act(async () => {
      view!.rerender(
        <QuestProvider>
          <div data-hook="ready" />
        </QuestProvider>,
      )
      await Promise.resolve()
    })
    expect(
      mocks.queryRaw.mock.calls.filter(([query]) => query === "SELECT 1"),
    ).toHaveLength(2)
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(mocks.headers).toHaveBeenLastCalledWith({})
    await act(async () => {
      failRetry({ error: "QuestDB is not reachable [502]" })
      await Promise.resolve()
    })
    expect(screen.getByRole("button")).toBe(button)
    expect(button.getAttribute("aria-busy")).toBe("false")
  })

  it("announces consecutive identical retry failures", async () => {
    const error = { error: "QuestDB is not reachable [502]" }
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? Promise.reject(error)
        : Promise.resolve({ type: "dml" }),
    )
    await mount()
    const alert = screen.getByRole("alert")
    const button = screen.getByRole("button")
    let reject!: (error: { error: string }) => void
    mocks.queryRaw.mockImplementation((query: string) =>
      query === "SELECT 1"
        ? new Promise((_, rejectQuery) => {
            reject = rejectQuery
          })
        : Promise.resolve({ type: "dml" }),
    )
    const status = screen.getByRole("status")
    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => {
        fireEvent.click(button)
        await Promise.resolve()
      })
      expect(textOf(status)).toBe("Reconnecting…")
      await act(async () => {
        reject(error)
        await Promise.resolve()
      })
      expect(screen.getByRole("alert")).toBe(alert)
      expect(textOf(alert)).toBe(error.error)
      expect(screen.getByRole("status")).toBe(status)
      expect(textOf(status)).toBe("Connection failed. Retry connection.")
      expect(screen.getByRole("button")).toBe(button)
      expect(button.getAttribute("aria-busy")).toBe("false")
    }
  })

  it("does not persist session-ended errors into the authentication gate", async () => {
    mocks.queryRaw.mockRejectedValue({
      error: "Your session has ended",
      sessionEnded: true,
    })
    await mount()
    expect(screen.queryAllByRole("alert")).toHaveLength(0)
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
      view!.rerender(<QuestProvider>{child}</QuestProvider>)
      await Promise.resolve()
    })
    expect(values[values.length - 1]).toBe(value)
    expect(
      mocks.queryRaw.mock.calls.filter(([q]) => q === "SELECT 1"),
    ).toHaveLength(count)
    expect(mocks.headers).toHaveBeenLastCalledWith({})
  })
})
