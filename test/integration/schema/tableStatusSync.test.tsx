// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import React from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../src/theme"
import { TooltipProvider } from "../../../src/components/Tooltip"
import { LocalStorageProvider } from "../../../src/providers/LocalStorageProvider"
import { AIConversationProvider } from "../../../src/providers/AIConversationProvider"
import { AIStatusProvider } from "../../../src/providers/AIStatusProvider"
import { SettingsProvider } from "../../../src/providers/SettingsProvider"
import { installNativeAbortSignals } from "../../../src/test/nativeAbortSignals"
import { questClient } from "../../../src/utils/questdb/queryClient"
import rootReducer from "../../../src/store/reducers"
import { db } from "../../../src/store/db"
import { eventBus } from "../../../src/modules/EventBus"
import { EventType } from "../../../src/modules/EventBus/types"
import Schema from "../../../src/scenes/Schema"
import { TableDetailsDrawer } from "../../../src/scenes/Schema/TableDetailsDrawer"
import {
  matView,
  raw,
  table,
} from "../../../src/scenes/Schema/TableDetailsDrawer/test/catalogFixtures"

// The schema tree and the table details drawer read the same catalog on their
// own schedules. These tests mount both, so a status one of them reads must
// reach the other without either losing a newer read or the open dialog.

vi.mock("react-virtuoso", async () => {
  const React = await import("react")
  // Render every row: scrolling and viewport behavior stay in E2E
  return {
    Virtuoso: React.forwardRef(
      (
        {
          totalCount,
          itemContent,
        }: {
          totalCount: number
          itemContent: (index: number) => React.ReactNode
        },
        ref,
      ) => {
        React.useImperativeHandle(ref, () => ({
          scrollIntoView: ({ done }: { done?: () => void }) => done?.(),
        }))
        return (
          <div>
            {Array.from({ length: totalCount }, (_, index) => (
              <React.Fragment key={index}>{itemContent(index)}</React.Fragment>
            ))}
          </div>
        )
      },
    ),
  }
})
vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  stop: vi.fn(),
  trackEvent: vi.fn(),
}))
const storage = vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
  vi.stubGlobal("sessionStorage", jsdom.window.sessionStorage)
  return {
    local: jsdom.window.localStorage,
    session: jsdom.window.sessionStorage,
  }
})

type Reply = Response | Promise<Response>
type Row = Record<string, unknown>

const MATVIEW = "btc_trades_mv"

const catalogServer = () => {
  const server = {
    tables: [
      table("btc_trades"),
      table("ecommerce_stats"),
      table(MATVIEW, "matview"),
    ] as Row[],
    matViews: [
      { ...matView(), view_name: MATVIEW, base_table_name: "btc_trades" },
    ] as Row[],
    queries: [] as string[],
    reply: (_query: string): Reply | undefined => undefined,
    setSuspended: (name: string, suspended: boolean) => {
      server.tables.find((row) => row.table_name === name)!.table_suspended =
        suspended
    },
  }
  const isSuspended = (name: string) =>
    server.tables.find((row) => row.table_name === name)?.table_suspended ===
    true
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost/",
      )
      if (url.pathname === "/settings")
        return Response.json({
          config: { "release.type": "OSS" },
          preferences: {},
          "preferences.version": 1,
        })
      if (url.pathname === "/warnings") return Response.json([])
      if (url.pathname === "/assets/console-configuration.json")
        return Response.json({})
      if (url.pathname.startsWith("/assets/")) return new Response("")
      if (url.pathname !== "/exec")
        throw new Error(`Unexpected request: ${url}`)
      const query = url.searchParams.get("query") ?? ""
      server.queries.push(query)
      const held = server.reply(query)
      if (held) return held
      const name = query.match(
        /(?:table_name|view_name|name)\s*=\s*'([^']+)'/i,
      )?.[1]
      if (query.startsWith("tables()"))
        return Response.json(
          raw(
            server.tables.filter((row) => !name || row.table_name === name),
            table(),
          ),
        )
      if (query.startsWith("materialized_views()"))
        return Response.json(
          raw(
            server.matViews.filter((row) => !name || row.view_name === name),
            matView(),
          ),
        )
      if (query.startsWith("information_schema."))
        return Response.json(
          raw(
            server.tables.map((row) => ({
              table_name: row.table_name,
              ordinal_position: 1,
              column_name: "timestamp",
              data_type: "TIMESTAMP",
            })),
          ),
        )
      if (query.startsWith("wal_tables()"))
        return Response.json(
          raw([
            {
              name,
              suspended: isSuspended(name!),
              writerTxn: "1",
              sequencerTxn: "2",
              writerLagTxnCount: "1",
              errorTag: "OUT OF MEMORY",
              errorMessage: "Out of memory",
            },
          ]),
        )
      const resumed = query.match(/^ALTER TABLE '([^']+)' RESUME WAL$/)?.[1]
      if (resumed) {
        server.setSuspended(resumed, false)
        return Response.json({ ddl: "OK" })
      }
      if (query.startsWith("SHOW COLUMNS"))
        return Response.json(
          raw([
            {
              column: "timestamp",
              type: "TIMESTAMP",
              indexed: false,
              designated: true,
            },
          ]),
        )
      if (query.startsWith("SHOW CREATE"))
        return Response.json(
          raw([{ ddl: `CREATE TABLE '${name}' (timestamp TIMESTAMP);` }]),
        )
      if (query.startsWith("(show parameters)"))
        return Response.json(
          raw([{ property_path: "cairo.sql.copy.root", value: "" }]),
        )
      throw new Error(`Unexpected SQL: ${query}`)
    }),
  )
  return server
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const get = (hook: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-hook="${hook}"]`)
  if (!element) throw new Error(`Missing ${hook}`)
  return element
}
const query = (hook: string) =>
  document.querySelector<HTMLElement>(`[data-hook="${hook}"]`)
const titles = (hook: string) =>
  Array.from(document.querySelectorAll(`[data-hook="${hook}"]`)).map(
    (element) => element.textContent,
  )
const tableTitle = (name: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-kind="table"][data-id$=":${name}"] [data-hook="schema-table-title"]`,
  )
  if (!element) throw new Error(`Missing table ${name}`)
  return element
}
const matViewRow = () =>
  get("schema-matview-title").closest<HTMLElement>('[data-hook="schema-row"]')!

