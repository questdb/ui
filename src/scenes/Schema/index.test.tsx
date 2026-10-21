import React from "react"
import { ThemeProvider } from "styled-components"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import { EventType } from "../../modules/EventBus/types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import {
  AuthRefreshUnavailableError,
  SESSION_ENDED_MESSAGE,
} from "../../modules/OAuth2/session"

type VirtualTablesProps = {
  tables: unknown[]
  state: { view: number }
  loadingError: unknown
}

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>()
  return {
    handlers,
    eventBus: {
      subscribe: (type: string, handler: (payload?: unknown) => void) => {
        const subscribed = handlers.get(type) ?? new Set()
        subscribed.add(handler)
        handlers.set(type, subscribed)
      },
      unsubscribe: (type: string, handler?: (payload?: unknown) => void) => {
        if (handler) handlers.get(type)?.delete(handler)
        else handlers.delete(type)
      },
      publish: (type: string, payload?: unknown) => {
        handlers.get(type)?.forEach((handler) => handler(payload))
      },
    },
    quest: {
      showTables: vi.fn(),
      query: vi.fn(),
      showMaterializedViews: vi.fn(),
      showViews: vi.fn(),
      showLiveViews: vi.fn(),
    },
    virtualTables: vi.fn<[VirtualTablesProps], void>(),
    dispatch: vi.fn(),
  }
})

vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch }))
vi.mock("../../modules/EventBus", () => ({ eventBus: mocks.eventBus }))
vi.mock("../../providers", async () => {
  const { createContext } =
    await vi.importActual<typeof import("react")>("react")
  return { QuestContext: createContext({ quest: mocks.quest }) }
})
vi.mock("../../components", () => ({
  Box: "div",
  Button: "button",
  PaneContent: "div",
  PaneWrapper: "div",
  PrimaryToggleButton: "button",
  Tooltip: ({ children }: React.PropsWithChildren<unknown>) => <>{children}</>,
}))
vi.mock("../../components/icons", () => ({
  AddChart: () => null,
  CheckboxCircle: () => null,
  Close: () => null,
  FileCopy: () => null,
  Refresh: () => null,
}))
vi.mock("../../components/Panel", () => ({ Panel: { Header: () => null } }))
vi.mock("../../components/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("../../store", () => ({
  actions: {
    query: {
      setTables: (tables: unknown) => ({ type: "setTables", tables }),
      setColumns: (columns: unknown) => ({ type: "setColumns", columns }),
    },
  },
}))
vi.mock("../../utils", () => ({ copyToClipboard: vi.fn() }))
vi.mock("../../utils/questdb", () => ({ Type: { DQL: "dql" } }))
vi.mock("../../providers/LocalStorageProvider", () => ({
  // Auto-refresh also listens to window focus; recovery doesn't depend on it.
  useLocalStorage: () => ({
    autoRefreshTables: false,
    updateSettings: vi.fn(),
  }),
}))
vi.mock("../../providers/EditorProvider", () => ({
  useEditor: () => ({ addBuffer: vi.fn() }),
}))
vi.mock("../../scenes/Editor/Metrics/utils", () => ({
  metricDurations: [],
  MetricViewMode: {},
  RefreshRate: {},
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../modules/ConsoleEventTracker/events", () => ({
  ConsoleEvent: {},
}))
vi.mock("./Toolbar/toolbar", () => ({ Toolbar: () => null }))
vi.mock("./checkbox", () => ({ Checkbox: () => null }))
vi.mock("./SchemaContext", () => ({
  SchemaProvider: ({ children }: React.PropsWithChildren<unknown>) => (
    <>{children}</>
  ),
  useSchema: () => ({
    selectOpen: false,
    setSelectOpen: vi.fn(),
    selectedTables: [],
    setSelectedTables: vi.fn(),
  }),
}))
vi.mock("./VirtualTables", () => ({
  default: (props: VirtualTablesProps) => {
    mocks.virtualTables(props)
    return null
  },
}))

import Schema, { View } from "."

const table = { table_name: "trades", table_type: "T" }
const tablesLoaded = { type: "dql", data: [table] }
const columnsLoaded = { type: "dql", data: [] }
// The client's rejection when renewal failed and the token has expired.
const renewalFailure = {
  position: -1,
  query: "tables();",
  type: "error",
  error: new AuthRefreshUnavailableError().message,
  authRefreshUnavailable: true,
  requestNotSent: true,
}

let renderer: ReactTestRenderer | undefined
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
const mount = async () => {
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <Schema open />
      </ThemeProvider>,
    )
  })
  await settle()
}
const panel = () => mocks.virtualTables.mock.lastCall![0]
const connectionOk = async () => {
  act(() => mocks.eventBus.publish(EventType.MSG_CONNECTION_OK))
  await settle()
}

beforeEach(() => {
  mocks.handlers.clear()
  mocks.quest.showMaterializedViews.mockResolvedValue({ type: "dql", data: [] })
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.resetAllMocks()
})

