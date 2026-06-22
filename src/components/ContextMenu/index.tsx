import React from "react"
import styled from "styled-components"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"

const StyledContent = styled(ContextMenuPrimitive.Content)`
  background-color: ${({ theme }) => theme.color.backgroundDarker};
  border-radius: 0.5rem;
  padding: 0.4rem;
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36);
  z-index: 9999;
  min-width: 16rem;
`

const StyledItem = styled(ContextMenuPrimitive.Item)`
  font-size: 1.4rem;
  font-family: "system-ui", sans-serif;
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};
  display: flex;
  gap: 1rem;
  min-height: 3rem;
  align-items: center;
  padding: 0.5rem 1rem;
  border-radius: 0.4rem;

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.tableSelection};
  }

  &[data-disabled] {
    opacity: 0.5;
    pointer-events: none;
  }
`

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
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
      {icon && <IconWrapper>{icon}</IconWrapper>}
      {children}
    </StyledItem>
  ),
)
