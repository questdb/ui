import "../../test/stubBrowserGlobals"
import React, { useContext } from "react"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StoreKey } from "../../utils/localStorage/types"
import type { AuthPayload } from "../../modules/OAuth2/types"
import type { Settings } from "../SettingsProvider/types"

const mocks = vi.hoisted(() => ({
  sessionData: undefined as AuthPayload | undefined,
  refresh: vi.fn(),
  queryRaw: vi.fn(),
  headers: vi.fn<[Record<string, string>], void>(),
  dispatch: vi.fn(),
  settings: {
    "acl.enabled": true,
    "acl.basic.auth.realm.enabled": false,
  } as Settings,
}))
vi.mock("../AuthProvider", () => ({
  useAuth: () => ({
    sessionData: mocks.sessionData,
    refreshAuthToken: mocks.refresh,
  }),
}))
vi.mock("../SettingsProvider", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}))
vi.mock("../../utils/questdb/queryClient", () => ({
  questClient: {
    queryRaw: mocks.queryRaw,
    setCommonHeaders: mocks.headers,
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
vi.mock("../../components", () => ({ Text: "span", Button: "button" }))
vi.mock("../../components/Box", () => ({
  Box: ({ children }: React.PropsWithChildren<unknown>) => (
    <div>{children}</div>
  ),
}))

import { QuestContext, QuestProvider } from "."

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  mocks.sessionData = undefined
  mocks.settings = {
    "acl.enabled": true,
    "acl.basic.auth.realm.enabled": false,
  }
  mocks.queryRaw.mockReset().mockResolvedValue({ type: "dml" })
  mocks.headers.mockClear()
  localStorage.clear()
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.clearAllMocks()
})
const mount = async (children = <div data-hook="ready" />) => {
  await act(async () => {
    renderer = create(<QuestProvider>{children}</QuestProvider>)
    await Promise.resolve()
  })
}

describe("QuestProvider authentication gate", () => {
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
          ([headers]) => headers.Authorization === "Bearer sso",
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
    mocks.queryRaw.mockResolvedValue({ type: "dml" })
    await act(async () => {
      renderer?.root.findByType("button").props.onClick()
      await Promise.resolve()
    })
    expect(
      renderer?.root.findAllByProps({ "data-hook": "ready" }),
    ).toHaveLength(1)
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
    expect(mocks.headers).toHaveBeenLastCalledWith({
      Authorization: "Bearer refreshed",
    })
  })
})