describe("Schema loading after a failed SSO renewal", () => {
  it("explains a failed table load and reloads it once a request succeeds", async () => {
    mocks.quest.showTables
      .mockRejectedValueOnce(renewalFailure)
      .mockResolvedValue(tablesLoaded)
    mocks.quest.query
      .mockRejectedValueOnce(renewalFailure)
      .mockResolvedValue(columnsLoaded)
    await mount()

    expect(panel().state.view).toBe(View.error)
    // Not a blank panel: the renewal failure is shown.
    expect(panel().loadingError).toBe(renewalFailure)

    await connectionOk()

    expect(mocks.quest.showTables).toHaveBeenCalledTimes(2)
    expect(panel().state.view).toBe(View.ready)
    expect(panel().tables).toEqual([table])
  })

  it("reloads after a renewal failure reported only by the columns load", async () => {
    mocks.quest.showTables.mockResolvedValue(tablesLoaded)
    mocks.quest.query
      .mockRejectedValueOnce(renewalFailure)
      .mockResolvedValue(columnsLoaded)
    await mount()

    expect(panel().state.view).toBe(View.error)
    expect(panel().loadingError).toBe(renewalFailure)
    // The server ran no query, so the fallback for older servers is not tried
    expect(mocks.quest.query).toHaveBeenCalledOnce()
    expect(mocks.quest.query).toHaveBeenCalledWith(
      "information_schema.questdb_columns()",
      { background: true },
    )

    await connectionOk()

    expect(mocks.quest.query).toHaveBeenCalledTimes(2)
    expect(panel().state.view).toBe(View.ready)
  })

  it("does not reload after a server error, whose response also reports the connection as OK", async () => {
    const serverError = {
      position: 0,
      query: "tables();",
      type: "error",
      error: "unknown function name: tables()",
    }
    mocks.quest.showTables.mockRejectedValue(serverError)
    mocks.quest.query.mockRejectedValue(serverError)
    await mount()

    expect(panel().state.view).toBe(View.error)
    expect(panel().loadingError).toBeNull()

    await connectionOk()

    expect(mocks.quest.showTables).toHaveBeenCalledOnce()
  })

  it("does not show a recovered renewal failure for a later, unrelated error", async () => {
    const serverError = {
      position: 0,
      query: "information_schema.questdb_columns()",
      type: "error",
      error: "permission denied",
    }
    mocks.quest.showTables
      .mockRejectedValueOnce(renewalFailure)
      .mockResolvedValue(tablesLoaded)
    mocks.quest.query
      .mockResolvedValueOnce(columnsLoaded)
      .mockRejectedValue(serverError)
    await mount()
    expect(panel().loadingError).toBe(renewalFailure)

    // The reload's tables load, but its columns fail for another reason
    await connectionOk()

    expect(mocks.quest.showTables).toHaveBeenCalledTimes(2)
    expect(panel().state.view).toBe(View.error)
    // Not the stale "Could not renew your SSO session" message
    expect(panel().loadingError).toBeNull()
  })
})

describe("Schema loading when the session ends", () => {
  // A request that ending the session aborted rejects with this.
  const sessionEnded = (query: string) => ({
    position: -1,
    query,
    type: "error",
    error: SESSION_ENDED_MESSAGE,
    sessionEnded: true,
  })
  const pending = () => {
    let resolve!: (value: unknown) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise((settle, fail) => {
      resolve = settle
      reject = fail
    })
    return { promise, resolve, reject }
  }

  beforeEach(() => authSessionState.markNonSSOAuthenticated())
  afterEach(() => authSessionState.endSession())

  it("sends no fallback query and shows no error when ending the session interrupts loading", async () => {
    // Given a schema load in flight
    const tables = pending()
    const columns = pending()
    mocks.quest.showTables.mockReturnValue(tables.promise)
    mocks.quest.query.mockReturnValue(columns.promise)
    await mount()

    // When logout ends the session, which aborts both requests
    authSessionState.endSession()
    tables.reject(sessionEnded("tables();"))
    columns.reject(sessionEnded("information_schema.questdb_columns()"))
    await settle()

    // Then nothing is sent without the login's credentials, and the panel
    // reports no failure
    expect(mocks.quest.query).toHaveBeenCalledOnce()
    expect(mocks.quest.showTables).toHaveBeenCalledOnce()
    expect(panel().state.view).toBe(View.loading)
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it("does not store the catalog of a login whose session has ended", async () => {
    // Given a schema load in flight
    const tables = pending()
    const columns = pending()
    mocks.quest.showTables.mockReturnValue(tables.promise)
    mocks.quest.query.mockReturnValue(columns.promise)
    await mount()

    // When the session ends before its answers are handled
    authSessionState.endSession()
    tables.resolve(tablesLoaded)
    columns.resolve(columnsLoaded)
    await settle()

    // Then the next login does not get them
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.quest.showMaterializedViews).not.toHaveBeenCalled()
    expect(panel().tables).toEqual([])
  })
})
