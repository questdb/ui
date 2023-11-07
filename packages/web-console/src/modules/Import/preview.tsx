import React, { useContext } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Subheader } from "./panel"
import { ImportContext } from "./import-file"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

type Props = {}
export const DataPreview = ({}: Props) => {
  const { state, dispatch } = useContext(ImportContext)

  return (
    <Wrapper>
      <Subheader></Subheader>
      <Content>
        <div onClick={() => dispatch({ step: "result" })}>
          Settings for the chunk: {state.fileChunk?.name}
        </div>
      </Content>
    </Wrapper>
  )
}
