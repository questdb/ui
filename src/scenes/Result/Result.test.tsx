// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../../theme"
import { TooltipProvider } from "../../components/Tooltip"
import { ToastContainer } from "../../components/Toast"
import { LocalStorageProvider } from "../../providers/LocalStorageProvider"
import { QuestContext } from "../../providers/QuestProvider"
import { questClient } from "../../utils/questdb/queryClient"
import { questExecution } from "../../utils/questdb/queryExecution"
import rootReducer from "../../store/reducers"
import queryActions from "../../store/Query/actions"
import { Type } from "../../utils/questdb/types"
import Result from "./index"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

const storage = vi.hoisted(() => {
  const { jsdom } = globalThis as typeof globalThis & {
    jsdom: { window: Window }
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  vi.stubGlobal("localStorage", jsdom.window.localStorage)
  vi.stubGlobal("sessionStorage", jsdom.window.sessionStorage)
  return jsdom.window.localStorage
})

vi.mock("../Editor/Monaco", () => ({ LINE_NUMBER_HARD_LIMIT: 100000 }))
vi.mock("../Editor/Monaco/query-in-notification", () => ({
  QueryInNotification: () => null,
}))
const renders = vi.hoisted(() => ({ result: 0 }))
const chart = vi.hoisted(() => ({
  onTransferChange: undefined as ((value: unknown) => void) | undefined,
}))
// ResultChart is mounted whenever quick-vis is off, so its renders count
// Result's.
vi.mock("./ResultChart", () => ({
  ResultChart: ({
    onTransferChange,
  }: {
    onTransferChange?: (value: unknown) => void
  }) => {
    renders.result++
    chart.onTransferChange = onTransferChange
    return null
  },
}))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))
vi.mock("../../js/console/quick-vis", () => ({ quickVis: () => () => {} }))

