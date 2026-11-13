import React, { ReactNode } from "react"
import { Tooltip, Placement } from "../"

type Props = {
  icon: ReactNode
  tooltip: ReactNode
  placement: Placement
  hoverableContent?: boolean
}

export const IconWithTooltip = ({
  icon,
  tooltip,
  placement,
  hoverableContent,
}: Props) => (
  <Tooltip
    placement={placement}
    content={tooltip}
    hoverableContent={hoverableContent}
  >
    {icon}
  </Tooltip>
)
