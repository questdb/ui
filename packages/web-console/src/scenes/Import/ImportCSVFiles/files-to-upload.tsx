import React from "react"
import styled from "styled-components"

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

type Props = {}

export const FilesToUpload = ({}: Props) => {
  return <Root>Files to upload</Root>
}
