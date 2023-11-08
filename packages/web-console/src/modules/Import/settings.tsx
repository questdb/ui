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
import { Allotment } from "allotment"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)``

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
    <Wrapper>
      <Content>
        <Panel.Header title="Verify and import stuff go here" />
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
          formProps={{
            style: { flex: 1 },
          }}
        >
          <Allotment>
            <Allotment.Pane>
              <GlobalTimestampsPanel
                open={TSPanelOpen}
                toggle={() => {
                  toggleTSPanel(!TSPanelOpen)
                }}
              />
            </Allotment.Pane>
            <Allotment.Pane>
              <SchemaEditor data={data} />
            </Allotment.Pane>
            <Allotment.Pane>
              <DataPreview />
            </Allotment.Pane>
          </Allotment>
        </Form>
      </Content>
    </Wrapper>
  )
}
