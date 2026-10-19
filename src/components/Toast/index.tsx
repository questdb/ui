import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as rtToast,
  Slide,
  ToastOptions as RTToastOptions,
  ToastContent,
  Id,
  type CloseButtonProps,
  type ToastTransition,
  type ToastTransitionProps,
} from "react-toastify"
import { XIcon } from "@phosphor-icons/react"
import { useNotificationCenter as RTNotificationCenter } from "react-toastify/addons/use-notification-center"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import { CloseCircle, ErrorWarning, Information } from "../icons"
import { CheckmarkOutline } from "../icons"
import { useTheme } from "styled-components"
import { ButtonBase } from "../Button/ButtonBase"
import { altOption, platform } from "../../utils/platform"
import { themeVar } from "../../theme/themeVar"
import {
  notificationFocusOrigins,
  restoreNotificationFocus,
} from "./notificationFocus"

import "react-toastify/dist/ReactToastify.css"
import "../../styles/_toast.scss"

type StyledIconProps = {
  size?: number | string
  title?: string | null
} & React.PropsWithRef<React.SVGProps<SVGSVGElement>>

export type ToastOptions = RTToastOptions

export const useNotificationCenter = RTNotificationCenter
export const REFRESH_FAILED_TOAST_ID = "sso-refresh-failed"
export const NOTIFICATION_SHORTCUT = "Alt+N"
export const NOTIFICATION_SHORTCUT_LABEL = `${altOption === "Alt" ? "Alt+" : altOption}N`

// Option is a text modifier on Apple keyboards: Option+N is the dead key for
// ñ/ã/õ on US/ABC layouts and types ń on Polish Pro. Windows and Linux Alt+N
// types nothing, so there the physical N key works on every layout.
const optionTypesText = () => platform.isMacintosh || platform.isIOS

// Where the shortcut works, for instructions that follow the shortcut label.
export const NOTIFICATION_SHORTCUT_SCOPE = optionTypesText()
  ? " outside a text field"
  : ""

const TEXT_ENTRY_SELECTOR = [
  "textarea",
  "input:not([type])",
  ...["text", "search", "email", "url", "tel", "password", "number"].map(
    (type) => `input[type="${type}"]`,
  ),
  '[contenteditable]:not([contenteditable="false"])',
  // Monaco's input element differs between versions (textarea, EditContext).
  ".monaco-editor",
].join(", ")

const isTextEntry = (target: unknown) => {
  const element = target as Partial<HTMLElement> | null | undefined
  return (
    element?.isContentEditable === true ||
    !!element?.closest?.(TEXT_ENTRY_SELECTOR)
  )
}

export const ToastIcon = ({
  type,
  size = 18,
  ...props
}: StyledIconProps & {
  type: BadgeType
}) => {
  const theme = useTheme()

  switch (type) {
    case BadgeType.SUCCESS:
      return (
        <CheckmarkOutline
          {...props}
          size={size}
          color={theme.color.statusSuccess}
        />
      )
    case BadgeType.WARNING:
      return (
        <ErrorWarning
          {...props}
          size={size}
          color={theme.color.statusWarning}
        />
      )
    case BadgeType.ERROR:
      return (
        <CloseCircle {...props} size={size} color={theme.color.statusDanger} />
      )
    case BadgeType.INFO:
    default:
      return (
        <Information {...props} size={size} color={theme.color.statusInfo} />
      )
  }
}

// Toastify invokes onClick even when closeOnClick is false. Restore only
// when an actual exit starts, while the focused notification is still mounted.
const focusRestoringTransition = (Transition: ToastTransition) => {
  const NotificationTransition = (props: ToastTransitionProps) => {
    const { isIn, nodeRef } = props
    useLayoutEffect(() => {
      if (!isIn && nodeRef.current) restoreNotificationFocus(nodeRef.current.id)
    }, [isIn, nodeRef])
    return <Transition {...props} />
  }
  return NotificationTransition
}

const withNotificationFocus = (options?: ToastOptions) =>
  options?.transition
    ? { ...options, transition: focusRestoringTransition(options.transition) }
    : options

const ToastCloseButton = ({
  closeToast,
  theme,
  ariaLabel = "Close notification",
}: CloseButtonProps) => (
  <ButtonBase
    className={`Toastify__close-button Toastify__close-button--${theme}`}
    aria-label={ariaLabel}
    onClick={(event) => {
      event.stopPropagation()
      const notification =
        event.currentTarget.closest<HTMLElement>(".Toastify__toast")
      if (notification) restoreNotificationFocus(notification.id)
      closeToast(event)
    }}
  >
    <XIcon size={14} aria-hidden="true" />
  </ButtonBase>
)

