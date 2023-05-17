import React from "react"
import { Box } from "../../../../components/Box"
import { Form } from "../../../../components/Form"
import { IconWithTooltip } from "../../../../components"
import { Button } from "@questdb/react-components"
import { Close } from "styled-icons/remix-line"
import { SortDown } from "styled-icons/boxicons-regular"
import { Drawer } from "../../../../components/Drawer"
import { DEFAULT_TIMESTAMP_FORMAT } from "../const"
import styled from "styled-components"
import { SchemaColumn } from "utils"

const supportedColumnTypes: { label: string; value: string }[] = [
  { label: "AUTO", value: "" },
  { label: "BOOLEAN", value: "BOOLEAN" },
  { label: "BYTE", value: "BYTE" },
  { label: "DOUBLE", value: "DOUBLE" },
  { label: "DATE", value: "DATE" },
  { label: "FLOAT", value: "FLOAT" },
  { label: "GEOHASH", value: "GEOHASH" },
  { label: "INT", value: "INT" },
  { label: "LONG", value: "LONG" },
  { label: "SHORT", value: "SHORT" },
  { label: "CHAR", value: "CHAR" },
  { label: "STRING", value: "STRING" },
  { label: "SYMBOL", value: "SYMBOL" },
  { label: "TIMESTAMP", value: "TIMESTAMP" },
]

const Row = styled(Box).attrs({
  flexDirection: "column",
  align: "flex-start",
  gap: "2rem",
})`
  width: 100%;
`

const Columns = styled(Box).attrs({
  align: "flex-start",
  justifyContent: "space-between",
  gap: 0,
})`
  width: 100%;

  > button {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
`

const Item = styled(Box).attrs({
  gap: "1rem",
  flexDirection: "column",
})`
  width: 100%;
`

const Inputs = styled(Box).attrs({
  align: "flex-end",
  gap: "1rem",
})`
  width: 100%;
`

export const Column = ({
  disabled,
  column,
  index,
  onRemove,
  onSetTimestamp,
  timestamp,
}: {
  disabled: boolean
  column: SchemaColumn
  index: number
  onRemove: (index: number) => void
  onSetTimestamp: (name: string) => void
  timestamp: string
}) => {
  if (!column) {
    return null
  }

  return (
    <Drawer.GroupItem direction="column" key={column.name}>
      <Row>
        <Columns>
          <Item>
            <Inputs>
              <Form.Item name={`schemaColumns.${index}.name`} label="Name">
                <Form.Input
                  disabled={disabled}
                  defaultValue={column.name}
                  name={`schemaColumns.${index}.name`}
                  autoComplete="off"
                />
              </Form.Item>
              <Form.Item name={`schemaColumns.${index}.type`} label="Type">
                <Form.Select
                  defaultValue={column.type}
                  name={`schemaColumns.${index}.type`}
                  options={supportedColumnTypes}
                />
              </Form.Item>

              {column.type === "TIMESTAMP" && (
                <IconWithTooltip
                  icon={
                    <Button
                      skin={
                        timestamp !== "" &&
                        column.name !== "" &&
                        timestamp === column.name
                          ? "success"
                          : "secondary"
                      }
                      onClick={() => {
                        onSetTimestamp(column.name)
                      }}
                      type="button"
                    >
                      <SortDown size="18px" />
                    </Button>
                  }
                  tooltip="Set as designated timestamp"
                  placement="top"
                />
              )}

              {!disabled && (
                <Button
                  skin="transparent"
                  onClick={() => {
                    onRemove(index)
                  }}
                  type="button"
                >
                  <Close size="18px" />
                </Button>
              )}
            </Inputs>
            {column.type === "TIMESTAMP" && (
              <Form.Item
                name={`schemaColumns.${index}.pattern`}
                label="Timestamp pattern"
                helperText="Required when using the TIMESTAMP type"
              >
                <Form.Input
                  name={`schemaColumns.${index}.pattern`}
                  placeholder={DEFAULT_TIMESTAMP_FORMAT}
                  defaultValue={
                    column.pattern !== ""
                      ? column.pattern
                      : DEFAULT_TIMESTAMP_FORMAT
                  }
                  required
                />
              </Form.Item>
            )}
            {column.type === "GEOHASH" && (
              <Form.Item
                name={`schemaColumns.${index}.precision`}
                label="Precision"
                helperText={
                  <a
                    href="https://questdb.io/docs/concept/geohashes/#specifying-geohash-precision"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Docs on QuestDB geohash precision
                  </a>
                }
              >
                <Form.Input
                  name={`schemaColumns.${index}.precision`}
                  required
                />
              </Form.Item>
            )}
          </Item>
        </Columns>
      </Row>
    </Drawer.GroupItem>
  )
}
