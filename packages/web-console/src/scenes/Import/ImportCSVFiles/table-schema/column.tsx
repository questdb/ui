import React from "react"
import { useState } from "react"
import { Box } from "../../../../components/Box"
import { Form } from "../../../../components/Form"
import { IconWithTooltip } from "../../../../components"
import { Button } from "@questdb/react-components"
import { Close } from "styled-icons/remix-line"
import { SortDown } from "styled-icons/boxicons-regular"
import { Drawer } from "../../../../components/Drawer"
import { DEFAULT_TIMESTAMP_FORMAT } from "../const"
import { SchemaColumn } from "../types"
import { ProcessedFile } from "../types"
import styled from "styled-components"

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
  file,
  index,
  column,
  onNameChange,
  onTypeChange,
  onRemove,
  onSetTimestamp,
  timestamp,
}: {
  file: ProcessedFile
  index: number
  column: SchemaColumn
  onNameChange: (name: string) => void
  onTypeChange: (type: string) => void
  onRemove: (index: number) => void
  onSetTimestamp: (name: string) => void
  timestamp: string
}) => {
  const [type, setType] = useState(column.type)

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setType(e.target.value)
    onTypeChange(e.target.value)
  }

  const isEditLocked = file.exists && file.table_name === file.fileObject.name

  return (
    <Drawer.GroupItem direction="column" key={column.name}>
      <Row>
        <Columns>
          <Item>
            <Inputs>
              <Form.Item name={`schemaColumns.${index}.name`} label="Name">
                <Form.Input
                  disabled={isEditLocked}
                  defaultValue={column.name}
                  name={`schemaColumns.${index}.name`}
                  onChange={(e) => {
                    onNameChange(e.target.value)
                  }}
                  autoComplete="off"
                />
              </Form.Item>
              <Form.Item name={`schemaColumns.${index}.type`} label="Type">
                <Form.Select
                  defaultValue={column.type}
                  name={`schemaColumns.${index}.type`}
                  options={supportedColumnTypes}
                  onChange={handleTypeChange}
                />
              </Form.Item>

              <IconWithTooltip
                icon={
                  <Button
                    disabled={column.type !== "TIMESTAMP"}
                    skin={
                      timestamp !== "" &&
                      column.name !== "" &&
                      timestamp === column.name
                        ? "success"
                        : "transparent"
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
                placement="bottom"
              />

              {!isEditLocked && (
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
            {type === "TIMESTAMP" && (
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
            {type === "GEOHASH" && (
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
                  disabled={isEditLocked}
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
