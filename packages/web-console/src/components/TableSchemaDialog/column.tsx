import React from "react"
import { Form } from "../Form"
import { IconWithTooltip } from ".."
import { Button } from "@questdb/react-components"
import { Close } from "styled-icons/remix-line"
import { Book } from "styled-icons/boxicons-regular"
import { DEFAULT_TIMESTAMP_FORMAT } from "./const"
import styled from "styled-components"
import { SchemaColumn } from "utils"
import { Controls } from "./controls"
import { Action } from "./types"

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

const Root = styled.div<{ odd: boolean }>`
  display: grid;
  gap: 1rem;
  padding: 2rem;
  ${({ odd }) => odd && "background-color: #272833;"};
`

export const Column = ({
  action,
  disabled,
  column,
  index,
  onRemove,
  onSetTimestamp,
  timestamp,
}: {
  action: Action
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
    <Root key={column.name} odd={index % 2 !== 0}>
      <Controls>
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
            defaultValue={action === "import" ? column.type : "STRING"}
            name={`schemaColumns.${index}.type`}
            options={supportedColumnTypes.filter((type) =>
              type.value === "" && action === "add" ? false : true,
            )}
          />
        </Form.Item>

        {!disabled && (
          <Button
            skin="transparent"
            onClick={() => onRemove(index)}
            type="button"
          >
            <Close size="18px" />
          </Button>
        )}
      </Controls>

      {column.type === "TIMESTAMP" && (
        <Controls>
          {action === "import" && (
            <Form.Item name={`schemaColumns.${index}.pattern`} label="Pattern">
              <Form.Input
                name={`schemaColumns.${index}.pattern`}
                placeholder={DEFAULT_TIMESTAMP_FORMAT}
                defaultValue={
                  column.pattern !== ""
                    ? column.pattern
                    : DEFAULT_TIMESTAMP_FORMAT
                }
                {...(action === "import" && { required: true })}
              />
            </Form.Item>
          )}

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
                onClick={() => onSetTimestamp(column.name)}
                type="button"
                prefixIcon={
                  <input
                    type="checkbox"
                    checked={
                      timestamp !== "" &&
                      column.name !== "" &&
                      timestamp === column.name
                    }
                  />
                }
              >
                Designated
              </Button>
            }
            tooltip="Mark this column as a designated timestamp"
            placement="top"
          />
        </Controls>
      )}

      {column.type === "GEOHASH" && (
        <Controls>
          <Form.Item
            name={`schemaColumns.${index}.precision`}
            label="Precision"
          >
            <Form.Input name={`schemaColumns.${index}.precision`} required />
          </Form.Item>
          <a
            href="https://questdb.io/docs/concept/geohashes/#specifying-geohash-precision"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              skin="transparent"
              prefixIcon={<Book size="14" />}
              type="button"
            >
              Docs
            </Button>
          </a>
        </Controls>
      )}
    </Root>
  )
}