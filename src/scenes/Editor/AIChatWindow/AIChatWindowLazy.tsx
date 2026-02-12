import React, { lazy, Suspense } from "react"
import { createPortal } from "react-dom"
import styled from "styled-components"
import { useSelector } from "react-redux"
import { selectors } from "../../../store"
import { AIChatErrorBoundary } from "./AIChatErrorBoundary"
import { CircleNotchSpinner } from "../Monaco/icons"
import { color } from "../../../utils"

const AIChatWindow = lazy(() => import("./index"))

const LoaderContainer = styled.div`
  display: flex;
  align-items: center;
  background: ${color("chatBackground")};
  justify-content: center;
  height: 100%;
  width: 100%;
`

const LoaderFallback = () => {
  const container = document.getElementById("side-panel-right")
  if (!container) return null

  return createPortal(
    <LoaderContainer>
      <CircleNotchSpinner size={24} />
    </LoaderContainer>,
    container,
  )
}

export const AIChatWindowLazy = () => {
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)

  if (activeSidebar?.type !== "aiChat") {
    return null
  }

  return (
    <AIChatErrorBoundary>
      <Suspense fallback={<LoaderFallback />}>
        <AIChatWindow />
      </Suspense>
    </AIChatErrorBoundary>
  )
}
