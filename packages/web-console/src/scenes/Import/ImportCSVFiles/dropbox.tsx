import React from "react"
import styled from "styled-components"
import { Heading } from "@questdb/react-components"

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  border: 3px dashed #333543;
  box-shadow: inset 0 0 10px 0 #1b1c23;
`

type Props = {}

export const DropBox = ({}: Props) => {
  return (
    <Root>
      <img
        alt="File upload icon"
        width="60"
        height="80"
        src="/assets/upload.svg"
      />
      {/* <Heading level={4}>Header here...</Heading> */}
    </Root>
  )
}
