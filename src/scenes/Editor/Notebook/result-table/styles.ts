import styled from "styled-components"
import { color } from "../../../../utils"
import { Button, PrimaryToggleButton, TabButton } from "../../../../components"

export const ResultWrapper = styled.div`
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`

export const SuccessMessage = styled.div`
  padding: 0.6rem 0.8rem;
  color: ${color("statusSuccess")};
  font-size: ${({ theme }) => theme.fontSize.sm};
  background: ${color("surfaceInset")};
`

export const TabBarWrapper = styled.div`
  display: flex;
  flex-shrink: 0;
  overflow-x: auto;
  gap: 0;
  height: 4rem;
  border-top: 1px solid ${color("surfaceInset")};

  scrollbar-width: none;

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

export const Tab = styled(TabButton)`
  && {
    padding: 0.5rem 1rem;
    max-width: 20rem;
    min-width: 15rem;
    border-right: 1px solid ${color("interactionNeutral")};
    flex-shrink: 0;
    gap: 0.8rem;
    overflow: hidden;
    position: relative;
  }
`

export const TabStatusIcon = styled.span<{ $success: boolean }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ $success }) =>
    $success ? color("statusSuccess") : color("statusDanger")};
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
  color: ${color("contentSecondary")};
`

export const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

export const NotificationContainer = styled.div`
  border-top: 1px solid ${color("surfaceInset")};
  border-bottom: 1px solid ${color("surfaceInset")};
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
  background: ${color("surfaceInset")};
  border-bottom: 1px solid ${color("interactionNeutral")};

  scrollbar-width: none;

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
