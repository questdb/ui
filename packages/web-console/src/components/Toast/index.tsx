import React from "react"
import {
  ToastContainer as RTToastContainer,
  ToastContainerProps,
  toast as _toast,
  Slide,
  ToastOptions as RTToastOptions,
} from "react-toastify"
import { useNotificationCenter as RTNotificationCenter } from "react-toastify/addons/use-notification-center"
import { NotificationCenterItem as RNotificationCenterItem } from "react-toastify/addons/use-notification-center/useNotificationCenter"
import { BadgeType } from "../../scenes/Import/ImportCSVFiles/types"
import {
  Check,
  CloseCircle,
  ErrorWarning,
  Information,
} from "styled-icons/remix-line"
import { StyledIconProps } from "@styled-icons/styled-icon"
import { theme } from "../../theme"

export const toast = _toast

export const useNotificationCenter = RTNotificationCenter

export type NotificationCenterItem<Data> = RNotificationCenterItem<Data>

export type ToastOptions = RTToastOptions

export const ToastIcon = ({
  type,
  ...props
}: StyledIconProps & {
  type: BadgeType
}) => {
  switch (type) {
    case BadgeType.SUCCESS:
      return <Check {...props} color={theme.color.green} />
    case BadgeType.WARNING:
      return <ErrorWarning {...props} color={theme.color.orange} />
    case BadgeType.ERROR:
      return <CloseCircle {...props} color={theme.color.red} />
    case BadgeType.INFO:
    default:
      return <Information {...props} color={theme.color.cyan} />
  }
}

export const ToastContainer = (props?: ToastContainerProps) => {
  const mergedProps: ToastContainerProps = {
    autoClose: 3000,
    draggable: false,
    position: "top-right",
    theme: "dark",
    transition: Slide,
    ...props,
  }

  return <RTToastContainer {...mergedProps} />
}
