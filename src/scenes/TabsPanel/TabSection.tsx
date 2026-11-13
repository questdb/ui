import React, { useLayoutEffect, useRef, useState } from "react"
import styled from "styled-components"
import { CaretRightIcon } from "@phosphor-icons/react"
import { Text } from "../../components"
import { isOwnActivationKey } from "./keyboard"

type Props = {
  title: string
  // Rendered as-is next to the title, e.g. "3" or "2 open · 1 closed".
  count: string
  defaultExpanded?: boolean
  // Set only on the section containing the visible active row. The tab id,
  // rather than a boolean, also catches switches within a collapsed folder.
  activeTabId?: number
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
  activeTabId,
  children,
  "data-hook": dataHook,
}: Props) => {
  const rootRef = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(
    defaultExpanded || activeTabId !== undefined,
  )

  // A manual collapse survives ordinary renders. Only a new active tab (or
  // its arrival in this section) opens the folder again.
  useLayoutEffect(() => {
    if (activeTabId !== undefined) setExpanded(true)
  }, [activeTabId])

  // A collapsed section mounts its rows after expanding. Scroll after that
  // commit, before paint, without moving keyboard focus from the editor.
  useLayoutEffect(() => {
    if (!expanded || activeTabId === undefined) return
    rootRef.current
      ?.querySelector<HTMLElement>(
        '[data-hook="tabs-panel-row"][data-active="true"]',
      )
      ?.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      })
  }, [activeTabId, expanded])

  const toggle = () => setExpanded((value) => !value)

  return (
    <Root ref={rootRef} data-hook={dataHook}>
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
