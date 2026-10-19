import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import {
  QueryAT,
  NotificationType,
  RunningType,
  type QueryAction,
} from "../../store/Query/types"
import { ResultGridAdapter } from "./ResultGridAdapter"
import type { PaginationFn } from "./usePagedDataSource"

type AsyncPaginationFn = (...args: Parameters<PaginationFn>) => Promise<void>

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn<[QueryAction], void>(),
  queryRaw: vi.fn(),
  grid: vi.fn<[HTMLElement | null, PaginationFn], void>(),
  running: "none",
  useNewGrid: true,
}))
vi.mock("jquery", () => ({ default: vi.fn() }))
vi.mock("../../js/console/grid", () => ({ grid: mocks.grid }))
vi.mock("../../js/console/quick-vis", () => ({ quickVis: vi.fn() }))
vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: () => unknown) => selector(),
}))
vi.mock("../../store", async () => {
  const { default: query } = await import("../../store/Query/actions")
  return {
    actions: { query },
    selectors: {
      query: {
        getResult: () => undefined,
        getRunning: () => mocks.running,
      },
      console: { getActiveSidebar: () => undefined },
    },
  }
})
vi.mock("../../providers", async () => {
  const { createContext } = await import("react")
  return {
    QuestContext: createContext({
      quest: { queryRaw: mocks.queryRaw },
      questExecution: {},
    }),
  }
})
vi.mock("../../providers/LocalStorageProvider", () => ({
  useLocalStorage: () => ({ useNewGrid: mocks.useNewGrid, useQuickVis: false }),
}))
vi.mock("../../hooks/useQueryExecutionState", () => ({
  useQueryExecutionState: () => ({ active: null }),
}))
vi.mock("../../components", () => ({
  Box: "div",
  Button: "button",
  PaneContent: "div",
  PaneWrapper: "div",
  PopperToggle: () => null,
  PrimaryToggleButton: "button",
  Text: "span",
  Tooltip: ({ children }: React.PropsWithChildren<unknown>) => children,
  toast: { error: vi.fn() },
  TOOLBAR_CONTROL_HEIGHT: "3rem",
}))
vi.mock("../../components/icons", () => ({
  Download2: "svg",
  Play: "svg",
  ResetGrid: "svg",
  MoveColumnToFront: "svg",
  TableFreezeColumn: "svg",
  Markdown: "svg",
  Check: "svg",
  ArrowDownS: "svg",
}))
vi.mock("../../utils", () => ({ color: () => "inherit" }))
vi.mock("../../utils/downloadQueryResult", () => ({
  downloadQueryResult: vi.fn(),
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../Editor/Monaco", () => ({ LINE_NUMBER_HARD_LIMIT: 100000 }))
vi.mock("../Editor/Monaco/query-in-notification", () => ({
  QueryInNotification: "query-in-notification",
}))
vi.mock("./ResultGridAdapter", () => ({ ResultGridAdapter: "paged-grid" }))
vi.mock("./ResultChart", () => ({ ResultChart: () => null }))

import Result from "."

let renderer: ReactTestRenderer
let paginationFn: AsyncPaginationFn
const renderPage = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.running = RunningType.NONE
  vi.stubGlobal("document", { getElementById: () => null })
})
afterEach(() => {
  act(() => renderer?.unmount())
  vi.unstubAllGlobals()
})

const mount = () => {
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <Result viewMode="grid" />
      </ThemeProvider>,
    )
  })
  paginationFn = mocks.useNewGrid
    ? (renderer.root.findByType(ResultGridAdapter).props
        .paginationFn as AsyncPaginationFn)
    : (mocks.grid.mock.calls[0][1] as AsyncPaginationFn)
}

describe.each([true, false])("pagination (new: %s)", (useNewGrid) => {
  beforeEach(() => {
    mocks.useNewGrid = useNewGrid
  })

  it("does not persist a session-ended notification but still stops running", async () => {
    mocks.queryRaw.mockRejectedValue({
      error: "Your session has ended. Please sign in again.",
      sessionEnded: true,
    })
    mount()

    await paginationFn("select x", 1000, 2000, renderPage)

    expect(renderPage).not.toHaveBeenCalled()
    expect(mocks.dispatch.mock.calls).toEqual([
      [{ type: QueryAT.STOP_RUNNING }],
    ])
  })

  it("does not stop an unrelated active query after a session-ended page", async () => {
    mocks.running = RunningType.QUERY
    mocks.queryRaw.mockRejectedValue({ error: "Ended", sessionEnded: true })
    mount()

    await paginationFn("select x", 1000, 2000, renderPage)

    expect(renderPage).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it("keeps ordinary failure notifications ahead of running-state cleanup", async () => {
    mocks.queryRaw.mockRejectedValue({ error: "Invalid column" })
    mount()

    await paginationFn("select x", 1000, 2000, renderPage)

    expect(renderPage).not.toHaveBeenCalled()
    expect(mocks.dispatch).toHaveBeenCalledTimes(2)
    expect(mocks.dispatch.mock.calls[0][0]).toMatchObject({
      type: QueryAT.ADD_NOTIFICATION,
      payload: {
        type: NotificationType.ERROR,
        updateActiveNotification: true,
        content: <span color="statusDanger">Invalid column</span>,
      },
    })
    expect(mocks.dispatch.mock.calls[1]).toEqual([
      { type: QueryAT.STOP_RUNNING },
    ])
  })

  it("still renders a successfully fetched page", async () => {
    const result = { type: "dql", dataset: [[42]], count: 1 }
    mocks.queryRaw.mockResolvedValue(result)
    mount()

    await paginationFn("select x", 1000, 2000, renderPage)

    expect(mocks.queryRaw).toHaveBeenCalledWith("select x", {
      limit: "1000,2000",
      nm: true,
      background: true,
    })
    expect(renderPage).toHaveBeenCalledWith(result)
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
