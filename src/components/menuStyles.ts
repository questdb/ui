import styled, { css } from "styled-components"
import { floatingSurfaceStyles } from "./overlayStyles"

export const menuContainerStyles = css`
  ${floatingSurfaceStyles}
  padding: 0.8rem 0.4rem;
  z-index: 9999;
  min-width: 16rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`

export const menuItemStyles = css`
  font-size: 1.4rem;
  line-height: 1.5;
  cursor: pointer;
  color: ${({ theme }) => theme.color.contentPrimary};
  display: flex;
  gap: 0.6rem;
  align-items: center;
  min-height: 3.2rem;
  padding: 0.5rem 0.8rem;
  border-radius: 0.4rem;
  user-select: none;
  outline: none;

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.interactionHover};
  }

  &[data-disabled] {
    opacity: 0.5;
    pointer-events: none;
  }
`

// Normalises every menu item icon to 16px regardless of the icon's own size prop.
export const MenuItemIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 1.6rem;
    height: 1.6rem;
  }
`

export const MenuItemBody = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`

export const MenuItemSubtitle = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`
