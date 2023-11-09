import React, { useContext, useRef, useState } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Panel } from "../../components/Panel"
import { SchemaEditor } from "./SchemaEditor"
import { ImportContext } from "./import-file"
import { GlobalTimestampsPanel } from "./timestamps"
import { MOCK__getSchemaRequest } from "./api"
import { Form } from "../../components/Form"
import {
  PartitionBy,
  RequestColumn,
  TimestampFormat,
} from "./SchemaEditor/types"
import { DataPreview } from "./preview"
import { Allotment } from "allotment"
import { DEFAULT_TIMESTAMP_FORMAT } from "../../components/TableSchemaDialog/const"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  .split-view-view {
    display: flex;
    overflow: auto !important;
  }
`

type FormSchema = {
  table_name: string
  columns: RequestColumn[]
  partitionBy: keyof typeof PartitionBy
  delimiter: string
  formats: {
    patterns: TimestampFormat[]
    behavior: "ADD" | "OVERRIDE"
  }
}

export const Settings = () => {
  const { state } = useContext(ImportContext)
  const data = MOCK__getSchemaRequest()
  const [TSPanelOpen, toggleTSPanel] = useState(true)
  const TSPanelRef = useRef(null)

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
            columns: data.columns,
            partitionBy: "NONE",
            delimiter: ",",
            formats: {
              patterns: data.formats["TIMESTAMP"],
              behavior: "ADD",
            },
          }}
          formProps={{
            style: { flex: 1 },
          }}
        >
          <Allotment ref={TSPanelRef} minSize={300}>
            <Allotment.Pane>
              <GlobalTimestampsPanel
                open={TSPanelOpen}
                toggle={() => {
                  toggleTSPanel(!TSPanelOpen)
                }}
              />
            </Allotment.Pane>
            <Allotment.Pane preferredSize="65%">
              <SchemaEditor initData={data.columns}/>
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