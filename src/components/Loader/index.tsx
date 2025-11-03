import React from "react"
import { Loader as Icon } from "@styled-icons/remix-line"
import styled, { keyframes } from "styled-components"

const spinAnimation = keyframes`
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
`

const Spinning = styled(Icon)`
  animation: ${spinAnimation} 3s linear infinite;
`

type Props = {
  spin?: boolean
  size?: number | string
}

export const Loader = ({ size = "18px", spin = true }: Props) =>
  React.createElement(spin ? Spinning : Icon, { size })