// Responses resolve over several microtask rounds, which a zero-length
// advance does not always drain
const settle = async () => {
  for (let round = 0; round < 5; round++) await advance(100)
}
const expandMatViews = async () => {
  const folder = Array.from(
    document.querySelectorAll<HTMLElement>('[data-hook="schema-folder-title"]'),
  ).find((element) => element.textContent?.startsWith("Materialized views"))!
  await act(async () => {
    fireEvent.doubleClick(folder)
    await Promise.resolve()
  })
  await advance(0)
}
const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
  await advance(0)
}
const contextMenuAction = async (title: HTMLElement, action: string) => {
  await act(async () => {
    fireEvent.contextMenu(title)
    await Promise.resolve()
  })
  await click(get(`table-context-menu-${action}`))
}
const refreshSchema = async () => {
  await act(async () => {
    eventBus.publish(EventType.MSG_QUERY_SCHEMA)
    await Promise.resolve()
  })
  await advance(0)
}
// The drawer reads the table with an adaptive poll that backs off to 5 s
const awaitDrawerTableRead = () => advance(5000)
const schemaTableReads = (server: ReturnType<typeof catalogServer>) =>
  server.queries.filter((sql) => sql === "tables();").length

const mount = async () => {
  await Promise.all([
    db.ai_conversations.clear(),
    db.ai_conversation_messages.clear(),
  ])
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider delayDuration={0}>
        <Provider store={createStore(rootReducer)}>
          <SettingsProvider>
            <LocalStorageProvider>
              <AIConversationProvider>
                <AIStatusProvider>
                  <Schema open />
                  <TableDetailsDrawer />
                </AIStatusProvider>
              </AIConversationProvider>
            </LocalStorageProvider>
          </SettingsProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  await settle()
  expect(get("schema-folder-title")).toBeInTheDocument()
}

beforeEach(() => {
  installNativeAbortSignals()
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  localStorage.clear()
  sessionStorage.clear()
  questClient.resetCredentials()
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
    ],
  })
  vi.stubGlobal("isSecureContext", true)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const event of [
    EventType.MSG_CONNECTION_ERROR,
    EventType.MSG_CONNECTION_OK,
    EventType.MSG_QUERY_SCHEMA,
  ])
    eventBus.unsubscribe(event)
})

