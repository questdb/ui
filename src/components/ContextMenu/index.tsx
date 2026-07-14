import React from "react"
import styled from "styled-components"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import {
  menuContainerStyles,
  menuItemStyles,
  MenuItemIcon,
} from "../menuStyles"

const StyledContent = styled(ContextMenuPrimitive.Content)`
  ${menuContainerStyles}
`

const StyledItem = styled(ContextMenuPrimitive.Item)`
  ${menuItemStyles}
`

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger

export const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  ContextMenuPrimitive.ContextMenuContentProps
>((props, forwardedRef) => (
  <ContextMenuPrimitive.Portal>
    <StyledContent {...props} ref={forwardedRef} />
  </ContextMenuPrimitive.Portal>
))

type MenuItemProps = ContextMenuPrimitive.ContextMenuItemProps & {
  icon?: React.ReactNode
}

export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
  ({ children, icon, ...props }, forwardedRef) => (
    <StyledItem {...props} ref={forwardedRef}>
      {icon && <MenuItemIcon>{icon}</MenuItemIcon>}
      {children}
    </StyledItem>
  ),
)
