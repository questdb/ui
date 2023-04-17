import React, { useEffect } from "react"
import styled from "styled-components"
import { useForm, useFieldArray } from "react-hook-form"
import { SchemaColumn } from "utils"
import { Box } from "../../../components/Box"
import { Form } from "../../../components/Form"
import { Button } from "@questdb/react-components"
import { AddCircle, CloseCircle } from "styled-icons/remix-line"

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
]

const ColumnBox = styled(Box).attrs({ align: "flex-end", gap: "2rem" })`
  width: 100%;
`

export const TableSchemaColumns = ({ schema }: { schema: SchemaColumn[] }) => {
  const { control, reset } = useForm()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "schemaColumns",
  })

  useEffect(() => {
    reset({ schemaColumns: schema })
  }, [schema])

  return (
    <>
      {fields.map((field, index) => (
        <Box
          gap="1rem"
          flexDirection="column"
          align="flex-start"
          key={field.id}
        >
          <ColumnBox>
            <Form.Item name={`schemaColumns.${index}.name`} label="Column name">
              <Form.Input name={`schemaColumns.${index}.name`} />
            </Form.Item>
            <Form.Item name={`schemaColumns.${index}.type`} label="Column type">
              <Form.Select
                name={`schemaColumns.${index}.type`}
                options={columnTypes}
              />
            </Form.Item>

            <Button
              skin="transparent"
              onClick={() => remove(index)}
              type="button"
            >
              <CloseCircle size="18px" />
            </Button>
          </ColumnBox>
        </Box>
      ))}
      <Box align="center" justifyContent="center">
        <Button
          prefixIcon={<AddCircle size="18px" />}
          skin="transparent"
          onClick={() =>
            append({
              name: "",
              type: "AUTO",
            })
          }
          type="button"
        >
          Add
        </Button>
      </Box>
    </>
  )
}
