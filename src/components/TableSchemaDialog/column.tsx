import React, { useState } from "react"
import { Box, Button, Form, IconWithTooltip, Text } from "../../components"
import { DEFAULT_TIMESTAMP_FORMAT } from "../../scenes/Import/ImportCSVFiles/const"
import styled from "styled-components"
import { SchemaColumn } from "utils"
import { Controls } from "./controls"
import { Action } from "./types"
import { DocsLink } from "./docs-link"
import { isTimestamp } from "../../scenes/Import/ImportCSVFiles/utils"
import { getTimestampFormat } from "../../scenes/Import/ImportCSVFiles/utils"

const supportedColumnTypes: { label: string; value: string }[] = [
  { label: "AUTO", value: "" },
  { label: "BINARY", value: "BINARY" },
  { label: "BOOLEAN", value: "BOOLEAN" },
  { label: "BYTE", value: "BYTE" },
  { label: "CHAR", value: "CHAR" },
  { label: "DATE", value: "DATE" },
  { label: "DOUBLE", value: "DOUBLE" },
  { label: "FLOAT", value: "FLOAT" },
  { label: "GEOHASH", value: "GEOHASH" },
  { label: "INT", value: "INT" },
  { label: "IPV4", value: "IPV4" },
  { label: "LONG", value: "LONG" },
  { label: "LONG256", value: "LONG256" },
  { label: "SHORT", value: "SHORT" },
  { label: "STRING", value: "STRING" },
  { label: "VARCHAR", value: "VARCHAR" },
  { label: "SYMBOL", value: "SYMBOL" },
  { label: "TIMESTAMP", value: "TIMESTAMP" },
  { label: "TIMESTAMP_NS", value: "TIMESTAMP_NS" },
  { label: "UUID", value: "UUID" },
]

const IndexNumber = styled(Text).attrs({ color: "foreground" })``

const Root = styled.div<{ odd: boolean; disabled: boolean }>`
  display: grid;
  gap: 1rem;
  grid-template-columns: 40px auto;
  padding: 2rem;
  ${({ odd }) => odd && "background-color: #242531;"};
`

const Index = styled(Box).attrs({
  gap: "0",
  align: "center",
  justifyContent: "center",
})`
  width: 4rem;
  height: 3rem;
`

const TimestampControls = styled(Controls)`
  justify-items: flex-start;
`

export const Column = ({
  action,
  disabled,
  column,
  index,
  onSetTimestamp,
  onFocus,
  timestamp,
  lastFocusedIndex,
}: {
  action: Action
  disabled: boolean
  column: SchemaColumn
  index: number
  onSetTimestamp: (name: string) => void
  onFocus: (index: number) => void
  timestamp: string
  lastFocusedIndex?: number
}) => {
  const [name, setName] = useState(column.name)

  if (!column) {
    return null
  }

  return (
    <Root
      key={column.name}
      odd={index % 2 !== 0}
      disabled={disabled}
      data-hook={`table-schema-dialog-column-${index}`}
      onFocus={() => onFocus(index)}
    >
      <Index>
        <IndexNumber color="foreground">{index + 1}</IndexNumber>
      </Index>

      <Box flexDirection="column" gap="1rem" align="stretch">
        <Controls>
          <Form.Item name={`schemaColumns.${index}.name`}>
            <Form.Input
              placeholder="Name"
              disabled={disabled}
              defaultValue={column.name}
              onChange={(e) => setName(e.target.value)}
              name={`schemaColumns.${index}.name`}
              autoComplete="off"
              required
              {...(lastFocusedIndex === index && { autoFocus: true })}
            />
          </Form.Item>

          <Form.Item name={`schemaColumns.${index}.type`}>
            <Form.Select
              defaultValue={action === "import" ? column.type : "VARCHAR"}
              name={`schemaColumns.${index}.type`}
              options={supportedColumnTypes.filter((type) =>
                type.value === "" && action === "add" ? false : true,
              )}
            />
          </Form.Item>
        </Controls>

        {isTimestamp(column.type) && (
          <Box flexDirection="column" gap="1rem">
            <TimestampControls>
              {action === "import" && (
                <Form.Item name={`schemaColumns.${index}.pattern`}>
                  <Form.Input
                    name={`schemaColumns.${index}.pattern`}
                    placeholder="Dataset pattern"
                    defaultValue={
                      column.pattern !== ""
                        ? column.pattern
                        : getTimestampFormat(column.type)
                    }
                    required
                  />
                </Form.Item>
              )}

              <IconWithTooltip
                icon={
                  <Button
                    disabled={name === ""}
                    data-hook={`table-schema-dialog-column-${index}-designated-button`}
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
                        onChange={() => {}}
                      />
                    }
                  >
                    Designated
                  </Button>
                }
                tooltip="Mark this column as a designated timestamp"
                placement="top"
              />
            </TimestampControls>
            {action === "import" && (
              <Text color="gray2">
                Example: {DEFAULT_TIMESTAMP_FORMAT}
                <br />
                <DocsLink
                  url="https://questdb.io/docs/reference/function/date-time/#timestamp-format"
                  text="Timestamp format docs"
                  tooltipText="Timestamp format documentation"
                />
              </Text>
            )}
          </Box>
        )}

        {column.type === "GEOHASH" && (
          <Controls>
            <Form.Item name={`schemaColumns.${index}.precision`}>
              <Form.Input
                name={`schemaColumns.${index}.precision`}
                placeholder="Precision"
                required
              />
            </Form.Item>
            <DocsLink
              url="https://questdb.io/docs/concept/geohashes/#specifying-geohash-precision"
              text="Docs"
              tooltipText="GEOHASH type documentation"
            />
          </Controls>
        )}
      </Box>
    </Root>
  )
}
