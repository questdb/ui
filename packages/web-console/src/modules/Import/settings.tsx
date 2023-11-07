import React, { useContext, useState } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { SchemaEditor } from "./SchemaEditor"
import { ImportContext } from "./import-file"
import { GlobalTimestampsPanel } from "./timestamps"
import { MOCK__getSchemaRequest } from "./api"
import { Form } from "../../components/Form"
import { PartitionBy } from "./SchemaEditor/types"
import { DataPreview } from "./preview"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  flex-direction: row;

  > div {
    flex: 1;
  }
`

type FormSchema = {
  table_name: string
  partitionBy: keyof typeof PartitionBy
  delimiter: string
  formats: {
    behavior: "ADD" | "OVERRIDE"
  }
}

export const Settings = () => {
  const { state } = useContext(ImportContext)
  const data = MOCK__getSchemaRequest()
  const [TSPanelOpen, toggleTSPanel] = useState(true)

  return (
    <Form<FormSchema>
      name="import_schema"
      onSubmit={function (data: any, event?: any) {
        alert("submit")
      }}
      defaultValues={{
        table_name: state.fileChunk?.name ?? "",
        partitionBy: "NONE",
        delimiter: ",",
      }}
    >
      <Wrapper>
        <Panel.Header title="Verify and import stuff go here" />
        <Content>
          <GlobalTimestampsPanel
            open={TSPanelOpen}
            toggle={() => {
              toggleTSPanel(!TSPanelOpen)
            }}
          />
          <SchemaEditor data={data} />
          <DataPreview />
        </Content>
      </Wrapper>
    </Form>
  )
}
