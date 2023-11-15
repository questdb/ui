import React, { ReactNode } from "react"
import { PopperHover, Tooltip, Placement } from "../"

type Props = {
  icon: ReactNode
  tooltip: string
  placement: Placement
}

export const IconWithTooltip = ({ icon, tooltip, placement }: Props) => (
  <PopperHover placement={placement} trigger={icon}>
    <Tooltip>{tooltip}</Tooltip>
  </PopperHover>
)
