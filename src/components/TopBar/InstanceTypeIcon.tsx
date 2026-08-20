import React from "react"

import type { InstanceType } from "../../utils/questdb/types"
import { Flask, InfoCircle, ShieldCheck, Tools } from "../icons"

type Props = {
  instanceType: InstanceType | undefined
  color?: string
  size?: number
  style?: React.CSSProperties
}

export const InstanceTypeIcon = ({
  instanceType,
  color,
  size = 18,
  style,
}: Props) => {
  switch (instanceType) {
    case "development":
      return <Tools size={size} color={color} style={style} />
    case "production":
      return <ShieldCheck size={size} color={color} style={style} />
    case "testing":
      return <Flask size={size} color={color} style={style} />
    default:
      return <InfoCircle size={size} color={color} style={style} />
  }
}
