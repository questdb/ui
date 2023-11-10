import React, { useContext, useRef, useState } from "react"
import styled from "styled-components"
import { PaneContent, PaneWrapper } from "../../components"
import { Root as PanelHeader } from "../../components/Panel/header"
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
import { Allotment, AllotmentHandle } from "allotment"

const Wrapper = styled(PaneWrapper)``

const Content = styled(PaneContent)`
  .split-view-view {
    display: flex;
    overflow: auto !important;
  }
`

const Header = styled(PanelHeader)``

const MIN_PANEL_SIZE = 45

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
  const allotmentRef = useRef<AllotmentHandle>(null)

  return (
    <Wrapper>
      <Content>
        <Header></Header>
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
          <Allotment ref={allotmentRef} minSize={MIN_PANEL_SIZE}>
            <Allotment.Pane preferredSize={300}>
              <GlobalTimestampsPanel
                open={TSPanelOpen}
                toggle={() => {
                  if (TSPanelOpen) {
                    allotmentRef.current?.resize([MIN_PANEL_SIZE])
                  } else {
                    allotmentRef.current?.resize([300])
                  }
                  toggleTSPanel(!TSPanelOpen)
                }}
              />
            </Allotment.Pane>
            <Allotment.Pane>
              <SchemaEditor initData={data.columns} />
            </Allotment.Pane>
            <Allotment.Pane preferredSize={300}>
              <DataPreview />
            </Allotment.Pane>
          </Allotment>
        </Form>
      </Content>
    </Wrapper>
  )
}
