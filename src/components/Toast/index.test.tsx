import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../theme"
import {
  ToastContainer as RTToastContainer,
  type ToastContainerProps,
  type ToastContent,
  type ToastOptions,
  type ToastTransitionProps,
  type Id,
} from "react-toastify"

const messages = vi.hoisted(() => ({
  info: vi.fn<[ToastContent, ToastOptions?], Id>(),
  success: vi.fn<[ToastContent, ToastOptions?], Id>(),
  warning: vi.fn<[ToastContent, ToastOptions?], Id>(),
  error: vi.fn<[ToastContent, ToastOptions?], Id>(),
  dismiss: vi.fn(),
  closeToast: vi.fn(),
  isIn: true,
  nodeRef: { current: null as HTMLElement | null },
}))
vi.mock("react-toastify", () => ({
  toast: { ...messages, isActive: vi.fn() },
  ToastContainer: ({
    closeButton,
    theme,
    transition: Transition,
  }: ToastContainerProps) => (
    <>
      {typeof closeButton === "function"
        ? closeButton({
            closeToast: messages.closeToast,
            type: "error",
            theme: theme ?? "light",
          })
        : null}
      {Transition && (
        <Transition
          isIn={messages.isIn}
          nodeRef={messages.nodeRef}
          done={vi.fn()}
          position="top-right"
          preventExitTransition={false}
        />
      )}
    </>
  ),
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
const platformState = vi.hoisted(() => ({
  isMacintosh: false,
  isWindows: false,
  isIOS: false,
  isLinux: false,
}))
vi.mock("../../utils/platform", () => ({
  platform: platformState,
  altOption: "Alt",
  ctrlCmd: "Ctrl",
}))
import { NOTIFICATION_SHORTCUT, ToastContainer, toast } from "."

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  messages.isIn = true
  messages.nodeRef.current = null
  platformState.isMacintosh = false
  platformState.isIOS = false
})

// Looks like a focused text field, editor or other text-entry element.
const textEntry = { closest: () => ({}) } as unknown as EventTarget

const mountNotifications = (props?: ToastContainerProps) => {
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
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  }
  const querySelector = notification.querySelector.mockImplementation(
    (selector: string) => (selector === ".Toastify__toast-body" ? control : {}),
  )
  const notifications = [notification]
  const querySelectorAll = vi.fn(() => notifications)
  const contains = (element: unknown) =>
    notifications.some(
      (item) => item.querySelector(".Toastify__toast-body") === element,
    )
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
  const tree = () => (
    <ThemeProvider theme={darkTheme}>
      <ToastContainer {...props} />
    </ThemeProvider>
  )
  messages.nodeRef.current = notification as unknown as HTMLElement
  act(() => {
    renderer = create(tree(), {
      createNodeMock: () => ({ querySelectorAll, contains }),
    })
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
      stopPropagation: vi.fn(),
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
    exitNotification: () => {
      act(() => {
        messages.isIn = false
        renderer!.update(tree())
      })
    },
    addNotification: (id: string) => {
      const next = { id, querySelector: vi.fn() }
      const nextControl = {
        closest: vi.fn((selector: string) =>
          selector === ".Toastify__toast" ? next : null,
        ),
        focus: vi.fn(() => {
          activeElement = nextControl
        }),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
      }
      next.querySelector.mockImplementation((selector: string) =>
        selector === ".Toastify__toast-body" ? nextControl : {},
      )
      notifications.push(next)
      return nextControl
    },
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
  it("focuses and advertises Alt+N on the message, never a destructive action", () => {
    const { press, focus, control } = mountNotifications()
    expect(
      renderer!.root.findByProps({ "aria-label": "Close notification" }).props[
        "aria-keyshortcuts"
      ],
    ).toBeUndefined()
    expect(NOTIFICATION_SHORTCUT).toBe("Alt+N")
    const event = press()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(control.setAttribute).toHaveBeenCalledWith("tabindex", "-1")
    expect(control.setAttribute).toHaveBeenCalledWith(
      "aria-keyshortcuts",
      NOTIFICATION_SHORTCUT,
    )
    expect(focus).toHaveBeenCalledOnce()
  })

  // Windows and Linux Alt+N types nothing, whatever the layout's letter is.
  it.each([{ key: "Dead", keyCode: 229 }, { key: "˜" }, { key: "т" }])(
    "handles the physical Alt+N key in text fields off Apple platforms for %j",
    (shape) => {
      const { press, focus } = mountNotifications()
      const event = press({ ...shape, target: textEntry })
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(event.stopPropagation).toHaveBeenCalledOnce()
      expect(focus).toHaveBeenCalledOnce()
    },
  )

  describe.each(["isMacintosh", "isIOS"] as const)("when %s", (flag) => {
    beforeEach(() => {
      platformState[flag] = true
    })

    // Option+N is the US/ABC dead key for ñ/ã/õ and types ń on Polish Pro.
    it.each([
      { key: "Dead", keyCode: 229 },
      { key: "ń" },
      { key: "˜" },
      { key: "n" },
    ])("leaves Option+N to a text field for %j", (shape) => {
      const { press, focus } = mountNotifications()
      const event = press({ ...shape, target: textEntry })
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(event.stopPropagation).not.toHaveBeenCalled()
      expect(focus).not.toHaveBeenCalled()
    })

    it("leaves Option+N to a focused contenteditable element", () => {
      const { press, focus, moveFocus } = mountNotifications()
      moveFocus({ isContentEditable: true, closest: () => null })
      expect(
        press({ key: "Dead", keyCode: 229 }).preventDefault,
      ).not.toHaveBeenCalled()
      expect(focus).not.toHaveBeenCalled()
    })

    it("recognizes text inputs, text areas and editors, not other controls", () => {
      const { press } = mountNotifications()
      const closest = vi.fn<[string], null>().mockReturnValue(null)
      press({ key: "Dead", target: { closest } as unknown as EventTarget })
      const selector = closest.mock.calls[0][0]
      expect(selector.split(", ")).toEqual(
        expect.arrayContaining([
          "textarea",
          'input[type="text"]',
          '[contenteditable]:not([contenteditable="false"])',
          ".monaco-editor",
        ]),
      )
      expect(selector).not.toContain("checkbox")
    })

    it("still focuses the notification from outside text fields", () => {
      const { press, focus, control } = mountNotifications()
      const event = press({ key: "Dead", keyCode: 229 })
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(event.stopPropagation).toHaveBeenCalledOnce()
      expect(focus).toHaveBeenCalledOnce()
      expect(control.setAttribute).toHaveBeenCalledWith(
        "aria-keyshortcuts",
        NOTIFICATION_SHORTCUT,
      )
    })
  })

  it("Escape returns to the origin without dismissing the message", () => {
    const { press, origin } = mountNotifications()
    press()
    expect(
      press({ key: "Escape", code: "Escape", altKey: false }).preventDefault,
    ).toHaveBeenCalledOnce()
    expect(origin.focus).toHaveBeenCalledOnce()
    expect(messages.dismiss).not.toHaveBeenCalled()
  })

  it("leaves only the Toastify body as a live region", () => {
    mountNotifications()
    expect(
      renderer!.root.findByProps({ role: "region" }).props["aria-live"],
    ).toBe("off")
  })

  it.each([
    { key: "t", code: "KeyT" },
    { altKey: false },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
    { isComposing: true },
  ])("does not consume unrelated or handled keys %j", (event) => {
    const { press, focus } = mountNotifications()
    expect(press(event).preventDefault).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it.each(["ń", "~", "˜"])(
    "preserves composing %s in editable controls",
    (key) => {
      const { press, focus } = mountNotifications()
      const target = { closest: () => ({}) } as unknown as EventTarget
      expect(
        press({ key, target, isComposing: true }).preventDefault,
      ).not.toHaveBeenCalled()
      expect(focus).not.toHaveBeenCalled()
    },
  )

  it("prioritizes the renewal warning and skips closing notifications", () => {
    const { press, focus, notifications } = mountNotifications()
    const olderFocus = vi.fn()
    notifications.unshift({
      id: "older",
      querySelector: vi.fn((selector: string) =>
        selector === ".Toastify__toast-body"
          ? {
              focus: olderFocus,
              closest: () => null,
              setAttribute: vi.fn(),
              removeAttribute: vi.fn(),
            }
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

  it.each([true, false])(
    "does not restore focus just because onClick fires (container closeOnClick=%s)",
    (closeOnClick) => {
      const onClick = vi.fn()
      const { press, origin, notification, exitNotification } =
        mountNotifications({ onClick, closeOnClick })
      press()
      const event = { currentTarget: notification }
      renderer!.root.findByType(RTToastContainer).props.onClick(event)
      expect(onClick).toHaveBeenCalledWith(event)
      expect(origin.focus).not.toHaveBeenCalled()
      // Toastify starts an exit only when its effective options dismiss it.
      if (closeOnClick) {
        exitNotification()
        expect(origin.focus).toHaveBeenCalledOnce()
      }
    },
  )

  it.each(["info", "success", "warning", "error"] as const)(
    "preserves per-%s handlers without restoring focus on non-dismissible clicks",
    (type) => {
      const { press, origin, notification } = mountNotifications()
      press()
      const onClick = vi.fn()
      toast[type]("Message", { onClick, closeOnClick: false })
      const event = { currentTarget: notification }
      messages[type].mock.lastCall![1]!.onClick!(
        event as unknown as React.MouseEvent,
      )
      expect(onClick).toHaveBeenCalledWith(event)
      expect(origin.focus).not.toHaveBeenCalled()
    },
  )

  it("preserves a custom container transition and its identity on re-render", () => {
    const transition = vi.fn<[ToastTransitionProps], null>(() => null)
    const { press, origin, exitNotification } = mountNotifications({
      transition,
    })
    const wrapped = renderer!.root.findByType(RTToastContainer).props
      .transition as ToastContainerProps["transition"]
    expect(transition.mock.lastCall![0].isIn).toBe(true)
    press()
    exitNotification()
    expect(origin.focus).toHaveBeenCalledOnce()
    expect(transition.mock.lastCall![0].isIn).toBe(false)
    expect(renderer!.root.findByType(RTToastContainer).props.transition).toBe(
      wrapped,
    )
  })

  it.each(["info", "success", "warning", "error"] as const)(
    "restores focus on exit with a custom per-%s transition",
    (type) => {
      const { press, origin } = mountNotifications()
      const transition = vi.fn<[ToastTransitionProps], null>(() => null)
      toast[type]("Message", { transition })
      const Transition = messages[type].mock.lastCall![1]!.transition!
      const props: ToastTransitionProps = {
        isIn: true,
        nodeRef: messages.nodeRef,
        done: vi.fn(),
        position: "top-right",
        preventExitTransition: false,
      }
      let customRenderer!: ReactTestRenderer
      act(() => {
        customRenderer = create(<Transition {...props} />)
      })
      try {
        press()
        expect(origin.focus).not.toHaveBeenCalled()
        act(() => customRenderer.update(<Transition {...props} isIn={false} />))
        expect(origin.focus).toHaveBeenCalledOnce()
        expect(transition.mock.lastCall![0]).toMatchObject({
          ...props,
          isIn: false,
        })
      } finally {
        act(() => customRenderer.unmount())
      }
    },
  )

  it("does not restore focus on exit after the user leaves the notification", () => {
    const { press, origin, moveFocus, exitNotification } = mountNotifications()
    press()
    moveFocus({ closest: () => null })
    exitNotification()
    expect(origin.focus).not.toHaveBeenCalled()
  })

  it("retains the container click handler when toast options do not override it", () => {
    const onClick = vi.fn()
    mountNotifications({ onClick })
    toast.success("Message", { autoClose: false })
    expect(messages.success.mock.lastCall![1]).not.toHaveProperty("onClick")
    expect(renderer!.root.findByType(RTToastContainer).props.onClick).toBe(
      onClick,
    )
  })

  it.each(["Escape", "Close", "dismiss"])(
    "carries the external origin across notifications for %s",
    (action) => {
      const { press, origin, notification, addNotification } =
        mountNotifications()
      notification.id = "first"
      press()
      const nextControl = addNotification("second")
      press()
      expect(nextControl.focus).toHaveBeenCalledOnce()
      if (action === "Escape") {
        press({ key: "Escape", code: "Escape", altKey: false })
      } else if (action === "Close") {
        act(() => {
          renderer!.root
            .findByProps({ "aria-label": "Close notification" })
            .props.onClick({
              currentTarget: nextControl,
              stopPropagation: vi.fn(),
            })
        })
      } else {
        toast.dismiss("second")
      }
      expect(origin.focus).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(origin)
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
    expect(removeEventListener).toHaveBeenCalledWith("keydown", onKeyDown, true)
    renderer = undefined
  })
})

describe("notification shortcut instructions", () => {
  it.each([
    [false, ""],
    [true, " outside a text field"],
  ])("scope the shortcut when Apple platform is %s", async (apple, scope) => {
    platformState.isMacintosh = apple
    vi.resetModules()
    const { NOTIFICATION_SHORTCUT_SCOPE } = await import(".")
    expect(NOTIFICATION_SHORTCUT_SCOPE).toBe(scope)
  })
})
