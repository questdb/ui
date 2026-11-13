import "fake-indexeddb/auto"
import React from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { LocalStorageProvider } from "../../../providers/LocalStorageProvider"
import { AIConversationProvider } from "../../../providers/AIConversationProvider"
import { AIStatusProvider } from "../../../providers/AIStatusProvider"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, afterEach, vi } from "vitest"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../theme"
import { TooltipProvider } from "../../../components/Tooltip"
import { installNativeAbortSignals } from "../../../test/nativeAbortSignals"
import { questClient } from "../../../utils/questdb/queryClient"
import rootReducer from "../../../store/reducers"
import { db } from "../../../store/db"
import { stop } from "../../../modules/ConsoleEventTracker"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import Schema from ".."
import {
  raw,
  table,
  liveView,
  matView,
} from "../TableDetailsDrawer/test/catalogFixtures"

export const writeClipboard = vi.fn<[string], Promise<void>>()

export const names = [
  "btc_trades",
  "chicago_weather_stations",
  "ecommerce_stats",
  "gitlog",
]
export const get = (hook: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-hook="${hook}"]`)
  if (!element) throw new Error(`Missing ${hook}`)
  return element
}
export const all = (hook: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-hook="${hook}"]`))
export const query = (hook: string) =>
  document.querySelector<HTMLElement>(`[data-hook="${hook}"]`)
export const tableTitle = (name: string) => {
  const element = document.querySelector<HTMLElement>(
    `[data-kind="table"][data-id$=":${name}"] [data-hook="schema-table-title"]`,
  )
  if (!element) throw new Error(`Missing table ${name}`)
  return element
}
export const hover = async (element: HTMLElement) => {
  fireEvent.pointerMove(element, { pointerType: "mouse" })
  await waitFor(() => get("tooltip"))
}

vi.mock("react-virtuoso", async () => {
  const React = await import("react")
  // Render every row for state tests. Scrolling and viewport behavior stay in E2E.
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
vi.mock("../../../modules/ConsoleEventTracker", () => ({
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
const reply = (body: unknown) => Promise.resolve(Response.json(body))

export const schemaServer = () => {
  const server = {
    tables: [
      ...names.map((name) => table(name)),
      table("btc_trades_mv", "matview"),
      table("btc_trades_view", "view"),
      table("btc_trades_lv", "liveview"),
    ] as Record<string, unknown>[],
    columns: [] as Record<string, unknown>[],
    matviews: [
      {
        ...matView(),
        view_name: "btc_trades_mv",
        base_table_name: "btc_trades",
      },
    ] as Record<string, unknown>[],
    liveviews: [
      {
        ...liveView(),
        view_name: "btc_trades_lv",
        base_table_name: "btc_trades",
      },
    ] as Record<string, unknown>[],
    queries: [] as string[],
    resumed: false,
  }
  server.columns = server.tables.flatMap((row) => [
    {
      table_name: row.table_name,
      ordinal_position: 1,
      column_name: "symbol",
      data_type: "SYMBOL",
    },
    {
      table_name: row.table_name,
      ordinal_position: 2,
      column_name: "timestamp",
      data_type: "TIMESTAMP",
    },
  ])
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost",
      )
      const query = url.searchParams.get("query") ?? ""
      server.queries.push(query)
      if (query.startsWith("(show parameters)"))
        return reply(raw([{ property_path: "cairo.sql.copy.root", value: "" }]))
      else if (query.startsWith("tables()")) return reply(raw(server.tables))
      else if (query.startsWith("information_schema."))
        return reply(raw(server.columns))
      else if (query.startsWith("materialized_views()"))
        return reply(raw(server.matviews))
      else if (query.startsWith("live_views()"))
        return reply(raw(server.liveviews))
      else if (query.startsWith("views()"))
        return reply(
          raw([
            {
              view_name: "btc_trades_view",
              view_status: "valid",
              invalidation_reason: null,
            },
          ]),
        )
      else if (query.startsWith("WITH cols"))
        return reply(
          raw([{ symbolCached: true, symbolCapacity: 256, indexed: false }]),
        )
      else if (query.startsWith("SHOW CREATE")) {
        const name = query.match(/'([^']+)'/)?.[1]
        return reply(
          raw([
            {
              ddl: `CREATE TABLE '${name}' (symbol SYMBOL, price DOUBLE, timestamp TIMESTAMP) TIMESTAMP(timestamp) PARTITION BY DAY WAL;`,
            },
          ]),
        )
      } else if (query.startsWith("wal_tables()"))
        return reply(
          raw([
            {
              name: "btc_trades_lv",
              suspended: !server.resumed,
              writerTxn: "1",
              sequencerTxn: "2",
              writerLagTxnCount: "1",
              errorTag: "OUT OF MEMORY",
              errorMessage: "Out of memory",
            },
          ]),
        )
      else if (query === "ALTER LIVE VIEW 'btc_trades_lv' RESUME WAL") {
        server.resumed = true
        return reply({ ddl: "OK" })
      } else throw new Error(`Unexpected SQL: ${query}`)
    }),
  )
  return server
}
export const mountSchema = async () => {
  await Promise.all([
    db.ai_conversations.clear(),
    db.ai_conversation_messages.clear(),
  ])
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider delayDuration={0}>
        <Provider store={createStore(rootReducer)}>
          <LocalStorageProvider>
            <AIConversationProvider>
              <AIStatusProvider>
                <Schema open />
              </AIStatusProvider>
            </AIConversationProvider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  await waitFor(() => get("schema-folder-title"))
}
export const expand = async (
  section: "tables" | "materialized-views" | "live-views" | "views",
) => {
  const control = query(`expand-${section}`)
  if (control) await userEvent.dblClick(control)
}
beforeEach(() => {
  installNativeAbortSignals()
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  localStorage.clear()
  sessionStorage.clear()
  questClient.resetCredentials()
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
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: writeClipboard.mockReset().mockResolvedValue(undefined),
    },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  stop()
  for (const event of [
    EventType.MSG_CONNECTION_ERROR,
    EventType.MSG_CONNECTION_OK,
    EventType.MSG_QUERY_SCHEMA,
  ])
    eventBus.unsubscribe(event)
})
