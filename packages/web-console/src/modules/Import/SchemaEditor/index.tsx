import React, { useContext } from "react"
import { Table, Badge, DropdownMenu } from "@questdb/react-components"
import { BadgeType } from "../../../scenes/Import/ImportCSVFiles/types"
import { ImportContext } from "../import-file"
import { PaneContent, PaneWrapper } from "../../../components"
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
type Column = RequestColumn & { id: string; enabled: boolean }

export const SchemaEditor = ({ initData }: Props) => {
  const { state } = useContext(ImportContext)
  const { register, setValue, getValues } = useFormContext()
  const { fields } = useFieldArray({ name: "columns" })

  const isFieldDisabled = (index: number) =>
    getValues(`columns.${index}.enabled`) === false
  return (
    <PaneWrapper>
      <Subheader>
        <NavGroup>
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
              render: ({ data: field, index }) => (
                <input
                  type="checkbox"
                  key={field.id}
                  {...register(`columns.${index}.enabled`)}
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
                  <input
                    type="text"
                    key={field.id}
                    disabled={isFieldDisabled(index)}
                    {...register(`columns.${index}.table_column_name`, {
                      shouldUnregister: true,
                    })}
                  />
                ) : (
                  <select
                    key={field.id}
                    disabled={isFieldDisabled(index)}
                    {...register(`columns.${index}.table_column_name`, {
                      shouldUnregister: true,
                    })}
                  >
                    {initData.map(({ table_column_name }) => (
                      <option
                        value={table_column_name}
                        key={`${field.id}-${table_column_name}`}
                      >
                        {table_column_name}
                      </option>
                    ))}
                  </select>
                ),
            },
            {
              header: "Datatype",
              render: ({ data: field, index }) => (
                <select
                  key={field.id}
                  {...register(`columns.${index}.column_type`)}
                  disabled={isFieldDisabled(index) || state.flow === "existing"}
                >
                  {Object.entries(ColumnType).map(([label, value]) => (
                    <option key={`${field.id}-${value}`} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ),
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
                            <span><small>{formats![0].pattern}</small>
                            {formats!.length > 1 && (
                              <small>+ {formats!.length - 1}</small>
                            )}</span>
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
