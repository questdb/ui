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
vi.mock("./ResultChart", () => ({ ResultChart: () => null }))
vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

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

const mountResult = () => {
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
              <Result viewMode="grid" />
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
