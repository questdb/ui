import { renderComponent, getHook } from "../../../test/component"
import React from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { act, fireEvent } from "@testing-library/react"
import { beforeEach, vi } from "vitest"
import rootReducer from "../../../store/reducers"
import { LocalStorageProvider } from "../../../providers/LocalStorageProvider"
import { QueryActivityButton } from "../../Layout/QueryActivityButton"
import { QueryActivityDrawer } from ".."
import { DrawerHost } from "../../Schema/TableDetailsDrawer/test/DrawerHost"
import { questClient } from "../../../utils/questdb/queryClient"
import { listingResponse, SELF_ROW, SERVER_NOW } from "./fixtures"

vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("react-virtuoso", () => ({
  // Render all supplied rows for state tests. Real viewport bounds stay in E2E.
  Virtuoso: ({
    totalCount,
    itemContent,
    computeItemKey,
  }: {
    totalCount: number
    itemContent: (index: number) => React.ReactNode
    computeItemKey: (index: number) => string
  }) => (
    <div>
      {Array.from({ length: totalCount }, (_, index) => (
        <React.Fragment key={computeItemKey(index)}>
          {itemContent(index)}
        </React.Fragment>
      ))}
    </div>
  ),
}))

export const get = (name: string) => getHook(`query-activity-${name}`)
export const query = (name: string) =>
  document.querySelector<HTMLElement>(`[data-hook="query-activity-${name}"]`)
export const getRow = (id: number) => {
  const element = document.querySelector<HTMLElement>(
    `[data-hook="query-activity-row"][data-query-id="${id}"]`,
  )
  if (!element) throw new Error(`Missing query ${id}`)
  return element
}
export const rowIds = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[data-hook="query-activity-row"]'),
  ).map((row) => row.dataset.queryId)
export const flush = async () => {
  await act(async () => {})
}
export const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}
export const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
export const openDrawer = async () => click(get("toggle-button"))
export const renderActivity = async (settings: Record<string, string> = {}) => {
  Object.entries(settings).forEach(([key, value]) =>
    localStorage.setItem(key, value),
  )
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <LocalStorageProvider>
        <QueryActivityButton />
        <DrawerHost>
          <QueryActivityDrawer />
        </DrawerHost>
      </LocalStorageProvider>
    </Provider>,
  )
  await flush()
}
export const activityServer = (dataset = [SELF_ROW]) => {
  const server = {
    dataset,
    failure: false,
    listings: [] as { signal: AbortSignal | null | undefined }[],
    cancellations: [] as string[],
    respond: (): Response | Promise<Response> =>
      server.failure
        ? Response.json(
            { error: "registry unavailable", position: 0 },
            { status: 500 },
          )
        : Response.json(listingResponse(server.dataset)),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost",
      )
      const sql = url.searchParams.get("query") ?? ""
      if (sql.includes("query_activity()")) {
        server.listings.push({ signal: init?.signal })
        return Promise.resolve(server.respond())
      }
      if (sql.startsWith("CANCEL QUERY ")) {
        server.cancellations.push(sql)
        return Promise.resolve(Response.json({ ddl: "OK" }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }),
  )
  return server
}

beforeEach(() => {
  questClient.resetCredentials()
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  })
  vi.setSystemTime(new Date(SERVER_NOW))
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})
