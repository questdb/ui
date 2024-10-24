import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { Box } from "@questdb/react-components"
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { Thumbnail } from "./thumbnail"

const Root = styled(Box).attrs({ align: "center", justifyContent: "center" })`
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 1000;
  background: rgba(33, 34, 44, 0.5);
`

export const ImageZoom = () => {
  const imageToZoom = useSelector(selectors.console.getImageToZoom)
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootWidth, setRootWidth] = useState(0)

  useEffect(() => {
    if (rootRef.current) {
      setRootWidth(rootRef.current.offsetWidth)
    }
  }, [imageToZoom])

  if (!imageToZoom) return null

  return (
    <Root ref={rootRef}>
      {imageToZoom && (
        <Thumbnail
          {...imageToZoom}
          containerWidth={rootWidth ? rootWidth * 0.75 : 460}
        />
      )}
    </Root>
  )
}
