import React, { useContext } from "react"
import { Table, Badge, DropdownMenu } from "@questdb/react-components"
import { BadgeType } from "../../../scenes/Import/ImportCSVFiles/types"
import { ImportContext } from "../import-file"
import { PaneContent, PaneWrapper } from "../../../components"
import { Form } from "../../../components/Form"
import { ColumnType, RequestColumn, TimestampFormat } from "./types"
import styled from "styled-components"
import { Nav, NavGroup, Subheader } from "../panel"
import { TableNameMenu, PartitionMenu, DelimiterMenu } from "./actions"
import { useFieldArray, useFormContext } from "react-hook-form"

const DetailBadge = styled(Badge)`
  gap: 1rem;
  justify-content: space-between;

  small {
    opacity: 0.6;
    display: inline-block;

    &:first-child {
      max-width: 20ch;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    & + small {
      margin-inline-start: 1rem;
    }
  }
`

const FormatMenuTrigger = styled.div`
  width: 100%;
`

const PrecisionBadge = styled(DetailBadge)``

type Props = { initData: RequestColumn[] }
type Column = RequestColumn & { id: string }

export const SchemaEditor = ({ initData }: Props) => {
  const { state } = useContext(ImportContext)
  const { getValues } = useFormContext()
  const { fields } = useFieldArray({ name: "columns" })

  const isColumnIgnored = (index: number) =>
    getValues(`columns.${index}.column_ignored`) === false
  return (
    <PaneWrapper>
      <Subheader>
        <NavGroup>
          <TableNameMenu />
          <DelimiterMenu />
          <PartitionMenu />
        </NavGroup>
        <NavGroup>
          {state.flow === "existing" && (
            <Nav>W</Nav> // Append vs overwrite
          )}
          <Nav>X</Nav> {/* Header stuff */}
          <Nav>Y</Nav> {/* on error */}
        </NavGroup>
      </Subheader>
      <PaneContent>
        <p>Flow: {state.flow}</p>
        <Table<Column>
          columns={[
            {
              render: ({ data: field, index }) => (
                <Form.Checkbox
                  key={field.id}
                  name={`columns.${index}.column_ignored`}
                  defaultChecked={true}
                />
              ),
            },
            {
              render: ({ data: field, index }) => (
                <div key={field.id}>{field.file_column_index}</div>
              ),
            },
            {
              header: "Source",
              render: ({ data: field, index }) => (
                <div key={field.id}>{field.file_column_name}</div>
              ),
            },
            {
              header: "Destination",
              render: ({ data: field, index }) =>
                state.flow === "new_table" ? (
                  <Form.Input
                    key={field.id}
                    disabled={isColumnIgnored(index)}
                    name={`columns.${index}.table_column_name`}
                  />
                ) : (
                  <Form.Select
                    key={field.id}
                    disabled={isColumnIgnored(index)}
                    name={`columns.${index}.table_column_name`}
                    options={initData.map(({ table_column_name }) => ({
                      label: table_column_name,
                      value: table_column_name,
                    }))}
                    defaultValue={initData[index]?.table_column_name}
                  />
                ),
            },
            {
              header: "Datatype",
              render: ({ data: field, index }) => (
                <Form.Select
                  key={field.id}
                  name={`columns.${index}.column_type`}
                  disabled={isColumnIgnored(index) || state.flow === "existing"}
                  options={Object.entries(ColumnType).map(([label, value]) => ({
                    label,
                    value,
                  }))}
                />
              ),
            },
            {
              // extra details
              render: ({ data: field, index }) => {
                const column_type = getValues(`columns.${index}.column_type`)
                if (column_type === "TIMESTAMP") {
                  return (
                    <Form.Checkbox
                      key={field.id}
                      disabled={
                        isColumnIgnored(index) || state.flow === "existing"
                      }
                      name={`columns.${index}.designated`}
                      defaultChecked={false}
                    />
                  )
                } else if (column_type === "GEOHASH") {
                  return <span>ⓘ</span>
                }
              },
            },
            {
              render: ({ data: field, index }) => {
                const { column_type, precision, formats } = getValues(
                  `columns.${index}`,
                )
                if (
                  column_type === "DATE" ||
                  (column_type === "TIMESTAMP" && formats!.length > 0)
                ) {
                  return (
                    <DropdownMenu.Root modal={false} key={field.id}>
                      <DropdownMenu.Trigger asChild>
                        <FormatMenuTrigger>
                          <DetailBadge type={BadgeType.INFO}>
                            <span>
                              <small>{formats![0].pattern}</small>
                              {formats!.length > 1 && (
                                <small>+ {formats!.length - 1}</small>
                              )}
                            </span>
                            {/* @TODO chevron down */}
                            <span>v</span>
                          </DetailBadge>
                        </FormatMenuTrigger>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content align="end">
                          {(formats as TimestampFormat[]).map(({ pattern }) => (
                            <DropdownMenu.Item key={`${field.id}-${pattern}`}>
                              {pattern}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  )
                } else if (column_type === "GEOHASH") {
                  return (
                    <PrecisionBadge type={BadgeType.INFO}>
                      <small>Precision</small>
                      {precision!}
                    </PrecisionBadge>
                  )
                }
              },
            },
          ]}
          rows={fields as Column[]}
        />
      </PaneContent>
    </PaneWrapper>
  )
}