describe("schema tree and table details drawer status sync", () => {
  it("shows the materialized view status read by the drawer in the tree", async () => {
    // Given: only the drawer's own read reports the view as invalid
    const server = catalogServer()
    server.reply = (sql) =>
      sql.startsWith("materialized_views() WHERE view_name")
        ? Response.json(
            raw([
              {
                ...server.matViews[0],
                view_status: "invalid",
                invalidation_reason: "Base table structure changed",
              },
            ]),
          )
        : undefined
    await mount()
    await expandMatViews()
    expect(
      matViewRow().querySelector('[data-hook="schema-row-error-icon"]'),
    ).not.toBeInTheDocument()
    const schemaReads = schemaTableReads(server)
    // When
    await contextMenuAction(get("schema-matview-title"), "view-details")
    // Then: the tree follows the drawer without reloading the schema
    expect(get("table-details-view-status")).toHaveTextContent("Invalid")
    expect(
      matViewRow().querySelector('[data-hook="schema-row-error-icon"]'),
    ).toBeInTheDocument()
    expect(schemaTableReads(server)).toBe(schemaReads)
  })

  it("does not overwrite a newer schema refresh with an older drawer read", async () => {
    // Given: the drawer shows the view, and its next table read does not land
    const server = catalogServer()
    await mount()
    await expandMatViews()
    await contextMenuAction(get("schema-matview-title"), "view-details")
    expect(get("table-details-view-status")).toHaveTextContent("Valid")
    expect(query("schema-filter-suspended-button")).not.toBeInTheDocument()
    server.reply = (sql) =>
      sql.startsWith(`tables() where table_name = '${MATVIEW}'`)
        ? new Promise<Response>(() => {})
        : undefined
    // When: the view is suspended and the tree reads it
    server.setSuspended(MATVIEW, true)
    await refreshSchema()
    expect(get("schema-filter-suspended-button")).toHaveTextContent("1")
    const viewPolls = () =>
      server.queries.filter((sql) =>
        sql.startsWith("materialized_views() WHERE view_name"),
      ).length
    const polls = viewPolls()
    await advance(2000)
    // Then: the drawer's view polls do not bring back its older table read
    expect(viewPolls()).toBeGreaterThanOrEqual(polls + 2)
    expect(get("schema-filter-suspended-button")).toHaveTextContent("1")
  })

  it("keeps the tree's suspension dialog open while the drawer reports the resumed table", async () => {
    // Given: the drawer shows a suspended table, and the tree's dialog is open
    const server = catalogServer()
    server.setSuspended("ecommerce_stats", true)
    await mount()
    await contextMenuAction(tableTitle("ecommerce_stats"), "view-details")
    expect(get("table-details-name")).toHaveValue("ecommerce_stats")
    await contextMenuAction(tableTitle("ecommerce_stats"), "resume-wal")
    expect(get("schema-suspension-dialog")).toHaveAttribute(
      "data-table-name",
      "ecommerce_stats",
    )
    const schemaReads = schemaTableReads(server)
    // When
    await click(get("schema-suspension-dialog-restart-transaction"))
    await awaitDrawerTableRead()
    // Then: the drawer's fresh status reaches the tree...
    expect(schemaTableReads(server)).toBe(schemaReads)
    expect(query("schema-filter-suspended-button")).not.toBeInTheDocument()
    // ...and the dialog stays open until the user closes it
    expect(get("schema-suspension-dialog")).toHaveTextContent(
      "WAL resumed successfully!",
    )
    await click(get("schema-suspension-dialog-dismiss"))
    expect(query("schema-suspension-dialog")).not.toBeInTheDocument()
    // When: the table is suspended again
    server.setSuspended("ecommerce_stats", true)
    await refreshSchema()
    // Then: the closed dialog does not reopen
    expect(get("schema-filter-suspended-button")).toHaveTextContent("1")
    expect(query("schema-suspension-dialog")).not.toBeInTheDocument()
  })

  it("keeps the dialog open and following the latest status when the suspended filter hides the table", async () => {
    // Given: two suspended tables, shown through the suspended filter, and
    // the drawer open on the one to resume
    const server = catalogServer()
    server.setSuspended("btc_trades", true)
    server.setSuspended("ecommerce_stats", true)
    await mount()
    expect(get("schema-filter-suspended-button")).toHaveTextContent("2")
    await click(get("schema-filter-suspended-button"))
    expect(titles("schema-table-title")).toEqual([
      "btc_trades",
      "ecommerce_stats",
    ])
    await contextMenuAction(tableTitle("ecommerce_stats"), "view-details")
    await contextMenuAction(tableTitle("ecommerce_stats"), "resume-wal")
    // When
    await click(get("schema-suspension-dialog-restart-transaction"))
    await awaitDrawerTableRead()
    // Then: the resumed table leaves the filtered tree, the dialog stays
    expect(get("schema-filter-suspended-button")).toHaveTextContent("1")
    expect(titles("schema-table-title")).toEqual(["btc_trades"])
    expect(get("schema-suspension-dialog")).toHaveAttribute(
      "data-suspended",
      "false",
    )
    expect(get("schema-suspension-dialog")).toHaveTextContent(
      "WAL resumed successfully!",
    )
    // When: the table is suspended again while the dialog is open
    server.setSuspended("ecommerce_stats", true)
    await advance(1000)
    // Then: the dialog follows the latest status
    expect(get("schema-suspension-dialog")).toHaveAttribute(
      "data-suspended",
      "true",
    )
    expect(get("schema-suspension-dialog")).not.toHaveTextContent(
      "WAL resumed successfully!",
    )
    await click(get("schema-suspension-dialog-dismiss"))
    expect(query("schema-suspension-dialog")).not.toBeInTheDocument()
    // When: every table is shown again
    await click(get("schema-filter-suspended-button"))
    // Then: the closed dialog does not reopen
    expect(tableTitle("ecommerce_stats")).toBeInTheDocument()
    expect(query("schema-suspension-dialog")).not.toBeInTheDocument()
  })
})
