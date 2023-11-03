import React, { useContext } from "react"
import { Table, Badge, Box, DropdownMenu } from "@questdb/react-components"
import type { Props as TableProps } from "@questdb/react-components/dist/components/Table"
import { BadgeType } from "../../../scenes/Import/ImportCSVFiles/types"
import { ImportContext } from "../import-file"
import {
  PaneContent,
  PaneWrapper,
  Input,
  PopperToggle,
} from "../../../components"
import { Panel } from "../../../components/Panel"
import { ColumnType, RequestColumn, SchemaRequest } from "./types"
import styled from "styled-components"
import { Nav, NavGroup, Subheader } from "../panel"
import { TableNameMenu, PartitionMenu, DelimiterMenu } from "./actions"

const DetailBadge = styled(Badge)`
  gap: 1rem;
  justify-content: space-between;
  small {
    opacity: 0.6;

    max-width: 20ch;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const FormatMenuTrigger = styled.div`
  width: 100%;
`

const PrecisionBadge = styled(DetailBadge)``

type Props = { data: SchemaRequest }
type Column = RequestColumn

export const SchemaEditor = ({ data }: Props) => {
  const { state, dispatch } = useContext(ImportContext)
  return (
    <PaneWrapper>
      <Subheader>
        <NavGroup>
          {/** NOTE: hypothetically this is the control for flow as well */}
          <TableNameMenu />
          <DelimiterMenu />
          <PartitionMenu />
        </NavGroup>
        <NavGroup>
          <Nav>X</Nav>
          <Nav>Y</Nav>
        </NavGroup>
      </Subheader>
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
              // header: "Index",
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
              render: ({ data: { column_type, precision, formats } }) =>
                column_type === "DATE" || column_type === "TIMESTAMP"
                  ? formats!.length > 0 && (
                      <DropdownMenu.Root modal={false}>
                        <DropdownMenu.Trigger asChild>
                          <FormatMenuTrigger>
                            <DetailBadge type={BadgeType.INFO}>
                              <small>{formats![0].pattern}</small>
                              {formats!.length > 1 && (
                                <small>+ {formats!.length - 1}</small>
                              )}
                              {/* @TODO chevron down */}
                              <span>v</span>
                            </DetailBadge>
                          </FormatMenuTrigger>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content align="end">
                            {formats!.map(({ pattern }) => (
                              <DropdownMenu.Item key={pattern}>
                                {pattern}
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )
                  : column_type === "GEOHASH" && (
                      <PrecisionBadge type={BadgeType.INFO}>
                        <small>Precision</small>
                        {precision}
                      </PrecisionBadge>
                    ),
            },
          ]}
          rows={data.columns}
        />
      </PaneContent>
    </PaneWrapper>
  )
}
