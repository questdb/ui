import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"

const messages = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock("react-toastify", () => ({
  toast: { ...messages, dismiss: vi.fn(), isActive: vi.fn() },
  ToastContainer: () => null,
  Slide: () => null,
}))
vi.mock("react-toastify/addons/use-notification-center", () => ({
  useNotificationCenter: vi.fn(),
}))
vi.mock("../icons", () => ({
  CloseCircle: () => null,
  ErrorWarning: () => null,
  Information: () => null,
  CheckmarkOutline: () => null,
}))
import { NOTIFICATION_SHORTCUT, ToastContainer, toast } from "."

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const mountNotifications = () => {
  const focus = vi.fn()
  const querySelector = vi.fn().mockReturnValue({ focus })
  const closest = vi.fn().mockReturnValue(null)
  const addEventListener = vi.fn<
    [string, (event: KeyboardEvent) => void],
    void
  >()
  const removeEventListener = vi.fn()
  vi.stubGlobal("document", {
    activeElement: { closest },
    addEventListener,
    removeEventListener,
  })
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <ToastContainer />
      </ThemeProvider>,
      { createNodeMock: () => ({ querySelector }) },
    )
  })
  const onKeyDown = addEventListener.mock.calls[0][1]
  const press = (overrides: Partial<KeyboardEvent> = {}) => {
    const event = {
      key: "n",
      code: "KeyN",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      ...overrides,
    }
    onKeyDown(event as KeyboardEvent)
    return event
  }
  return {
    focus,
    querySelector,
    closest,
    press,
    removeEventListener,
    onKeyDown,
  }
}

describe("toast theme styles", () => {
  it.each(["info", "success", "warning", "error"] as const)(
    "uses live theme variables for persistent %s toasts",
    (type) => {
      toast[type]("Could not refresh", { autoClose: false })
      const status = {
        info: "Info",
        success: "Success",
        warning: "Warning",
        error: "Danger",
      }[type]
      expect(messages[type]).toHaveBeenCalledWith(
        "Could not refresh",
        expect.objectContaining({
          autoClose: false,
          style: {
            background: "var(--qdb-color-surfaceRaised)",
            color: "var(--qdb-color-contentPrimary)",
            borderColor: `var(--qdb-color-status${status})`,
          },
          progressStyle: {
            background: `var(--qdb-color-status${status})`,
          },
        }),
      )
    },
  )
})

describe("notification keyboard access", () => {
  it("advertises Alt+N and focuses the first notification control", () => {
    const { press, focus } = mountNotifications()
    expect(renderer!.root.findByProps({ role: "region" }).props).toMatchObject({
      "aria-keyshortcuts": NOTIFICATION_SHORTCUT,
    })
    expect(NOTIFICATION_SHORTCUT).toBe("Alt+N")
    expect(press().preventDefault).toHaveBeenCalledOnce()
    // Option-modified characters vary by keyboard layout; the physical code
    // must still identify the shortcut.
    expect(press({ key: "˜" }).preventDefault).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledTimes(2)
  })

  it.each([
    { key: "t", code: "KeyT" },
    { altKey: false },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
  ])("does not consume unrelated or handled keys %j", (event) => {
    const { press, focus } = mountNotifications()
    expect(press(event).preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it("preserves modal focus and works after the dialog is closed", () => {
    const { press, closest, focus } = mountNotifications()
    closest.mockReturnValue({ role: "dialog" })
    expect(press().preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    closest.mockReturnValue(null)
    expect(press().preventDefault).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })

  it("does not consume the shortcut when no notification control exists", () => {
    const { press, querySelector, focus } = mountNotifications()
    querySelector.mockReturnValue(null)
    expect(press().preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it("removes the keyboard listener on unmount", () => {
    const { removeEventListener, onKeyDown } = mountNotifications()
    act(() => renderer!.unmount())
    expect(removeEventListener).toHaveBeenCalledWith("keydown", onKeyDown)
    renderer = undefined
  })
})
