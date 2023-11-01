import React, { useContext } from "react"
import { Table } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { ImportContext } from "../import-file"
import { PaneContent, PaneWrapper } from "../../../components"
import { Panel } from "../../../components/Panel"
import { ColumnType, RequestColumn, SchemaRequest } from "./types"
import styled from "styled-components"

type Props = { data: SchemaRequest }
type Column = RequestColumn

export const SchemaEditor = ({ data }: Props) => {
  const { state, dispatch } = useContext(ImportContext)
  return (
    <PaneWrapper>
      <Panel.Header title="Schema" shadow />
      <PaneContent>
        <p>Flow: {state.flow}</p>
        <Table<Column>
          columns={[
            {
              render: () => (
                <input type="checkbox" name="" id="" defaultChecked={true} />
              ),
            },
            {
              header: "Index",
              render: ({ data: { file_column_index } }) => (
                <div>{file_column_index}</div>
              ),
            },
            {
              header: "Source",
              render: ({ data: { file_column_name } }) => (
                <div>{file_column_name}</div>
              ),
            },
            {
              header: "Destination",
              render: ({ data: { table_column_name } }) => (
                <input type="text" value={table_column_name} />
              ),
            },
            {
              header: "Datatype",
              render: ({ data: { column_type } }) => (
                <select name="" id="" defaultValue={column_type}>
                  {Object.entries(ColumnType).map(([label, value]) => (
                    <option value={value}>{label}</option>
                  ))}
                </select>
              ),
            },
            {
              render: ({ data: { column_type, precision, formats } }) => (
                <>
                  {(column_type === "DATE" || column_type === "TIMESTAMP") && (
                    <span>
                      {formats!.map(({ pattern }) => pattern).join(",")}
                    </span>
                  )}
                  {column_type === "GEOHASH" && <span>{precision}</span>}
                </>
              ),
            },
          ]}
          rows={data.columns}
        />
      </PaneContent>
    </PaneWrapper>
  )
}
