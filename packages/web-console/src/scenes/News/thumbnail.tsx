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

const ThumbImg = styled.img<{ loaded: boolean; fadeIn?: boolean }>`
  height: auto;

  ${({ loaded, fadeIn }) => `
    opacity: ${loaded ? 1 : 0};
    ${fadeIn && `transition: opacity 0.2s ease-in-out;`}
  `}
`
export const Thumbnail = ({
  src,
  alt,
  width,
  height,
  containerWidth,
  fadeIn,
  ...rest
}: {
  src: string
  alt: string
  width: number
  height: number
  containerWidth: number
  fadeIn?: boolean
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
    <Root {...rest}>
      {!isLoaded && <Loader />}
      <ThumbImg
        src={src}
        alt={alt}
        width={scaledImageWidth}
        height={scaledImageHeight}
        loaded={isLoaded}
        fadeIn={fadeIn}
      />
    </Root>
  )
}
