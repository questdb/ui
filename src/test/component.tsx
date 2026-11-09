import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"
import React from "react"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"
import { ThemeProvider } from "styled-components"
import { darkTheme } from "../theme"
import { ThemeCssVariables } from "../theme/css-variables"
import { TooltipProvider } from "../components/Tooltip"
import { installNativeAbortSignals } from "./nativeAbortSignals"

// Vitest 1 otherwise retains Node's storage instead of the jsdom instance.
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

beforeEach(() => {
  vi.stubGlobal("localStorage", storage.local)
  vi.stubGlobal("sessionStorage", storage.session)
  storage.local.clear()
  storage.session.clear()
  installNativeAbortSignals()
  // jsdom has no layout. Tests using this shim must not assert geometry.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  history.replaceState(null, "", "/")
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const Providers = ({ children }: { children?: React.ReactNode }) => (
  <ThemeProvider theme={darkTheme}>
    <ThemeCssVariables />
    <TooltipProvider>{children}</TooltipProvider>
  </ThemeProvider>
)

export const renderComponent = (element: React.ReactElement) =>
  render(element, { wrapper: Providers })

export const getHook = (name: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-hook="${name}"]`)
  if (!element) throw new Error(`Missing data-hook="${name}"`)
  return element
}

export const queryHook = (name: string) =>
  document.querySelector<HTMLElement>(`[data-hook="${name}"]`)

export const findHook = (name: string) => waitFor(() => getHook(name))

export const requestUrl = (input: RequestInfo | URL) =>
  new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    location.href,
  )
