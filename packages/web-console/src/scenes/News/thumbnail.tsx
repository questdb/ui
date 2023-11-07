import React, { useState, useEffect } from "react"
import styled from "styled-components"
import { Loader } from "@questdb/react-components"

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  margin: 2rem 0;
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: 0 7px 30px -10px ${({ theme }) => theme.color.black};
  overflow: hidden;
  background: ${({ theme }) => theme.color.backgroundLighter};

  svg {
    position: absolute;
  }
`

const ThumbImg = styled.img<{ loaded: boolean }>`
  width: 46rem;
  height: auto;

  ${({ loaded }) => `
    opacity: ${loaded ? 1 : 0};
    transition: opacity 0.2s ease-in-out;
  `}
`
export const Thumbnail = ({
  src,
  alt,
  width,
  height,
  containerWidth,
}: {
  src: string
  alt: string
  width: number
  height: number
  containerWidth: number
}) => {
  const [isLoaded, setIsLoaded] = useState(false)

  const scaledImageWidth = containerWidth
  const scaledImageHeight = (scaledImageWidth / width) * height

  useEffect(() => {
    const imgElement = new Image()
    imgElement.src = src

    imgElement.onload = () => {
      setIsLoaded(true)
    }
  }, [src])

  return (
    <Root>
      {!isLoaded && <Loader />}
      <ThumbImg
        src={src}
        alt={alt}
        width={scaledImageWidth}
        height={scaledImageHeight}
        loaded={isLoaded}
      />
    </Root>
  )
}
