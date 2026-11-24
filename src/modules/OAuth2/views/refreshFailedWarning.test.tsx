// @vitest-environment jsdom
import "../../../test/stubBrowserGlobals"
import React from "react"
import { ThemeProvider } from "styled-components"
import { darkTheme, lightTheme } from "../../../theme"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RefreshFailedWarning } from "./refreshFailedWarning"

vi.mock("../../../components/Button", () => ({ Button: "button" }))
vi.mock("../../../components/Box", () => ({
  Box: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

let rendered: RenderResult | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
})

afterEach(() => {
  cleanup()
  rendered = undefined
  vi.useRealTimers()
})

const mount = (expiresAt?: string) => {
  const onSignIn = vi.fn()
  rendered = render(
    <ThemeProvider theme={darkTheme}>
      <RefreshFailedWarning expiresAt={expiresAt} onSignIn={onSignIn} />
    </ThemeProvider>,
  )
  return onSignIn
}

const messageElement = () => rendered!.container.querySelectorAll("span")[0]
const message = () => messageElement().textContent
const cssColor = (value: string) => {
  const probe = document.createElement("span")
  probe.style.color = value
  return probe.style.color
}
const advanceTime = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("refresh failure warning", () => {
  it.each([darkTheme, lightTheme])(
    "uses primary content color in $mode mode",
    (theme) => {
      rendered = render(
        <ThemeProvider theme={theme}>
          <RefreshFailedWarning onSignIn={vi.fn()} />
        </ThemeProvider>,
      )
      expect(getComputedStyle(messageElement()).color).toBe(
        cssColor(theme.color.contentPrimary),
      )
      expect(message()).not.toContain("paused")
    },
  )
  it("updates an open warning at expiry without another refresh event", () => {
    const onSignIn = mount(new Date(Date.now() + 20_000).toISOString())
    expect(message()).toContain("Your current token expires at")
    advanceTime(19_999)
    expect(message()).toContain("Your current token expires at")
    advanceTime(1)
    expect(message()).toContain(
      "Queries are not being sent. Run them again after a short wait",
    )
    expect(message()).not.toContain("Your current token expires at")
    fireEvent.click(screen.getByRole("button"))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it.each([undefined, "invalid", "2025-12-31T23:59:59Z"])(
    "reports unsent queries immediately for expiry %s",
    (expiresAt) => {
      mount(expiresAt)
      expect(message()).toContain("Queries are not being sent")
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("cancels its expiry timer when the warning is dismissed", () => {
    mount(new Date(Date.now() + 20_000).toISOString())
    expect(vi.getTimerCount()).toBe(1)
    rendered!.unmount()
    rendered = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it("reschedules if the warning receives a later expiry", () => {
    mount(new Date(Date.now() + 20_000).toISOString())
    rendered!.rerender(
      <ThemeProvider theme={darkTheme}>
        <RefreshFailedWarning
          expiresAt={new Date(Date.now() + 40_000).toISOString()}
          onSignIn={vi.fn()}
        />
      </ThemeProvider>,
    )
    advanceTime(20_000)
    expect(message()).toContain("Your current token expires at")
    advanceTime(20_000)
    expect(message()).toContain("Queries are not being sent")
  })

  it("does not overflow the timer for distant expiry dates", () => {
    mount(new Date(Date.now() + 2_147_483_648).toISOString())
    advanceTime(2_147_483_647)
    expect(message()).toContain("Your current token expires at")
    advanceTime(1)
    expect(message()).toContain("Queries are not being sent")
  })
})
