import React from "react"
import { PopperHover } from "../components"
import { Tooltip } from "../components"

type Props = Omit<
  React.ComponentProps<typeof PopperHover>,
  "children" | "trigger"
>

export const withTooltip = (
  trigger: React.ReactNode,
  content: React.ReactNode,
  options?: Partial<Props>,
) => {
  return (
    <PopperHover trigger={trigger} {...options}>
      <Tooltip>{content}</Tooltip>
    </PopperHover>
  )
}
