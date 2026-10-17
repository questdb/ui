import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Schema, { View } from "."
import VirtualTables from "./VirtualTables"
import { QuestContext } from "../../providers"
import { Client } from "../../utils/questdb/client"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { tokenRefresh } from "../../utils/questdb/tokenRefresh"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { darkTheme } from "../../theme"

const mocks = vi.hoisted(() => ({
  autoRefreshTables: false,
  dispatch: vi.fn(),
}))
vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch }))
vi.mock("../../providers", async () => ({
  QuestContext: (await import("react")).createContext(null),
}))
vi.mock("../../components/icons", () => ({
  CheckboxCircle: "i",
  Close: "i",
  FileCopy: "i",
  Refresh: "i",
  AddChart: "i",
}))
vi.mock("../../components", () => ({
  Box: "div",
  Button: "button",
  PaneContent: "div",
  PaneWrapper: "div",
  PrimaryToggleButton: "button",
  Tooltip: ({ children }: React.PropsWithChildren<unknown>) => children,
}))
vi.mock("../../store", () => ({
  actions: {
    query: {
      setTables: () => ({ type: "tables" }),
      setColumns: () => ({ type: "columns" }),
    },
  },
}))
vi.mock("../../components/Panel", () => ({
  Panel: {
    Header: ({ afterTitle }: { afterTitle: React.ReactNode }) => afterTitle,
  },
}))
vi.mock("./Toolbar/toolbar", () => ({ Toolbar: "div" }))
vi.mock("./VirtualTables", () => ({ default: "virtual-tables" }))
vi.mock("../../providers/LocalStorageProvider", () => ({
  useLocalStorage: () => ({
    autoRefreshTables: mocks.autoRefreshTables,
    updateSettings: vi.fn(),
  }),
}))
vi.mock("./checkbox", () => ({ Checkbox: "input" }))
vi.mock("../../providers/EditorProvider", () => ({
  useEditor: () => ({ addBuffer: vi.fn() }),
}))
vi.mock("./SchemaContext", () => ({
  SchemaProvider: ({ children }: React.PropsWithChildren<unknown>) => children,
  useSchema: () => ({
    selectOpen: false,
    setSelectOpen: vi.fn(),
    selectedTables: [],
    setSelectedTables: vi.fn(),
  }),
}))
vi.mock("../../components/Toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

let renderer: ReactTestRenderer | undefined
const payload = () => ({
  access_token: "current",
  refresh_token: "refresh",
  token_type: "Bearer",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.stubGlobal("addEventListener", vi.fn())
  vi.stubGlobal("removeEventListener", vi.fn())
  authSessionState.setAuthPayload(payload())
})
afterEach(() => {
  act(() => renderer?.unmount())
  authSessionState.endSession()
  tokenRefresh.syncSession()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const tree = () => ({
  props: renderer!.root.findByType(VirtualTables).props as React.ComponentProps<
    typeof VirtualTables
  >,
})

const catalogResponse = (query: string) =>
  new Response(
    JSON.stringify(
      query.includes("tables()")
        ? {
            columns: [{ name: "table_name", type: "STRING" }],
            dataset: [["my_table"]],
            count: 1,
          }
        : { columns: [], dataset: [], count: 0 },
    ),
  )
const mountSchema = async (client: Client, withSideMenu = false) => {
  await act(async () => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <QuestContext.Provider
          value={{ quest: client } as React.ContextType<typeof QuestContext>}
        >
          <Schema open={!withSideMenu} />
          {withSideMenu && <Schema open />}
        </QuestContext.Provider>
      </ThemeProvider>,
    )
    await Promise.resolve()
  })
}

describe("Schema renewal recovery", () => {
  it("shows tables before slow details and columns have settled on first load", async () => {
    mocks.autoRefreshTables = false
    const pending: Array<() => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const query =
          new URL(url, "http://test").searchParams.get("query") ?? ""
        if (query.includes("tables()"))
          return Promise.resolve(catalogResponse(query))
        return new Promise<Response>((resolve) =>
          pending.push(() => resolve(catalogResponse(query))),
        )
      }),
    )
    await mountSchema(new Client())
    expect(pending).toHaveLength(2)
    expect(tree().props.state.view).toBe(View.ready)
    expect(tree().props.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table_name: "my_table" }),
      ]),
    )
    await act(async () => {
      pending.forEach((finish) => finish())
      await Promise.resolve()
    })
  })

  it("recovers a copied connection failure without relying on event/rejection object identity", async () => {
    mocks.autoRefreshTables = false
    const client = new Client()
    const tableRequests = vi
      .spyOn(client, "showTables")
      .mockImplementation(() =>
        Promise.reject({ error: "Offline", connectionError: true }),
      )
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          catalogResponse(
            new URL(url, "http://test").searchParams.get("query") ?? "",
          ),
        ),
      ),
    )
    await mountSchema(client)
    expect(tree().props.state.view).toBe(View.error)
    tableRequests.mockRestore()
    await act(async () => {
      await client.queryRaw("select 1")
    })
    expect(tree().props.state.view).toBe(View.ready)
    expect(tree().props.loadingError).toBeNull()
  })
  it("cleans up only its own schema listeners on unmount and remount", async () => {
    mocks.autoRefreshTables = true
    const client = new Client()
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        catalogResponse(
          new URL(url, "http://test").searchParams.get("query") ?? "",
        ),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const peer = vi.fn()
    eventBus.subscribe(EventType.MSG_QUERY_SCHEMA, peer)
    try {
      for (let i = 0; i < 3; i++) {
        await mountSchema(client)
        act(() => renderer!.unmount())
      }
      await mountSchema(client)
      const before = fetchMock.mock.calls.length
      await act(async () => {
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        await Promise.resolve()
      })
      expect(fetchMock).toHaveBeenCalledTimes(before + 3)
      expect(peer).toHaveBeenCalledOnce()
      act(() => renderer!.unmount())
      await act(async () => {
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
        await Promise.resolve()
      })
      expect(fetchMock).toHaveBeenCalledTimes(before + 3)
      expect(peer).toHaveBeenCalledTimes(2)
    } finally {
      eventBus.unsubscribe(EventType.MSG_QUERY_SCHEMA, peer)
    }
  })

  it("recovers both panels without retrying from a peer's delayed OK event", async () => {
    mocks.autoRefreshTables = false
    const client = new Client()
    let recovering = false
    const tableGates: Array<() => void> = []
    const detailGates: Array<() => void> = []
    const columnGates: Array<() => void> = []
    const fetchMock = vi.fn((url: string) => {
      const query = new URL(url, "http://test").searchParams.get("query") ?? ""
      if (recovering && query.includes("columns()")) {
        return new Promise<Response>((resolve) => {
          columnGates.push(() =>
            resolve(
              new Response(
                JSON.stringify({
                  error: "Columns unavailable",
                  position: -1,
                  query,
                }),
                { status: 400 },
              ),
            ),
          )
        })
      }
      if (recovering && query.includes("materialized_views()")) {
        return new Promise<Response>((resolve) => {
          detailGates.push(() => resolve(catalogResponse(query)))
        })
      }
      if (recovering && query.includes("tables()")) {
        return new Promise<Response>((resolve) => {
          tableGates.push(() => resolve(catalogResponse(query)))
        })
      }
      return Promise.resolve(catalogResponse(query))
    })
    vi.stubGlobal("fetch", fetchMock)
    await mountSchema(client, true)
    const before = fetchMock.mock.calls.length
    recovering = true
    await act(async () => {
      eventBus.publish(EventType.MSG_CONNECTION_ERROR, { error: "Offline" })
      await client.queryRaw("select 1")
    })
    expect(tableGates).toHaveLength(2)
    for (let index = 0; index < 2; index++) {
      await act(async () => {
        tableGates.shift()!()
        await Promise.resolve()
      })
    }
    expect(detailGates).toHaveLength(2)
    // Exhaust both compatibility attempts after the tables have succeeded,
    // rearming the errors while both materialized-view requests remain pending.
    while (columnGates.length) {
      await act(async () => {
        columnGates.shift()!()
        await Promise.resolve()
      })
    }
    for (let index = 0; index < 2; index++) {
      await act(async () => {
        detailGates.shift()!()
        await Promise.resolve()
      })
    }
    expect(tableGates).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(before + 9)
    for (const panel of renderer!.root.findAllByType(VirtualTables)) {
      const props = panel.props as React.ComponentProps<typeof VirtualTables>
      expect(props.state.view).toBe(View.error)
      expect(props.loadingError?.error).toBe("Columns unavailable")
    }

    // SQL-level catalog failures must not retry on unrelated polling OKs.
    recovering = false
    await act(async () => {
      await client.queryRaw("select 2")
    })
    expect(fetchMock).toHaveBeenCalledTimes(before + 10)
    await act(async () => {
      for (const button of renderer!.root
        .findAllByProps({ "data-hook": "schema-auto-refresh-button" })
        .filter((button) => button.type === "button"))
        button.props.onClick()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(before + 16)
    for (const panel of renderer!.root.findAllByType(VirtualTables)) {
      const props = panel.props as React.ComponentProps<typeof VirtualTables>
      expect(props.state.view).toBe(View.ready)
      expect(props.loadingError).toBeNull()
    }
  })

  it("does not retry from its own OK event when columns still fail", async () => {
    mocks.autoRefreshTables = false
    const client = new Client()
    let columnsFail = false
    let finishDetails!: () => void
    const fetchMock = vi.fn((url: string) => {
      const query = new URL(url, "http://test").searchParams.get("query") ?? ""
      if (columnsFail && query.includes("columns()")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: "Columns unavailable",
              position: -1,
              query,
            }),
            { status: 400 },
          ),
        )
      }
      if (columnsFail && query.includes("materialized_views()")) {
        return new Promise<Response>((resolve) => {
          finishDetails = () => resolve(catalogResponse(query))
        })
      }
      return Promise.resolve(catalogResponse(query))
    })
    vi.stubGlobal("fetch", fetchMock)
    await mountSchema(client)
    expect(tree().props.state.view).toBe(View.ready)
    columnsFail = true
    const before = fetchMock.mock.calls.length
    await act(async () => {
      eventBus.publish(EventType.MSG_CONNECTION_ERROR, { error: "Offline" })
      await client.queryRaw("select 1")
    })
    expect(tree().props.state.view).toBe(View.error)
    expect(tree().props.loadingError?.error).toBe("Columns unavailable")
    expect(fetchMock).toHaveBeenCalledTimes(before + 5)
    await act(async () => {
      finishDetails()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(before + 5)

    columnsFail = false
    await act(async () => {
      for (let i = 0; i < 5; i++) await client.queryRaw("select 1")
    })
    expect(tree().props.state.view).toBe(View.error)
    expect(fetchMock).toHaveBeenCalledTimes(before + 10)
    await act(async () => {
      renderer!.root
        .findByProps({ "data-hook": "schema-auto-refresh-button" })
        .props.onClick()
      await Promise.resolve()
    })
    expect(tree().props.state.view).toBe(View.ready)
    expect(tree().props.loadingError).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(before + 13)
  })

  it.each([false, true])(
    "explains local failure and recovers on SQL success (auto-refresh=%s)",
    async (autoRefresh) => {
      mocks.autoRefreshTables = autoRefresh
      const client = new Client()
      let unavailable = false
      client.refreshTokenMethod = () => {
        if (unavailable)
          return Promise.reject(
            new Error("Identity provider unavailable (HTTP 503)"),
          )
        const renewed = payload()
        authSessionState.setAuthPayload(renewed)
        return Promise.resolve(renewed)
      }
      const fetchMock = vi.fn((url: string) => {
        const query =
          new URL(url, "http://test").searchParams.get("query") ?? ""
        return Promise.resolve(catalogResponse(query))
      })
      vi.stubGlobal("fetch", fetchMock)
      vi.spyOn(console, "error").mockImplementation(() => {})
      await mountSchema(client)
      expect(tree().props.state.view).toBe(View.ready)

      vi.setSystemTime(Date.now() + 61_000)
      unavailable = true
      await act(async () => {
        renderer!.root
          .findByProps({ "data-hook": "schema-auto-refresh-button" })
          .props.onClick()
        await Promise.resolve()
      })
      expect(tree().props.state.view).toBe(View.error)
      expect(tree().props.loadingError).toMatchObject({ requestNotSent: true })
      expect(tree().props.loadingError?.error).toContain("renew")

      unavailable = false
      vi.setSystemTime(Date.now() + 5_000)
      const requestsBefore = fetchMock.mock.calls.length
      await act(async () => {
        await client.queryRaw("select 1")
      })
      expect(tree().props.state.view).toBe(View.ready)
      expect(tree().props.loadingError).toBeNull()
      // SELECT, tables, columns, and materialized views: recovery must not
      // recursively schedule more work from its own connection-OK events.
      expect(fetchMock).toHaveBeenCalledTimes(requestsBefore + 4)
    },
  )
})
