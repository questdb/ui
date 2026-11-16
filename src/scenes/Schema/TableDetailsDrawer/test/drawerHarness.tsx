import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import React from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../../../theme"
import { TooltipProvider } from "../../../../components/Tooltip"
import { LocalStorageProvider } from "../../../../providers/LocalStorageProvider"
import { AIStatusProvider } from "../../../../providers/AIStatusProvider"
import { AIConversationProvider } from "../../../../providers/AIConversationProvider"
import { SettingsProvider } from "../../../../providers/SettingsProvider"
import { installNativeAbortSignals } from "../../../../test/nativeAbortSignals"
import rootReducer from "../../../../store/reducers"
import { actions } from "../../../../store"
import { Type, type TableKind } from "../../../../utils/questdb/types"
import { questClient } from "../../../../utils/questdb/queryClient"
import { TableDetailsDrawer } from ".."
import { raw, table, liveView, matView } from "./catalogFixtures"

vi.mock("../../../../modules/ConsoleEventTracker", () => ({
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

export const hook = (name: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(
    `[data-hook="table-details-${name}"]`,
  )
  if (!element) throw new Error(`Missing table-details-${name}`)
  return element
}
export const queryHook = (name: string) =>
  document.querySelector(`[data-hook="table-details-${name}"]`)
export const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(hook(name))
    await Promise.resolve()
  })
}
export const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
export const flush = async () => {
  await act(async () => {})
}
export { raw, table, liveView, matView } from "./catalogFixtures"
export const unavailable = () =>
  Response.json({ error: "Catalog unavailable", position: 0 }, { status: 500 })
export const deferred = () => {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((complete) => {
    resolve = complete
  })
  return {
    promise,
    respond: async (response: Response) => {
      await act(async () => {
        resolve(response)
        await promise
      })
    },
  }
}
let imagePreloads = Promise.resolve()
let finishImagePreloads = () => {}

export const catalog = () => {
  imagePreloads = new Promise<void>((resolve) => {
    finishImagePreloads = resolve
  })
  const server = {
    enterprise: false,
    tables: [
      table(),
      table("trades_lv", "liveview"),
      table("other_lv", "liveview"),
      table("other"),
      table("trades_mv", "matview"),
      table("trades_view", "view"),
    ] as Record<string, unknown>[],
    liveViews: [liveView(), liveView("other_lv", "other")] as Record<
      string,
      unknown
    >[],
    matViews: [matView()] as Record<string, unknown>[],
    requests: [] as { query: string; signal?: AbortSignal | null }[],
    reply: (_query: string): Response | Promise<Response> | undefined =>
      undefined,
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost/",
      )
      if (url.pathname === "/settings")
        return Response.json({
          config: { "release.type": server.enterprise ? "EE" : "OSS" },
          preferences: {},
          "preferences.version": 1,
        })
      if (url.pathname === "/warnings") return Response.json([])
      if (url.pathname === "/assets/console-configuration.json")
        return Response.json({})
      if (url.pathname.startsWith("/assets/")) {
        const response = new Response("")
        if (url.pathname.endsWith("grid-bg.webp")) {
          const readBlob = response.blob.bind(response)
          response.blob = async () => {
            try {
              return await readBlob()
            } finally {
              finishImagePreloads()
            }
          }
        }
        return response
      }
      if (url.pathname !== "/exec")
        throw new Error(`Unexpected request: ${url}`)
      const query = url.searchParams.get("query") ?? ""
      server.requests.push({ query, signal: init?.signal })
      const response = server.reply(query)
      if (response) return response
      const name = query.match(/(?:table_name|view_name)\s*=\s*'([^']+)'/i)?.[1]
      if (query.startsWith("tables()"))
        return Response.json(
          raw(
            server.tables.filter((row) => !name || row.table_name === name),
            table(),
          ),
        )
      if (query.startsWith("live_views()"))
        return Response.json(
          raw(
            server.liveViews.filter((row) => !name || row.view_name === name),
            liveView(),
          ),
        )
      if (query.startsWith("materialized_views()"))
        return Response.json(
          raw(
            server.matViews.filter((row) => !name || row.view_name === name),
            matView(),
          ),
        )
      if (query.startsWith("views()"))
        return Response.json(
          raw([
            {
              view_name: "trades_view",
              view_status: "valid",
              view_sql: "select * from trades",
              invalidation_reason: null,
            },
          ]),
        )
      if (query.startsWith("SHOW COLUMNS"))
        return Response.json(
          raw([
            {
              column: "symbol",
              type: "SYMBOL",
              indexed: false,
              designated: false,
            },
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
          raw([
            {
              ddl: "CREATE TABLE trades (symbol SYMBOL, timestamp TIMESTAMP) TIMESTAMP(timestamp) PARTITION BY DAY WAL;",
            },
          ]),
        )
      if (query.startsWith("storage_policies")) return Response.json(raw([]))
      throw new Error(`Unexpected SQL: ${query}`)
    }),
  )
  return server
}
export const mountDrawer = async (
  name = "trades",
  kind: TableKind = "table",
  ai: "enabled" | "no-schema" | "disabled" = "disabled",
) => {
  if (ai !== "disabled")
    localStorage.setItem(
      "ai.assistant.settings",
      JSON.stringify({
        modelValueFormat: 2,
        selectedModel: "openai:gpt-5.4",
        providers: {
          openai: {
            apiKey: "test-key",
            enabledModels: ["openai:gpt-5.4"],
            grantSchemaAccess: ai === "enabled",
          },
        },
      }),
    )
  const store = createStore(rootReducer)
  store.dispatch(
    actions.console.pushSidebarHistory({
      type: "tableDetails",
      payload: { tableName: name, kind },
    }),
  )
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={store}>
          <SettingsProvider>
            <LocalStorageProvider>
              <AIConversationProvider>
                <AIStatusProvider>
                  <TableDetailsDrawer />
                </AIStatusProvider>
              </AIConversationProvider>
            </LocalStorageProvider>
          </SettingsProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  await act(async () => {
    await imagePreloads
  })
  await flush()
  return store
}

// Populate the selector through the real catalog client, as the schema panel
// does. Selection itself still goes through TableSelector's keyboard handler.
export const loadSelectorTables = async (
  store: Awaited<ReturnType<typeof mountDrawer>>,
) => {
  await act(async () => {
    const result = await questClient.showTables()
    if (result.type !== Type.DQL) throw new Error("Expected table catalog rows")
    store.dispatch(actions.query.setTables(result.data))
  })
}
export const selectTable = async (name: string) => {
  await click("name")
  await act(async () => {
    fireEvent.change(hook("name"), { target: { value: name } })
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.keyDown(hook("name"), { key: "Enter", code: "Enter" })
    await Promise.resolve()
  })
}

beforeEach(() => {
  installNativeAbortSignals()
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  localStorage.clear()
  sessionStorage.clear()
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
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"))
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
  questClient.resetCredentials()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
