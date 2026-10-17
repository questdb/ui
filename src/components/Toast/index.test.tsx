import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import type { ToastContainerProps } from "react-toastify"

const messages = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
  closeToast: vi.fn(),
}))
vi.mock("react-toastify", () => ({
  toast: { ...messages, isActive: vi.fn() },
  ToastContainer: ({ closeButton, theme }: ToastContainerProps) =>
    typeof closeButton === "function"
      ? closeButton({
          closeToast: messages.closeToast,
          type: "error",
          theme: theme ?? "light",
        })
      : null,
  Slide: () => null,
}))
vi.mock("react-toastify/addons/use-notification-center", () => ({
  useNotificationCenter: vi.fn(),
}))
vi.mock("../Button/ButtonBase", () => ({ ButtonBase: "button" }))
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
  let activeElement: unknown
  const closest = vi.fn().mockReturnValue(null)
  const origin = {
    closest,
    isConnected: true,
    focus: vi.fn(() => {
      activeElement = origin
    }),
  }
  activeElement = origin
  const notification = { id: "sso-refresh-failed", querySelector: vi.fn() }
  const focus = vi.fn(() => {
    activeElement = control
  })
  const control = {
    closest: vi.fn((selector: string) =>
      selector === ".Toastify__toast" ? notification : null,
    ),
    focus,
  }
  const querySelector = notification.querySelector.mockImplementation(
    (selector: string) =>
      selector === ".Toastify__close-button" ? control : {},
  )
  const notifications = [notification]
  const querySelectorAll = vi.fn(() => notifications)
  const contains = (element: unknown) => element === control
  const addEventListener = vi.fn<
    [string, (event: KeyboardEvent) => void],
    void
  >()
  const removeEventListener = vi.fn()
  vi.stubGlobal("document", {
    get activeElement() {
      return activeElement
    },
    addEventListener,
    removeEventListener,
  })
  act(() => {
    renderer = create(
      <ThemeProvider theme={darkTheme}>
        <ToastContainer />
      </ThemeProvider>,
      { createNodeMock: () => ({ querySelectorAll, contains }) },
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
    notification,
    origin,
    control,
    notifications,
    moveFocus: (element: unknown) => {
      activeElement = element
    },
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
  it("advertises Alt+N on the safe close control, never the sign-in action", () => {
    const { press, focus } = mountNotifications()
    expect(
      renderer!.root.findByProps({ "aria-label": "Close notification" }).props,
    ).toMatchObject({
      "aria-keyshortcuts": NOTIFICATION_SHORTCUT,
    })
    expect(NOTIFICATION_SHORTCUT).toBe("Alt+N")
    expect(press().preventDefault).toHaveBeenCalledOnce()
    const editable = { closest: () => ({}) } as unknown as EventTarget
    expect(
      press({ key: "˜", target: editable }).preventDefault,
    ).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalledOnce()
  })

  it.each([
    { key: "t", code: "KeyT" },
    { altKey: false },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
    { isComposing: true },
    { keyCode: 229 },
    { key: "Dead" },
  ])("does not consume unrelated or handled keys %j", (event) => {
    const { press, focus } = mountNotifications()
    expect(press(event).preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it.each(["ń", "~", "˜"])(
    "preserves Option-produced %s in editable controls",
    (key) => {
      const { press, focus } = mountNotifications()
      const target = { closest: () => ({}) } as unknown as EventTarget
      expect(press({ key, target }).preventDefault).not.toHaveBeenCalled()
      expect(focus).not.toHaveBeenCalled()
    },
  )

  it("prioritizes the renewal warning and skips closing notifications", () => {
    const { press, focus, notifications } = mountNotifications()
    const olderFocus = vi.fn()
    notifications.unshift({
      id: "older",
      querySelector: vi.fn((selector: string) =>
        selector === ".Toastify__close-button"
          ? { focus: olderFocus, closest: () => null }
          : {},
      ),
    })
    press()
    expect(focus).toHaveBeenCalledOnce()
    expect(olderFocus).not.toHaveBeenCalled()
    notifications[1].querySelector.mockReturnValue(null)
    press()
    expect(olderFocus).toHaveBeenCalledOnce()
  })

  it.each(["dialog", "alertdialog"])(
    "preserves %s focus without requiring aria-modal",
    (role) => {
      const { press, closest, focus } = mountNotifications()
      closest.mockReturnValue({ role })
      expect(press().preventDefault).not.toHaveBeenCalled()
      expect(closest).toHaveBeenCalledWith(
        '[role="dialog"], [role="alertdialog"]',
      )
      expect(focus).not.toHaveBeenCalled()
      closest.mockReturnValue(null)
      expect(press().preventDefault).toHaveBeenCalledOnce()
      expect(focus).toHaveBeenCalledOnce()
    },
  )

  it("does not consume the shortcut when no notification control exists", () => {
    const { press, querySelector, focus } = mountNotifications()
    querySelector.mockReturnValue(null)
    expect(press().preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it.each(["sso-refresh-failed", undefined])(
    "returns shortcut focus before dismissing %s",
    (id) => {
      const { press, origin } = mountNotifications()
      press()
      // Repeating the shortcut inside the toast must not replace the origin.
      press()
      messages.dismiss.mockImplementationOnce(() => {
        expect(document.activeElement).toBe(origin)
      })
      toast.dismiss(id)
      expect(origin.focus).toHaveBeenCalledOnce()
      expect(messages.dismiss).toHaveBeenCalledWith(id)
    },
  )

  it("restores shortcut focus before the built-in close path removes the toast", () => {
    const { press, origin, control } = mountNotifications()
    press()
    const event = { currentTarget: control, stopPropagation: vi.fn() }
    messages.closeToast.mockImplementationOnce(() => {
      expect(document.activeElement).toBe(origin)
      expect(event.stopPropagation).toHaveBeenCalledOnce()
    })
    act(() => {
      renderer!.root
        .findByProps({ "aria-label": "Close notification" })
        .props.onClick(event)
    })
    expect(origin.focus).toHaveBeenCalledOnce()
    expect(messages.closeToast).toHaveBeenCalledWith(event)
    expect(messages.dismiss).not.toHaveBeenCalled()
  })

  it.each(["no shortcut", "left notification", "disconnected origin"])(
    "closes without restoring focus for %s",
    (scenario) => {
      const { press, origin, control, moveFocus } = mountNotifications()
      if (scenario !== "no shortcut") press()
      if (scenario === "left notification") moveFocus({ closest: () => null })
      if (scenario === "disconnected origin") origin.isConnected = false
      const event = { currentTarget: control, stopPropagation: vi.fn() }
      act(() => {
        renderer!.root
          .findByProps({ "aria-label": "Close notification" })
          .props.onClick(event)
      })
      expect(origin.focus).not.toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalledOnce()
      expect(messages.closeToast).toHaveBeenCalledWith(event)
    },
  )

  it("does not steal focus after the user leaves the notification", () => {
    const { press, origin, moveFocus } = mountNotifications()
    press()
    moveFocus({ closest: () => null })
    toast.dismiss("sso-refresh-failed")
    expect(origin.focus).not.toHaveBeenCalled()
    expect(messages.dismiss).toHaveBeenCalledWith("sso-refresh-failed")
  })

  it("does not move focus when a different toast is dismissed", () => {
    const { press, origin } = mountNotifications()
    press()
    toast.dismiss("another-toast")
    expect(origin.focus).not.toHaveBeenCalled()
  })

  it("does not restore a disconnected originating control", () => {
    const { press, origin } = mountNotifications()
    press()
    origin.isConnected = false
    toast.dismiss("sso-refresh-failed")
    expect(origin.focus).not.toHaveBeenCalled()
    expect(messages.dismiss).toHaveBeenCalledWith("sso-refresh-failed")
  })

  it("matches numeric toast IDs to the focused DOM toast", () => {
    const { press, origin, notification } = mountNotifications()
    notification.id = "42"
    press()
    toast.dismiss(42)
    expect(origin.focus).toHaveBeenCalledOnce()
  })

  it("removes the keyboard listener on unmount", () => {
    const { removeEventListener, onKeyDown } = mountNotifications()
    act(() => renderer!.unmount())
    expect(removeEventListener).toHaveBeenCalledWith("keydown", onKeyDown)
    renderer = undefined
  })
})
