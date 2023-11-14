import React, { useContext } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Subheader } from "./panel"
import { ImportContext } from "./import-file"
import { useFormContext } from "react-hook-form"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

type Props = {}
export const DataPreview = ({}: Props) => {
  const { state, dispatch } = useContext(ImportContext)
  const { watch } = useFormContext()

  return (
    <Wrapper>
      <Subheader></Subheader>
      <Content>
        <div onClick={() => dispatch({ step: "result" })}>
          Settings for the chunk: {state.fileChunk?.name}
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(watch(), undefined, 4)}
        </div>
      </Content>
    </Wrapper>
  )
}
