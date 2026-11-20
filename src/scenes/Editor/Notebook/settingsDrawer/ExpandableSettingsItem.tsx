import React, { useId, type ReactNode } from "react"
import styled from "styled-components"
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react"
import { ButtonBase } from "../../../../components"

export const ExpandableSettingsList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Item = styled.li<{ $expanded: boolean }>`
  min-width: 0;
  border-radius: 0.6rem;
  background: ${({ theme, $expanded }) =>
    $expanded ? theme.color.interactionHover : "transparent"};

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem;
`

const Toggle = styled(ButtonBase)`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 1;
  min-width: 0;
  padding: 0.4rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  text-align: left;

  > svg {
    flex-shrink: 0;
  }

  &[data-muted="true"] > span {
    opacity: 0.45;
  }
`

const Copy = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  overflow-wrap: anywhere;
`

const Title = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Details = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.6rem;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Body = styled.div`
  padding: 0.4rem 1.2rem 1.2rem;
`

type Props = {
  title: string
  details?: ReactNode
  expanded: boolean
  onToggle: () => void
  leading?: ReactNode
  actions?: ReactNode
  muted?: boolean
  toggleLabel?: string
  dataHook?: string
  children: ReactNode
}

export const ExpandableSettingsItem = ({
  title,
  details,
  expanded,
  onToggle,
  leading,
  actions,
  muted,
  toggleLabel,
  dataHook,
  children,
}: Props) => {
  const bodyId = useId()
  const Caret = expanded ? CaretDownIcon : CaretRightIcon

  return (
    <Item $expanded={expanded} data-hook={dataHook}>
      <Header>
        {leading}
        <Toggle
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={toggleLabel}
          data-muted={muted}
          onClick={onToggle}
        >
          <Caret size={14} aria-hidden />
          <Copy>
            <Title>{title}</Title>
            {details && <Details>{details}</Details>}
          </Copy>
        </Toggle>
        {actions}
      </Header>
      <div id={bodyId} hidden={!expanded}>
        {expanded && <Body>{children}</Body>}
      </div>
    </Item>
  )
}
