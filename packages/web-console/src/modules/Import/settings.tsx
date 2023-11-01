import React, { useContext } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { SchemaEditor } from "./SchemaEditor"
import { ImportContext } from "./import-file"
import { GlobalTimestampsPanel } from "./timestamps"
import { MOCK__getSchemaRequest } from "./api"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  flex-direction: row;

  > div {
    flex: 1;
  }
`

const data = MOCK__getSchemaRequest()

export const Settings = () => {
  const { state, dispatch } = useContext(ImportContext)

  return (
    <Wrapper>
      <Panel.Header title="Verify and import stuff go here" />
      <Content>
        <GlobalTimestampsPanel />
        <SchemaEditor data={data}/> 
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
