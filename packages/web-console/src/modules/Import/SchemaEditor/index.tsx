import React, { useContext } from "react"
import { Table } from "@questdb/react-components"
import { ImportContext } from "../import-file"
import { PaneContent, PaneWrapper } from "../../../components"
import { Panel } from "../../../components/Panel"

type Props = {}

export const SchemaEditor = ({}: Props) => {
  const { state, dispatch } = useContext(ImportContext)
  return (
    <PaneWrapper>
      <Panel.Header title="Schema" shadow />
      <PaneContent>
        <p>Flow: {state.flow}</p>
        <Table columns={[]} rows={[]} />
      </PaneContent>
    </PaneWrapper>
  )
}