const toast = {
  info: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.info(content, {
      icon: <ToastIcon type={BadgeType.INFO} />,
      className: "toast-info-container",
      progressStyle: {
        background: themeVar("statusInfo"),
      },
      style: {
        borderColor: themeVar("statusInfo"),
        background: themeVar("surfaceRaised"),
        color: themeVar("contentPrimary"),
      },
      ...withNotificationFocus(options),
    })
  },
  success: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.success(content, {
      icon: <ToastIcon type={BadgeType.SUCCESS} />,
      className: "toast-success-container",
      progressStyle: {
        background: themeVar("statusSuccess"),
      },
      style: {
        borderColor: themeVar("statusSuccess"),
        background: themeVar("surfaceRaised"),
        color: themeVar("contentPrimary"),
      },
      ...withNotificationFocus(options),
    })
  },
  warning: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.warning(content, {
      icon: <ToastIcon type={BadgeType.WARNING} />,
      className: "toast-warning-container",
      progressStyle: {
        background: themeVar("statusWarning"),
      },
      style: {
        borderColor: themeVar("statusWarning"),
        background: themeVar("surfaceRaised"),
        color: themeVar("contentPrimary"),
      },
      ...withNotificationFocus(options),
    })
  },
  error: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.error(content, {
      icon: <ToastIcon type={BadgeType.ERROR} />,
      progressStyle: {
        background: themeVar("statusDanger"),
      },
      className: "toast-error-container",
      style: {
        borderColor: themeVar("statusDanger"),
        background: themeVar("surfaceRaised"),
        color: themeVar("contentPrimary"),
      },
      ...withNotificationFocus(options),
    })
  },
  dismiss: (id?: Id) => {
    restoreNotificationFocus(id)
    rtToast.dismiss(id)
  },
  isActive: rtToast.isActive,
}

export { toast }

export const ToastContainer = (props?: ToastContainerProps) => {
  const theme = useTheme()
  const region = useRef<HTMLDivElement>(null)
  const transition = useMemo(
    () => focusRestoringTransition(props?.transition ?? Slide),
    [props?.transition],
  )
  useEffect(() => {
    let shortcutTarget: HTMLElement | undefined
    const focusNotification = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        region.current?.contains(document.activeElement)
      ) {
        const notification =
          document.activeElement?.closest<HTMLElement>(".Toastify__toast")
        const origin =
          notification && notificationFocusOrigins.get(notification)
        if (origin?.isConnected) {
          event.preventDefault()
          event.stopPropagation()
          origin.focus()
        }
        return
      }
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== "KeyN" && event.key.toLowerCase() !== "n")
      )
        return
      // Never take a typed character: on Apple platforms Option+N in a text
      // field must reach the field. Outside text fields it types nothing.
      if (
        optionTypesText() &&
        (isTextEntry(event.target) || isTextEntry(document.activeElement))
      )
        return
      // Follow the warning's close-dialog-first instruction rather than
      // attempting to move focus outside the active modal's focus scope.
      if (
        document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
      )
        return
      // Only active toasts retain a live role while Toastify animates exits.
      // Prefer the persistent warning over older, short-lived notifications.
      const notifications = Array.from(
        region.current?.querySelectorAll<HTMLElement>(".Toastify__toast") ?? [],
      ).filter((notification) =>
        notification.querySelector('[role="alert"], [role="status"]'),
      )
      const notification =
        notifications.find((item) => item.id === REFRESH_FAILED_TOAST_ID) ??
        notifications[notifications.length - 1]
      // Focus the message, not an unexplained destructive Close/Sign-in action.
      const control = notification?.querySelector<HTMLElement>(
        ".Toastify__toast-body",
      )
      if (notification && control) {
        const activeElement = document.activeElement as HTMLElement | null
        const previousNotification =
          activeElement?.closest<HTMLElement>(".Toastify__toast")
        // When moving between notifications, carry the original external
        // control forward rather than losing it or returning to another toast.
        const origin = region.current?.contains(activeElement)
          ? previousNotification &&
            notificationFocusOrigins.get(previousNotification)
          : activeElement
        if (origin && typeof origin.focus === "function") {
          notificationFocusOrigins.set(notification, origin)
        }
        if (shortcutTarget !== control)
          shortcutTarget?.removeAttribute("aria-keyshortcuts")
        shortcutTarget = control
        control.setAttribute("tabindex", "-1")
        control.setAttribute("aria-keyshortcuts", NOTIFICATION_SHORTCUT)
        event.preventDefault()
        event.stopPropagation()
        control.focus()
      }
    }
    // Capture so the shortcut runs before focused widgets handle Alt+N. Apple
    // text fields keep Option+N for typing, IME composition is ignored, and no
    // key is consumed without a toast.
    document.addEventListener("keydown", focusNotification, true)
    return () => {
      document.removeEventListener("keydown", focusNotification, true)
      shortcutTarget?.removeAttribute("aria-keyshortcuts")
    }
  }, [])
  const mergedProps: ToastContainerProps = {
    autoClose: 3000,
    draggable: false,
    position: "top-right",
    theme: theme.mode,
    hideProgressBar: false,
    closeButton: ToastCloseButton,
    closeOnClick: true,
    pauseOnHover: true,
    pauseOnFocusLoss: false,
    ...props,
    transition,
  }

  // Modal dialogs hide the rest of the page from assistive technology, except
  // elements with aria-live. Keep that exemption, but let the inner Toastify
  // role="alert" bodies do the announcing (not two nested live regions).
  // This wrapper must exist before a dialog opens.
  return (
    <div
      ref={region}
      role="region"
      aria-label="Notifications"
      aria-live="off"
      aria-atomic="false"
      aria-relevant="additions text"
    >
      <RTToastContainer {...mergedProps} />
    </div>
  )
}
