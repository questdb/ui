import React from "react"
import styled from "styled-components"

type Props = {
  active: boolean
  children: React.ReactNode
}

const Root = styled.div`
  display: contents;
`

const block = (event: React.SyntheticEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

const blurTarget = (event: React.FocusEvent) => {
  if (event.target instanceof HTMLElement) event.target.blur()
}

const guardHandlers = {
  onKeyDownCapture: block,
  onPasteCapture: block,
  onCutCapture: block,
  onDropCapture: block,
  onFocusCapture: blurTarget,
}

export const ReadOnlyGuard = ({ active, children }: Props) => (
  <Root
    data-hook={active ? "read-only-guard" : undefined}
    {...(active ? guardHandlers : {})}
  >
    {children}
  </Root>
)