beforeEach(() => {
  vi.stubGlobal("localStorage", storage)
  storage.clear()
  history.replaceState(null, "", "/console/")
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  document.querySelectorAll("iframe").forEach((frame) => frame.remove())
  history.replaceState(null, "", "/")
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const resultFor = (query: string) => ({
  type: Type.DQL as const,
  query,
  columns: [{ name: "x", type: "LONG" }],
  dataset: Array.from({ length: 10 }, (_, index) => [index + 1]),
  count: 10,
  error: undefined,
  notice: undefined,
  timings: { compiler: 0, authentication: 0, count: 0, execute: 0, fetch: 0 },
})

const mountResult = (viewMode: "grid" | "chart" = "grid", canRerun = true) => {
  const store = createStore(rootReducer)
  render(
    <ThemeProvider theme={darkTheme}>
      <TooltipProvider>
        <Provider store={store}>
          <LocalStorageProvider>
            <QuestContext.Provider
              value={{
                quest: questClient,
                questExecution,
                buildVersion: { type: "oss", version: "test" },
                commitHash: "test",
              }}
            >
              <Result viewMode={viewMode} canRerun={canRerun} />
              <ToastContainer />
            </QuestContext.Provider>
          </LocalStorageProvider>
        </Provider>
      </TooltipProvider>
    </ThemeProvider>,
  )
  return store
}

describe("result export actions", () => {
  it.each(["parquet", "csv"] as const)(
    "exports the current grid SQL as %s after another result replaces it",
    async (format) => {
      // Given
      const store = mountResult()
      const first = "select x from long_sequence(10) where x > 0"
      const current = "select x from long_sequence(10)"
      act(() => {
        store.dispatch(queryActions.setResult(resultFor(first)))
      })
      act(() => {
        store.dispatch(queryActions.setResult(resultFor(current)))
      })
      expect(screen.getByRole("grid")).toBeInTheDocument()

      // When
      if (format === "csv") {
        expect(
          screen.queryByRole("button", { name: "Download as CSV" }),
        ).not.toBeInTheDocument()
        await userEvent.click(
          screen.getByRole("button", { name: "Open download options" }),
        )
      }
      await userEvent.click(
        screen.getByRole("button", {
          name: format === "csv" ? "Download as CSV" : "Download as Parquet",
        }),
      )

      // Then
      const frames = document.querySelectorAll("iframe")
      expect(frames).toHaveLength(1)
      const url = new URL(frames[0].src)
      expect(url.pathname).toBe("/console/exp")
      expect(url.searchParams.get("query")).toBe(current)
      expect(url.searchParams.get("fmt")).toBe(format)
      expect(url.searchParams.get("rmode")).toBe(
        format === "parquet" ? "nodelay" : null,
      )
      expect(
        screen.getByRole("button", { name: "Open download options" }),
      ).toHaveAttribute("aria-expanded", "false")
    },
  )
})

describe("result toolbar notebook action", () => {
  const observeToolbar = () => {
    const observers: Array<{
      callback: ResizeObserverCallback
      target?: Element
    }> = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        entry: { callback: ResizeObserverCallback; target?: Element }
        constructor(callback: ResizeObserverCallback) {
          this.entry = { callback }
          observers.push(this.entry)
        }
        observe(target: Element) {
          this.entry.target = target
        }
        unobserve() {}
        disconnect() {}
      },
    )
    // Only the toolbar's observer: the grid observes its own elements.
    return (width: number) =>
      act(() => {
        const action = document.querySelector(
          '[data-hook="result-add-notebook"], [data-hook="result-auto-refresh-notebook"]',
        )
        observers
          .filter(({ target }) => action && target?.contains(action))
          .forEach(({ callback }) =>
            callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              {} as ResizeObserver,
            ),
          )
      })
  }

  it("fits the label to the toolbar and re-renders only at breakpoints", () => {
    const resize = observeToolbar()
    const store = mountResult()
    act(() => {
      store.dispatch(
        queryActions.setResult(resultFor("select x from long_sequence(10)"), 1),
      )
    })
    const action = () =>
      document.querySelector('[data-hook="result-add-notebook"]')!
    const parquet = screen.getByRole("button", { name: "Download as Parquet" })

    resize(1000)
    expect(action()).toHaveTextContent("Add query to notebook")
    expect(parquet).toHaveTextContent("Download as Parquet")
    const rendersAtFullWidth = renders.result
    for (const width of [1010, 990, 950, 900, 850]) resize(width)
    expect(renders.result).toBe(rendersAtFullWidth)

    resize(700)
    expect(action()).toHaveTextContent(/^Add query$/)
    expect(parquet).toHaveTextContent(/^Parquet$/)
    resize(600)
    expect(action()).toHaveTextContent("")
    expect(action()).toHaveAccessibleName("Add query to notebook")
    expect(parquet).toHaveTextContent(/^$/)
    expect(parquet.querySelector("svg")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Download as Parquet" })).toBe(
      parquet,
    )
  })
  it("keeps the label tooltip controlled across breakpoints", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const resize = observeToolbar()
    const store = mountResult()
    act(() => {
      store.dispatch(
        queryActions.setResult(resultFor("select x from long_sequence(10)"), 1),
      )
    })
    const action = () =>
      document.querySelector<HTMLElement>('[data-hook="result-add-notebook"]')!
    const tooltip = () => document.querySelector('[data-hook="tooltip"]')

    resize(700)
    act(() => action().focus())
    expect(tooltip()).toHaveTextContent("Add query to notebook")

    // The full label needs no tooltip; the button keeps its focus.
    resize(1000)
    expect(tooltip()).toBeNull()
    expect(document.activeElement).toBe(action())
    act(() => action().blur())

    resize(700)
    expect(tooltip()).toBeNull()
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("uncontrolled"),
      ),
    ).toEqual([])
    warn.mockRestore()
  })

  it("does not show the tooltip after the toolbar narrows past a full-width visit", () => {
    const resize = observeToolbar()
    const store = mountResult()
    act(() => {
      store.dispatch(
        queryActions.setResult(resultFor("select x from long_sequence(10)"), 1),
      )
    })
    const action = () =>
      document.querySelector<HTMLElement>('[data-hook="result-add-notebook"]')!
    const tooltip = () => document.querySelector('[data-hook="tooltip"]')

    resize(1000)
    act(() => action().focus())
    act(() => action().blur())
    expect(tooltip()).toBeNull()

    resize(700)
    expect(tooltip()).toBeNull()
  })

  it("keeps the auto-refresh action distinct from Re-run when only icons fit", () => {
    const resize = observeToolbar()
    const store = mountResult()
    const repeated = "select x from long_sequence(10)"
    act(() => {
      store.dispatch(queryActions.recordQueryExecution(repeated))
      store.dispatch(queryActions.recordQueryExecution(repeated))
      store.dispatch(queryActions.setResult(resultFor(repeated), 1))
    })
    resize(600)
    const autoRefresh = document.querySelector(
      '[data-hook="result-auto-refresh-notebook"]',
    )!
    const reRun = document.querySelector('[data-hook="grid-toolbar-refresh"]')!
    expect(autoRefresh).toHaveTextContent("")
    expect(autoRefresh.querySelector("svg")!.innerHTML).not.toBe(
      reRun.querySelector("svg")!.innerHTML,
    )
  })
})

