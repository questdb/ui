import React, { ReactNode } from "react"
import { PopperHover, TextAlign, Tooltip, Placement } from "../"

type Props = {
  icon: ReactNode
  tooltip: ReactNode
  placement: Placement
  textAlign?: TextAlign
}

export const IconWithTooltip = ({
  icon,
  tooltip,
  placement,
  textAlign,
}: Props) => (
  <PopperHover placement={placement} trigger={icon}>
    <Tooltip textAlign={textAlign}>{tooltip}</Tooltip>
  </PopperHover>
)
