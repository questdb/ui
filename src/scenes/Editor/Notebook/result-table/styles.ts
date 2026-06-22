import styled, { css } from "styled-components"
import { color } from "../../../../utils"
import { Button, PrimaryToggleButton } from "../../../../components"

export const ResultWrapper = styled.div`
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`

export const SuccessMessage = styled.div`
  padding: 0.6rem 0.8rem;
  color: ${color("green")};
  font-size: ${({ theme }) => theme.fontSize.sm};
  background: ${color("backgroundDarker")};
`

export const TabBarWrapper = styled.div`
  display: flex;
  flex-shrink: 0;
  overflow-x: auto;
  gap: 0;
  height: 4rem;
  border-top: 1px solid ${color("backgroundDarker")};

  &::-webkit-scrollbar {
    height: 0;
  }
`

export const TabLabel = styled.span`
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: ${color("gray2")};
  cursor: pointer;
  max-width: 20rem;
  min-width: 15rem;
  border-bottom: 2px solid transparent;

  border-right: 1px solid ${color("selection")};
  flex-shrink: 0;
  gap: 0.8rem;
  overflow: hidden;
  position: relative;
  transition: all 0.2s ease;

  ${({ $active }) =>
    $active &&
    css`
      color: ${color("foreground")};
      background: ${color("selection")};
      border-bottom: 2px solid ${color("pinkPrimary")};
    `}

  ${({ $active }) =>
    !$active &&
    css`
      &:hover {
        background: ${color("selectionDarker")};
        border-bottom: 2px solid ${color("selection")};
      }
    `}
`

export const TabStatusIcon = styled.span<{ $success: boolean }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ $success }) => ($success ? color("green") : color("red"))};
`

export const TabSpinner = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  animation: tab-spin 3s linear infinite;

  @keyframes tab-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  svg {
    width: 18px;
    height: 18px;
  }
`

export const CancelledIcon = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: ${color("gray2")};
`

export const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

export const NotificationContainer = styled.div`
  border-top: 1px solid ${color("backgroundDarker")};
  border-bottom: 1px solid ${color("backgroundDarker")};
`

export const LiveRegion = styled.div`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

export const ActionsBar = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.4rem;
  height: 3.6rem;
  padding: 0 0.8rem;
  overflow-x: auto;
  background: ${color("backgroundDarker")};
  border-bottom: 1px solid ${color("selection")};

  &::-webkit-scrollbar {
    height: 0;
  }

  > *:first-child {
    margin-left: auto;
  }
`

export const ActionButton = styled(Button)`
  flex-shrink: 0;
  height: 2.8rem;
  min-width: 2.8rem;
  padding: 0 0.6rem;
  gap: 0.3rem;
`

export const FreezeToggle = styled(PrimaryToggleButton)`
  flex-shrink: 0;
  height: 2.8rem;
  width: 3.2rem;
  padding: 0;
`
