import React, { useContext } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { SchemaEditor } from "../../components/SchemaEditor"
import { ImportContext } from "./import-file"
import { GlobalTimestampsPanel } from "./timestamps"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  flex-direction: row;

  > div {
    flex: 1;
  }
`

export const Settings = () => {
  const { state, dispatch } = useContext(ImportContext)

  return (
    <Wrapper>
      <Panel.Header title="Verify and import stuff go here" />
      <Content>
        <GlobalTimestampsPanel />
        <SchemaEditor />
        <PaneWrapper>
          <Panel.Header title="Settings" shadow />
          <PaneContent>
            <div onClick={() => dispatch({ step: "result" })}>
              Settings for the chunk: {state.fileChunk?.name}
            </div>
          </PaneContent>
        </PaneWrapper>
      </Content>
    </Wrapper>
  )
}
