import React from "react"
import { ThemeProvider } from "styled-components"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import { EventType } from "../../modules/EventBus/types"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"

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
      .mockRejectedValueOnce(renewalFailure)
      .mockResolvedValue(columnsLoaded)
    await mount()

    expect(panel().state.view).toBe(View.error)
    expect(panel().loadingError).toBe(renewalFailure)

    await connectionOk()

    expect(mocks.quest.query).toHaveBeenCalledTimes(3)
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
})
