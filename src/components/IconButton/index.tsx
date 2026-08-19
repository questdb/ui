import React from "react"
import styled from "styled-components"

import { Button, ButtonProps, Size } from "../Button"
import { Tooltip } from "../Tooltip"

export type IconButtonProps = Omit<
  ButtonProps,
  "children" | "prefixIcon" | "leadingIcon" | "trailingIcon" | "rounded"
> & {
  children: React.ReactNode
  label: string
  tooltip?: string
}

const dimensions: Record<Size, string> = {
  sm: "2.8rem",
  md: "3.4rem",
  lg: "4rem",
}

const Root = styled(Button)<{ size?: Size }>`
  width: ${({ size = "md" }) => dimensions[size]};
  min-width: ${({ size = "md" }) => dimensions[size]};
  padding: 0;
  flex-shrink: 0;

  svg {
    display: block;
  }
`

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltip, variant = "ghost", size = "md", ...props }, ref) => {
    const button = (
      <Root
        {...props}
        ref={ref}
        variant={variant}
        size={size}
        aria-label={label}
      />
    )

    return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button
  },
)

IconButton.displayName = "IconButton"
