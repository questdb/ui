import styled, { css } from "styled-components"

export const menuContainerStyles = css`
  background-color: ${({ theme }) => theme.color.dropdownBackground};
  border-radius: 0.6rem;
  border: 1px solid ${({ theme }) => theme.color.dropdownBorder};
  padding: 0.8rem 0.4rem;
  box-shadow:
    0 0.2rem 0.2rem -0.1rem rgba(10, 13, 18, 0.04),
    0 0.4rem 0.6rem -0.2rem rgba(10, 13, 18, 0.03),
    0 1.2rem 1.6rem -0.4rem rgba(10, 13, 18, 0.08);
  z-index: 9999;
  min-width: 16rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const menuItemStyles = css`
  font-size: 1.4rem;
  line-height: 1.5;
  cursor: pointer;
  color: ${({ theme }) => theme.color.foreground};
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.4rem 0.8rem;
  border-radius: 0.4rem;
  user-select: none;
  outline: none;

  &[data-highlighted] {
    background: ${({ theme }) => theme.color.background};
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
  color: ${({ theme }) => theme.color.gray2};
`