describe("result notebook actions", () => {
  const action = (hook: string) =>
    document.querySelector(`[data-hook="${hook}"]`)

  it("offers auto-refresh only for a query that has run repeatedly", () => {
    const store = mountResult()
    const repeated = "select x from long_sequence(10)"
    act(() => {
      store.dispatch(queryActions.recordQueryExecution(repeated))
      store.dispatch(queryActions.setResult(resultFor(repeated), 1))
    })
    expect(action("result-add-notebook")).toBeInTheDocument()
    expect(action("result-auto-refresh-notebook")).not.toBeInTheDocument()

    act(() => {
      store.dispatch(queryActions.recordQueryExecution(repeated))
      store.dispatch(queryActions.setResult(resultFor(repeated), 1))
    })
    expect(action("result-auto-refresh-notebook")).toBeInTheDocument()
    expect(action("result-add-notebook")).not.toBeInTheDocument()

    act(() => {
      store.dispatch(queryActions.recordQueryExecution("select 2"))
      store.dispatch(queryActions.setResult(resultFor("select 2"), 1))
    })
    expect(action("result-add-notebook")).toBeInTheDocument()
    expect(action("result-auto-refresh-notebook")).not.toBeInTheDocument()
  })

  it("enables Save chart only once the chart reports the frame of this result", () => {
    const store = mountResult("chart")
    const shown = resultFor("select x from long_sequence(10)")
    act(() => {
      store.dispatch(queryActions.setResult(shown, 1))
    })
    expect(action("result-add-notebook")).toBeDisabled()

    const frame = { query: { sql: shown.query } }
    act(() => chart.onTransferChange?.({ ...frame, seed: resultFor("old") }))
    expect(action("result-add-notebook")).toBeDisabled()

    const current = store.getState().query.result
    act(() => chart.onTransferChange?.({ ...frame, seed: current }))
    expect(action("result-add-notebook")).toBeEnabled()
  })

  // Legacy quick-vis has no chart config to save, so it offers no action.
  it("offers no chart action in legacy quick-vis, but keeps the grid one", () => {
    storage.setItem("feature.quickVis", "true")
    const chartStore = mountResult("chart")
    act(() => {
      chartStore.dispatch(
        queryActions.setResult(resultFor("select x from long_sequence(10)"), 1),
      )
    })
    expect(action("result-add-notebook")).not.toBeInTheDocument()
    cleanup()

    const gridStore = mountResult("grid")
    act(() => {
      gridStore.dispatch(
        queryActions.setResult(resultFor("select x from long_sequence(10)"), 1),
      )
    })
    expect(action("result-add-notebook")).toBeEnabled()
  })

  it("re-runs the query whose result is displayed", async () => {
    const publish = vi.spyOn(eventBus, "publish")
    const store = mountResult()
    const shown = "select x from long_sequence(10)"
    act(() => {
      store.dispatch(queryActions.setResult(resultFor(shown), 1))
    })
    await userEvent.click(screen.getByRole("button", { name: "Re-run query" }))
    expect(publish).toHaveBeenCalledWith(EventType.MSG_QUERY_EXEC, {
      q: shown,
      sourceBufferId: 1,
    })
  })

  it("disables re-run when there is no editable SQL tab", () => {
    const store = mountResult("grid", false)
    act(() => {
      store.dispatch(queryActions.setResult(resultFor("select 1"), 1))
    })
    expect(screen.getByRole("button", { name: "Re-run query" })).toBeDisabled()
  })
})
