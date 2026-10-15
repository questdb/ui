import React, { useEffect, useRef } from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as rtToast,
  Slide,
  ToastOptions as RTToastOptions,
  ToastContent,
  Id,
} from "react-toastify"
import { useNotificationCenter as RTNotificationCenter } from "react-toastify/addons/use-notification-center"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import { CloseCircle, ErrorWarning, Information } from "../icons"
import { CheckmarkOutline } from "../icons"
import { useTheme } from "styled-components"

import "react-toastify/dist/ReactToastify.css"
import "../../styles/_toast.scss"

type StyledIconProps = {
  size?: number | string
  title?: string | null
} & React.PropsWithRef<React.SVGProps<SVGSVGElement>>

export type ToastOptions = RTToastOptions

export const useNotificationCenter = RTNotificationCenter
export const NOTIFICATION_SHORTCUT = "Alt+N"

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
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.code !== "KeyN" && event.key.toLowerCase() !== "n")
      )
        return
      // Follow the warning's close-dialog-first instruction rather than
      // attempting to move focus outside the active modal's focus scope.
      if (
        document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
      )
        return
      const control = region.current?.querySelector<HTMLButtonElement>(
        ".Toastify__toast button",
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
    closeButton: true,
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
      aria-keyshortcuts={NOTIFICATION_SHORTCUT}
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
    >
      <RTToastContainer {...mergedProps} />
    </div>
  )
}
