import React, { useState } from "react"
import { Form } from "../../components/Form"
import { IconWithTooltip, Text } from "../../components"
import { Box } from "../../components/Box"
import { Button } from "@questdb/react-components"
import { DEFAULT_TIMESTAMP_FORMAT } from "./const"
import styled from "styled-components"
import { SchemaColumn } from "utils"
import { Controls } from "./controls"
import { Action } from "./types"
import { DocsLink } from "./docs-link"

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
  { label: "SYMBOL", value: "SYMBOL" },
  { label: "TIMESTAMP", value: "TIMESTAMP" },
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
}: {
  action: Action
  disabled: boolean
  column: SchemaColumn
  index: number
  onSetTimestamp: (name: string) => void
  onFocus: (index: number) => void
  timestamp: string
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
            />
          </Form.Item>

          <Form.Item name={`schemaColumns.${index}.type`}>
            <Form.Select
              defaultValue={action === "import" ? column.type : "STRING"}
              name={`schemaColumns.${index}.type`}
              options={supportedColumnTypes.filter((type) =>
                type.value === "" && action === "add" ? false : true,
              )}
            />
          </Form.Item>
        </Controls>

        {column.type === "TIMESTAMP" && (
          <Box flexDirection="column" gap="1rem">
            <TimestampControls>
              {action === "import" && (
                <Form.Item name={`schemaColumns.${index}.pattern`}>
                  <Form.Input
                    name={`schemaColumns.${index}.pattern`}
                    placeholder="Pattern"
                    defaultValue={
                      column.pattern !== ""
                        ? column.pattern
                        : DEFAULT_TIMESTAMP_FORMAT
                    }
                    required
                  />
                </Form.Item>
              )}

              <IconWithTooltip
                icon={
                  <Button
                    disabled={name === ""}
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
              <Text color="gray2">Example: {DEFAULT_TIMESTAMP_FORMAT}</Text>
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
