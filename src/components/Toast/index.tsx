import React, { useEffect, useRef } from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as rtToast,
  Slide,
  ToastOptions as RTToastOptions,
  ToastContent,
  Id,
  type CloseButtonProps,
} from "react-toastify"
import { XIcon } from "@phosphor-icons/react"
import { useNotificationCenter as RTNotificationCenter } from "react-toastify/addons/use-notification-center"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import { CloseCircle, ErrorWarning, Information } from "../icons"
import { CheckmarkOutline } from "../icons"
import { useTheme } from "styled-components"
import { ButtonBase } from "../Button/ButtonBase"
import { altOption } from "../../utils/platform"

import "react-toastify/dist/ReactToastify.css"
import "../../styles/_toast.scss"

type StyledIconProps = {
  size?: number | string
  title?: string | null
} & React.PropsWithRef<React.SVGProps<SVGSVGElement>>

export type ToastOptions = RTToastOptions

export const useNotificationCenter = RTNotificationCenter
export const NOTIFICATION_SHORTCUT = "Alt+N"
export const NOTIFICATION_SHORTCUT_LABEL = `${altOption === "Alt" ? "Alt+" : altOption}N`

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

// Weak keys let removed toast DOM (and its saved origin) be collected. Only
// shortcut-driven focus moves establish an origin; ordinary tabbing does not.
const notificationFocusOrigins = new WeakMap<HTMLElement, HTMLElement>()

const restoreNotificationFocus = (id?: Id) => {
  const notification =
    typeof document === "undefined"
      ? null
      : document.activeElement?.closest<HTMLElement>(".Toastify__toast")
  const origin = notification && notificationFocusOrigins.get(notification)
  if (
    notification &&
    (id === undefined || notification.id === String(id)) &&
    origin?.isConnected
  ) {
    // Toastify's onClose runs after removal, when focus has already fallen
    // to body. Restore before dismissal, but only while this toast owns focus.
    origin.focus()
  }
}

const ToastCloseButton = ({
  closeToast,
  theme,
  ariaLabel = "Close notification",
}: CloseButtonProps) => (
  <ButtonBase
    className={`Toastify__close-button Toastify__close-button--${theme}`}
    aria-label={ariaLabel}
    aria-keyshortcuts={NOTIFICATION_SHORTCUT}
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
        background: "var(--qdb-color-statusInfo)",
      },
      style: {
        borderColor: "var(--qdb-color-statusInfo)",
        background: "var(--qdb-color-surfaceRaised)",
        color: "var(--qdb-color-contentPrimary)",
      },
      ...options,
    })
  },
  success: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.success(content, {
      icon: <ToastIcon type={BadgeType.SUCCESS} />,
      className: "toast-success-container",
      progressStyle: {
        background: "var(--qdb-color-statusSuccess)",
      },
      style: {
        borderColor: "var(--qdb-color-statusSuccess)",
        background: "var(--qdb-color-surfaceRaised)",
        color: "var(--qdb-color-contentPrimary)",
      },
      ...options,
    })
  },
  warning: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.warning(content, {
      icon: <ToastIcon type={BadgeType.WARNING} />,
      className: "toast-warning-container",
      progressStyle: {
        background: "var(--qdb-color-statusWarning)",
      },
      style: {
        borderColor: "var(--qdb-color-statusWarning)",
        background: "var(--qdb-color-surfaceRaised)",
        color: "var(--qdb-color-contentPrimary)",
      },
      ...options,
    })
  },
  error: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.error(content, {
      icon: <ToastIcon type={BadgeType.ERROR} />,
      progressStyle: {
        background: "var(--qdb-color-statusDanger)",
      },
      className: "toast-error-container",
      style: {
        borderColor: "var(--qdb-color-statusDanger)",
        background: "var(--qdb-color-surfaceRaised)",
        color: "var(--qdb-color-contentPrimary)",
      },
      ...options,
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
  useEffect(() => {
    const focusNotification = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === "Dead" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== "KeyN" && event.key.toLowerCase() !== "n")
      )
        return
      const target = event.target as HTMLElement | null
      if (
        event.key.toLowerCase() !== "n" &&
        target?.closest(
          'input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        )
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
        notifications.find((item) => item.id === "sso-refresh-failed") ??
        notifications[notifications.length - 1]
      const control = notification?.querySelector<HTMLButtonElement>(
        ".Toastify__close-button",
      )
      if (control) {
        const notification = control.closest<HTMLElement>(".Toastify__toast")
        const origin = document.activeElement as HTMLElement | null
        if (
          notification &&
          origin &&
          typeof origin.focus === "function" &&
          !region.current?.contains(origin)
        ) {
          notificationFocusOrigins.set(notification, origin)
        }
        event.preventDefault()
        control.focus()
      }
    }
    document.addEventListener("keydown", focusNotification)
    return () => document.removeEventListener("keydown", focusNotification)
  }, [])
  const mergedProps: ToastContainerProps = {
    autoClose: 3000,
    draggable: false,
    position: "top-right",
    theme: theme.mode,
    transition: Slide,
    hideProgressBar: false,
    closeButton: ToastCloseButton,
    closeOnClick: true,
    pauseOnHover: true,
    pauseOnFocusLoss: false,
    ...props,
  }

  // Modal dialogs hide the rest of the page from assistive technology, except
  // live regions. This region, the container markup of later react-toastify
  // versions, keeps warnings such as an SSO refresh failure announced while a
  // dialog is open. It must exist before the dialog opens.
  return (
    <div
      ref={region}
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
    >
      <RTToastContainer {...mergedProps} />
    </div>
  )
}
