import React from "react"
import styled from "styled-components"

const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`

type Props = {
  files: FileList | null
}

export const FilesToUpload = ({ files }: Props) => {
  console.log(files)
  return <Root>Files to upload</Root>
}
