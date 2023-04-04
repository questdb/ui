import React from "react"
import styled from "styled-components"
import { DropBox } from "./dropbox"
import { FilesToUpload } from "./files-to-upload"
import { ProcessedFiles } from "./processed-files"

const Root = styled.div`
  display: grid;
  width: 100%;
  grid-auto-flow: row;
  gap: 2rem;
`

type Props = {
  onImported: () => void
}

export const ImportCSVFiles = ({}: Props) => {
  return (
    <Root>
      <DropBox />
      <FilesToUpload />
      <ProcessedFiles />
    </Root>
  )
}
