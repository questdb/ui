import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { useForm, useFieldArray, useFormContext } from "react-hook-form"
import { SchemaColumn } from "utils"
import { Box } from "../../../components/Box"
import { Form } from "../../../components/Form"
import { IconWithTooltip } from "../../../components"
import { Button } from "@questdb/react-components"
import { AddCircle, Close } from "styled-icons/remix-line"
import { SortDown } from "styled-icons/boxicons-regular"

const columnTypes: { label: string; value: string }[] = [
  { label: "AUTO", value: "" },
  { label: "BOOLEAN", value: "BOOLEAN" },
  { label: "BYTE", value: "BYTE" },
  { label: "DOUBLE", value: "DOUBLE" },
  { label: "DATE", value: "DATE" },
  { label: "FLOAT", value: "FLOAT" },
  { label: "INT", value: "INT" },
  { label: "LONG", value: "LONG" },
  { label: "SHORT", value: "SHORT" },
  { label: "CHAR", value: "CHAR" },
  { label: "STRING", value: "STRING" },
  { label: "SYMBOL", value: "SYMBOL" },
  { label: "TIMESTAMP", value: "TIMESTAMP" },
]

const partitionByOptions = ["NONE", "HOUR", "DAY", "MONTH", "YEAR"]

const Row = styled(Box).attrs({
  flexDirection: "column",
  align: "flex-start",
  gap: "1rem",
})`
  width: 100%;
`

const Columns = styled(Box).attrs({ align: "flex-end", gap: "1rem" })`
  width: 100%;

  > button {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
`

export const TableSchemaColumns = ({ schema }: { schema: SchemaColumn[] }) => {
  const { setValue, watch, reset } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    name: "schemaColumns",
  })
  const [columnNames, setColumnNames] = useState<string[]>([])
  const watchTimestamp = watch("timestamp")

  useEffect(() => {
    reset({ schemaColumns: schema })
  }, [schema])

  return (
    <>
      {fields.map((field, index) => (
        <Row
          gap="1rem"
          flexDirection="column"
          align="flex-start"
          key={field.id}
        >
          <Columns>
            <Form.Item name={`schemaColumns.${index}.name`} label="Name">
              <Form.Input
                name={`schemaColumns.${index}.name`}
                onChange={(e) => {
                  const cols = columnNames
                  cols[index] = e.target.value
                  setColumnNames(cols)
                }}
              />
            </Form.Item>
            <Form.Item name={`schemaColumns.${index}.type`} label="Type">
              <Form.Select
                name={`schemaColumns.${index}.type`}
                options={columnTypes}
              />
            </Form.Item>

            <IconWithTooltip
              icon={
                <Button
                  skin={
                    watchTimestamp !== "" &&
                    columnNames[index] !== "" &&
                    watchTimestamp === columnNames[index]
                      ? "success"
                      : "transparent"
                  }
                  onClick={() => {
                    setValue("timestamp", columnNames[index])
                  }}
                  type="button"
                >
                  <SortDown size="18px" />
                </Button>
              }
              tooltip="Set as designated timestamp"
              placement="bottom"
            />

            <Button
              skin="transparent"
              onClick={() => {
                remove(index)
                if (watchTimestamp === columnNames[index]) {
                  setValue("timestamp", undefined)
                }
                setColumnNames(columnNames.filter((_, i) => i !== index))
              }}
              type="button"
            >
              <Close size="18px" />
            </Button>
          </Columns>
        </Row>
      ))}
      <Box align="center" justifyContent="center">
        <Button
          prefixIcon={<AddCircle size="18px" />}
          skin="transparent"
          onClick={() => {
            append({
              name: "",
              type: "",
            })
            setColumnNames([...columnNames, ""])
          }}
          type="button"
        >
          Add column
        </Button>
      </Box>
      <Columns>
        <Form.Item name="partitionBy" label="Partition by">
          <Form.Select
            name="partitionBy"
            options={partitionByOptions.map((item) => ({
              label: item,
              value: item,
            }))}
          />
        </Form.Item>
      </Columns>
      <Form.Input name="timestamp" hidden />
    </>
  )
}
