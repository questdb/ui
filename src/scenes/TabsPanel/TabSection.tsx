import React, { useState } from "react"
import styled from "styled-components"
import { CaretRightIcon } from "@phosphor-icons/react"
import { Text } from "../../components"
import { isOwnActivationKey } from "./keyboard"

type Props = {
  title: string
  // Rendered as-is next to the title, e.g. "3" or "2 open · 1 closed".
  count: string
  defaultExpanded?: boolean
  children: React.ReactNode
  "data-hook": string
}

const Root = styled.section`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`

const HeaderRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
  padding: 0.5rem 1rem 0.5rem 2.8rem;
  user-select: none;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const Caret = styled.span<{ $expanded: boolean }>`
  position: absolute;
  left: 0.3rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  transform: rotateZ(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
  transition: transform 150ms ease;
`

const Title = styled(Text).attrs({ color: "contentPrimary" })`
  flex: 1;
  font-weight: 500;
`

const Count = styled.span`
  flex-shrink: 0;
  margin-left: 0.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
`

export const TabSection = ({
  title,
  count,
  defaultExpanded = true,
  children,
  "data-hook": dataHook,
}: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => setExpanded((value) => !value)

  return (
    <Root data-hook={dataHook}>
      <HeaderRow
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(event) => {
          if (isOwnActivationKey(event)) {
            event.preventDefault()
            toggle()
          }
        }}
      >
        <Caret $expanded={expanded} aria-hidden="true">
          <CaretRightIcon size={15} />
        </Caret>
        <Title>{title}</Title>
        <Count data-hook="tabs-panel-section-count">{count}</Count>
      </HeaderRow>
      {expanded && children}
    </Root>
  )
}
