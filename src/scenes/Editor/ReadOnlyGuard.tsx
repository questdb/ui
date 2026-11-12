import React from "react"
import styled from "styled-components"
import { focusPast } from "../../utils/focusPast"

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

// Tab and Shift+Tab move past the read-only content instead of leaving focus
// on the page body.
const keepFocusOut = (event: React.FocusEvent<HTMLElement>) => {
  const cameFrom = event.relatedTarget
  if (cameFrom instanceof Element && focusPast(event.currentTarget, cameFrom)) {
    return
  }
  if (event.target instanceof HTMLElement) event.target.blur()
}

const guardHandlers = {
  onKeyDownCapture: block,
  onPasteCapture: block,
  onCutCapture: block,
  onDropCapture: block,
  onFocusCapture: keepFocusOut,
}

export const ReadOnlyGuard = ({ active, children }: Props) => (
  <Root
    data-hook={active ? "read-only-guard" : undefined}
    {...(active ? guardHandlers : {})}
  >
    {children}
  </Root>
)
