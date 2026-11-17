// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../theme"
import { TooltipProvider } from "../../components/Tooltip"
import { LocalStorageProvider } from "../../providers/LocalStorageProvider"
import rootReducer from "../../store/reducers"
import queryActions from "../../store/Query/actions"
import { Type } from "../../utils/questdb/types"
import type { ActiveBufferSummary } from "../../providers/EditorProvider"
import Console from "./index"

const active = vi.hoisted(() => ({
  summary: { id: 1, isNotebook: false } as ActiveBufferSummary,
}))

vi.mock("../../providers/EditorProvider", () => ({
  useActiveBufferSummary: () => active.summary,
}))
vi.mock("../../providers", () => ({
  useSettings: () => ({ consoleConfig: {} }),
  useSearch: () => ({
    isSearchPanelOpen: false,
    setSearchPanelOpen: vi.fn(),
    searchPanelRef: { current: null },
  }),
}))
vi.mock("allotment", () => {
  const Allotment = Object.assign(
    React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
      ({ children }, ref) => <div ref={ref}>{children}</div>,
    ),
    {
      Pane: ({
        children,
        visible,
      }: {
        children: React.ReactNode
        visible?: boolean
      }) => <div data-visible={String(visible ?? true)}>{children}</div>,
    },
  )
  return { Allotment, LayoutPriority: { High: 1, Low: 2 } }
})
vi.mock("../Editor", () => ({ default: () => null }))
vi.mock("../Schema", () => ({ default: () => null }))
vi.mock("../Search", () => ({
  SearchPanel: React.forwardRef(() => null),
}))
vi.mock("./import", () => ({ Import: () => null }))
vi.mock("../../components/AIStatusIndicator", () => ({
  AIStatusIndicator: () => null,
}))
vi.mock("../Result", () => ({
  default: () => <div data-testid="result" />,
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const storage = vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
  return jsdom.window.localStorage
})

beforeEach(() => {
  vi.stubGlobal("localStorage", storage)
  storage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const dql = {
  type: Type.DQL as const,
  query: "select 1",
  columns: [{ name: "x", type: "LONG" }],
  dataset: [[1]],
  count: 1,
  error: undefined,
  notice: undefined,
  timings: { compiler: 0, authentication: 0, count: 0, execute: 0, fetch: 0 },
}

const mountConsole = () => {
  const store = createStore(rootReducer)
  const view = render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={store}>
          <LocalStorageProvider>
            <Console />
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  return { store, view }
}

const resultPaneVisible = () =>
  screen
    .getByTestId("result")
    .closest("[data-visible]")!
    .getAttribute("data-visible") === "true"

describe("result pane on notebook tabs", () => {
  it("keeps the SQL editor's result hidden while a notebook is active", () => {
    active.summary = { id: 2, isNotebook: true }
    const { store } = mountConsole()
    act(() => {
      store.dispatch(queryActions.setResult(dql, 1))
    })
    expect(resultPaneVisible()).toBe(false)
    expect(
      screen.queryByRole("button", { name: "Grid result panel" }),
    ).toBeNull()
  })

  it("shows a result run from the active notebook (e.g. AI chat)", () => {
    active.summary = { id: 2, isNotebook: true }
    const { store } = mountConsole()
    act(() => {
      store.dispatch(queryActions.setResult(dql, 2))
    })
    expect(resultPaneVisible()).toBe(true)
    expect(
      screen.getByRole("button", { name: "Grid result panel" }),
    ).toBeInTheDocument()
  })

  it("shows the result on a SQL tab", () => {
    active.summary = { id: 1, isNotebook: false }
    const { store } = mountConsole()
    act(() => {
      store.dispatch(queryActions.setResult(dql, 1))
    })
    expect(resultPaneVisible()).toBe(true)
  })
})
