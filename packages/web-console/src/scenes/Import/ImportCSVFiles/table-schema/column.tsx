import React from "react"
import { Form } from "../../../../components/Form"
import { IconWithTooltip } from "../../../../components"
import { Button } from "@questdb/react-components"
import { Close } from "styled-icons/remix-line"
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

const Root = styled.div<{ odd: boolean }>`
  --columns: auto 120px 40px; /* magic numbers to fit input, type dropdown and remove button nicely */
  display: grid;
  gap: 1rem;
  padding: 2rem;
  ${({ odd }) => odd && "background-color: #272833;"};
`

const MainControl = styled.div`
  display: grid;
  grid-template-columns: var(--columns);
  gap: 1rem;
  width: 100%;
  align-items: flex-end;
`

const Timestamp = styled.div`
  display: grid;
  grid-template-columns: var(--columns);
  gap: 1rem;
  width: 100%;
  align-items: flex-end;
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
    <Root key={column.name} odd={index % 2 !== 0}>
      <MainControl>
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

        {!disabled && (
          <Button
            skin="transparent"
            onClick={() => onRemove(index)}
            type="button"
          >
            <Close size="18px" />
          </Button>
        )}
      </MainControl>

      {column.type === "TIMESTAMP" && (
        <Timestamp>
          <Form.Item name={`schemaColumns.${index}.pattern`} label="Pattern">
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
        </Timestamp>
      )}

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
              column.pattern !== "" ? column.pattern : DEFAULT_TIMESTAMP_FORMAT
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
          <Form.Input name={`schemaColumns.${index}.precision`} required />
        </Form.Item>
      )}
    </Root>
  )
}
