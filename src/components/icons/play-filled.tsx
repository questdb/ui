import React from "react"
import { PlayIcon } from "@phosphor-icons/react"

type Props = {
  size?: number | string
  color?: string
}

export const PlayFilled = ({ size = 24, color = "currentColor" }: Props) => (
  <PlayIcon size={size} color={color} weight="fill" />
)
