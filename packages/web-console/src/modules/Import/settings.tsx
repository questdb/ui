import React, { useContext } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { SchemaEditor } from "./SchemaEditor"
import { ImportContext } from "./import-file"
import { GlobalTimestampsPanel } from "./timestamps"
import { MOCK__getSchemaRequest } from "./api"
import { Form } from "../../components/Form"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  flex-direction: row;

  > div {
    flex: 1;
  }
`

type FormSchema = {
  table_name: string
}

export const Settings = () => {
  const { state, dispatch } = useContext(ImportContext)
  const data = MOCK__getSchemaRequest()

  return (
    <Form<FormSchema>
      name="import_schema"
      onSubmit={function (data: any, event?: any) {
        throw new Error("Function not implemented.")
      }}
    >
      <Wrapper>
        <Panel.Header title="Verify and import stuff go here" />
        <Content>
          <GlobalTimestampsPanel />
          <SchemaEditor data={data} />
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
    </Form>
  )
}
