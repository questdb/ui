import React from "react"
import { CopySimpleIcon } from "@phosphor-icons/react"

export const CopyCommand = ({
  size = 16,
  color = "currentColor",
}: {
  size?: number | string
  color?: string
}) => <CopySimpleIcon size={size} color={color} weight="regular" />
