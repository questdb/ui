import React, { ReactNode } from "react"
import { Tooltip, Placement } from "../"

type Props = {
  icon: ReactNode
  tooltip: ReactNode
  placement: Placement
}

export const IconWithTooltip = ({ icon, tooltip, placement }: Props) => (
  <Tooltip placement={placement} content={tooltip}>
    {icon}
  </Tooltip>
)
