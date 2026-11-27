import React from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as rtToast,
  Slide,
  ToastOptions as RTToastOptions,
  ToastContent,
} from "react-toastify/unstyled"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import { CloseCircle, ErrorWarning, Information } from "../icons"
import { CheckmarkOutline } from "../icons"
import { useTheme } from "styled-components"
import { getThemeColor } from "../../theme/runtime"

import "react-toastify/dist/ReactToastify.css"
import "../../styles/_toast.scss"

type StyledIconProps = {
  size?: number | string
  title?: string | null
} & React.PropsWithRef<React.SVGProps<SVGSVGElement>>

export type ToastOptions = RTToastOptions

export const REFRESH_FAILED_TOAST_ID = "sso-refresh-failed"

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

const toast = {
  info: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.info(content, {
      icon: <ToastIcon type={BadgeType.INFO} />,
      className: "toast-info-container",
      style: {
        borderColor: getThemeColor("statusInfo"),
        background: getThemeColor("surfaceRaised"),
        color: getThemeColor("contentPrimary"),
      },
      ...options,
    })
  },
  success: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.success(content, {
      icon: <ToastIcon type={BadgeType.SUCCESS} />,
      className: "toast-success-container",
      style: {
        borderColor: getThemeColor("statusSuccess"),
        background: getThemeColor("surfaceRaised"),
        color: getThemeColor("contentPrimary"),
      },
      ...options,
    })
  },
  warning: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.warning(content, {
      icon: <ToastIcon type={BadgeType.WARNING} />,
      className: "toast-warning-container",
      style: {
        borderColor: getThemeColor("statusWarning"),
        background: getThemeColor("surfaceRaised"),
        color: getThemeColor("contentPrimary"),
      },
      ...options,
    })
  },
  error: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.error(content, {
      icon: <ToastIcon type={BadgeType.ERROR} />,
      className: "toast-error-container",
      style: {
        borderColor: getThemeColor("statusDanger"),
        background: getThemeColor("surfaceRaised"),
        color: getThemeColor("contentPrimary"),
      },
      ...options,
    })
  },
  dismiss: rtToast.dismiss,
  isActive: rtToast.isActive,
}

export { toast }

export const ToastContainer = (props?: ToastContainerProps) => {
  const theme = useTheme()
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
    // react-toastify's default Alt+T focuses the toasts, but Alt+T adds an
    // editor tab here. Outside the SQL editor it would move the user's focus.
    // The default label announces that shortcut, so it goes too.
    hotKeys: () => false,
    "aria-label": "Notifications",
    ...props,
  }

  return <RTToastContainer {...mergedProps} />
}
