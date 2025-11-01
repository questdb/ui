import React from 'react'
import styled from 'styled-components'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'

const StyledContent = styled(ContextMenuPrimitive.Content)`
  background-color: #343846; /* vscode-menu-background */
  border-radius: 0.5rem;
  padding: 0.4rem;
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36); /* vscode-widget-shadow */
  z-index: 9999;
  min-width: 160px;
`

const StyledItem = styled(ContextMenuPrimitive.Item)`
  font-size: 1.3rem;
  height: 3rem;
  font-family: "system-ui", sans-serif;
  cursor: pointer;
  color: rgb(248, 248, 242); /* vscode-menu-foreground */
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-radius: 0.4rem;
  border: 1px solid transparent;

  &[data-highlighted] {
    background: #043c5c;
    border: 1px solid #8be9fd;
  }

  &[data-disabled] {
    opacity: 0.5;
    pointer-events: none;
  }
`

const IconWrapper = styled.span`
  margin-right: 1.2rem;
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
  )
)
