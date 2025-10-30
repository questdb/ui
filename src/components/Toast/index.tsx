import React from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as rtToast,
  Slide,
  ToastOptions as RTToastOptions,
  ToastContent,
} from "react-toastify"
import { useNotificationCenter as RTNotificationCenter } from "react-toastify/addons/use-notification-center"
import { NotificationCenterItem as RNotificationCenterItem } from "react-toastify/addons/use-notification-center/useNotificationCenter"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import {
  CloseCircle,
  ErrorWarning,
  Information,
} from "@styled-icons/remix-line"
import { CheckmarkOutline } from "@styled-icons/evaicons-outline"
import { theme } from "../../theme"

import "react-toastify/dist/ReactToastify.css"
import "../../styles/_toast.scss"

interface StyledIconProps
  extends React.PropsWithRef<React.SVGProps<SVGSVGElement>> {
  size?: number | string
  title?: string | null
}

export type ToastOptions = RTToastOptions

export const useNotificationCenter = RTNotificationCenter

export type NotificationCenterItem<Data> = RNotificationCenterItem<Data>

export const ToastIcon = ({
  type,
  size = 18,
  ...props
}: StyledIconProps & {
  type: BadgeType
}) => {
  switch (type) {
    case BadgeType.SUCCESS:
      return <CheckmarkOutline {...props} size={size} color={theme.color.green} />
    case BadgeType.WARNING:
      return <ErrorWarning {...props} size={size} color={theme.color.orange} />
    case BadgeType.ERROR:
      return <CloseCircle {...props} size={size} color={theme.color.red} />
    case BadgeType.INFO:
    default:
      return <Information {...props} size={size} color={theme.color.cyan} />
  }
}

const toast = {
  info: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.info(content, {
      icon: <ToastIcon type={BadgeType.INFO} />,
      className: "toast-info-container",
      progressStyle: {
        background: theme.color.cyan,
      },
      style: {
        borderColor: theme.color.cyan,
        background: theme.color.backgroundLighter,
      },
      ...options,
    })
  },
  success: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.success(content, {
      icon: <ToastIcon type={BadgeType.SUCCESS} />,
      className: "toast-success-container",
      progressStyle: {
        background: theme.color.green,
      },
      style: {
        borderColor: theme.color.green,
        background: theme.color.backgroundLighter,
      },
      ...options,
    })
  },
  warning: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.warning(content, {
      icon: <ToastIcon type={BadgeType.WARNING} />,
      className: "toast-warning-container",
      progressStyle: {
        background: theme.color.orange,
      },
      style: {
        borderColor: theme.color.orange,
        background: theme.color.backgroundLighter,
      },
      ...options,
    })
  },
  error: (content: ToastContent, options?: ToastOptions) => {
    return rtToast.error(content, {
      icon: <ToastIcon type={BadgeType.ERROR} />,
      progressStyle: {
        background: theme.color.red,
      },
      className: "toast-error-container",
      style: {
        borderColor: theme.color.red,
        background: theme.color.backgroundLighter,
      },
      ...options,
    })
  },
  dismiss: rtToast.dismiss,
  isActive: rtToast.isActive,
}

export { toast }

export const ToastContainer = (props?: ToastContainerProps) => {
  const mergedProps: ToastContainerProps = {
    autoClose: 3000,
    draggable: false,
    position: "top-right",
    theme: "dark",
    transition: Slide,
    hideProgressBar: false,
    closeButton: true,
    closeOnClick: true,
    pauseOnHover: true,
    pauseOnFocusLoss: false,
    ...props,
  }

  return <RTToastContainer {...mergedProps} />
}
