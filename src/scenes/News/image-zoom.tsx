import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { Thumbnail } from "./thumbnail"

const Root = styled(Box).attrs({ align: "center", justifyContent: "center" })<{
  visible: boolean
}>`
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 1000;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
`

const Overlay = styled.div<{ visible: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(33, 34, 44, 0.9);
  opacity: ${({ visible }) => (visible ? 1 : 0)};
  pointer-events: ${({ visible }) => (visible ? "auto" : "none")};
  transition: opacity 0.2s ease-in-out;
`

const Wrapper = styled.div`
  z-index: 1001;

  img {
    border: 1px solid ${({ theme }) => theme.color.offWhite};
    border-radius: ${({ theme }) => theme.borderRadius};
  }
`

export const ImageZoom = () => {
  const imageToZoom = useSelector(selectors.console.getImageToZoom)
  const dispatch = useDispatch()
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootWidth, setRootWidth] = useState(0)
  const [rootHeight, setRootHeight] = useState(0)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)

  const handleEsc = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      dispatch(actions.console.setImageToZoom(undefined))
    }
  }

  useEffect(() => {
    if (rootRef.current) {
      setRootWidth(rootRef.current.offsetWidth)
      setRootHeight(rootRef.current.offsetHeight)
    }
  }, [imageToZoom])

  useEffect(() => {
    if (activeSidebar === "news") {
      document.addEventListener("keydown", handleEsc)
    } else {
      document.removeEventListener("keydown", handleEsc)
    }
  }, [activeSidebar])

  if (activeSidebar !== "news") {
    return null
  }

  return (
    <Root ref={rootRef} visible={imageToZoom !== undefined}>
      <Overlay visible={imageToZoom !== undefined} />
      {imageToZoom && (
        <Wrapper>
          <Thumbnail
            {...imageToZoom}
            containerWidth={rootWidth ? rootWidth * 0.9 : 460}
            containerHeight={rootHeight ? rootHeight * 0.75 : 460}
          />
        </Wrapper>
      )}
    </Root>
  )
}
