import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RefreshFailedWarning } from "./refreshFailedWarning"

vi.mock("../../../components/Button", () => ({ Button: "button" }))
vi.mock("../../../components/Toast", () => ({
  NOTIFICATION_SHORTCUT: "Alt+N",
}))

let renderer: ReactTestRenderer | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

const mount = (expiresAt?: string) => {
  const onSignIn = vi.fn()
  act(() => {
    renderer = create(
      <RefreshFailedWarning expiresAt={expiresAt} onSignIn={onSignIn} />,
    )
  })
  return onSignIn
}

const message = () => renderer!.root.findByType("p").children[0]
const advanceTime = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("refresh failure warning", () => {
  it("updates an open warning at expiry without another refresh event", () => {
    const onSignIn = mount(new Date(Date.now() + 20_000).toISOString())
    expect(message()).toContain("Your current token expires at")
    advanceTime(19_999)
    expect(message()).toContain("Your current token expires at")
    advanceTime(1)
    expect(message()).toContain("Queries are paused until renewal succeeds")
    expect(message()).not.toContain("Your current token expires at")
    act(() => {
      const { onClick } = renderer!.root.findByType("button").props as {
        onClick: () => void
      }
      onClick()
    })
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it.each([undefined, "invalid", "2025-12-31T23:59:59Z"])(
    "reports paused queries immediately for expiry %s",
    (expiresAt) => {
      mount(expiresAt)
      expect(message()).toContain("Queries are paused")
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("cancels its expiry timer when the warning is dismissed", () => {
    mount(new Date(Date.now() + 20_000).toISOString())
    expect(vi.getTimerCount()).toBe(1)
    act(() => renderer!.unmount())
    renderer = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it("reschedules if the warning receives a later expiry", () => {
    mount(new Date(Date.now() + 20_000).toISOString())
    act(() => {
      renderer!.update(
        <RefreshFailedWarning
          expiresAt={new Date(Date.now() + 40_000).toISOString()}
          onSignIn={vi.fn()}
        />,
      )
    })
    advanceTime(20_000)
    expect(message()).toContain("Your current token expires at")
    advanceTime(20_000)
    expect(message()).toContain("Queries are paused")
  })

  it("does not overflow the timer for distant expiry dates", () => {
    mount(new Date(Date.now() + 2_147_483_648).toISOString())
    advanceTime(2_147_483_647)
    expect(message()).toContain("Your current token expires at")
    advanceTime(1)
    expect(message()).toContain("Queries are paused")
  })
})
