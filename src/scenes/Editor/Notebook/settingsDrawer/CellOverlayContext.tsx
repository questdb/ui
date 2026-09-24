import React, { createContext, useContext } from "react"
import { createPortal } from "react-dom"
import styled from "styled-components"
import { EDITOR_CARD_HEADER_HEIGHT } from "../../sharedStyles"

// The slot a cell's settings drawers render into: it spans the editor and the
// result area below the header, so a drawer opened from either covers the
// whole cell body.
export const CellOverlaySlot = styled.div`
  position: absolute;
  top: ${EDITOR_CARD_HEADER_HEIGHT};
  right: 0;
  bottom: 0;
  left: 0;
  /* Above the inner resize handle (10) that sits between editor and result. */
  z-index: 20;
  pointer-events: none;
`

const CellOverlayContext = createContext<HTMLElement | null>(null)

export const CellOverlayProvider = CellOverlayContext.Provider

export const CellOverlayPortal: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const container = useContext(CellOverlayContext)
  return container ? createPortal(children, container) : <>{children}</>
}
