import React, { useEffect, useState } from "react"
import { ProcessedFile } from "../types"
import { Button } from "@questdb/react-components"
import { Box } from "../../../../components/Box"
import { Text } from "../../../../components/Text"
import styled from "styled-components"
import { Table as TableIcon, Edit } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { Form } from "../../../../components/Form"
import { Columns } from "./columns"
import { Drawer } from "../../../../components/Drawer"
import { SchemaColumn } from "../types"
import Joi from "joi"

const StyledTableIcon = styled(TableIcon)`
  color: ${({ theme }) => theme.color.foreground};
`

const FormWrapper = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
  height: calc(100vh - 6.1rem);

  form {
    height: 100%;
  }
`

const Items = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  height: 100%;
`

const Inputs = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
  height: 100%;
  overflow: auto;
`

const partitionByOptions = ["NONE", "HOUR", "DAY", "MONTH", "YEAR"]

type FormValues = {
  schemaColumns: SchemaColumn[]
  partitionBy: string
  timestamp: string
}

type Props = {
  open: boolean
  onOpenChange: (openedFileName: string | undefined) => void
  onSchemaChange: (values: FormValues) => void
  file: ProcessedFile
}

export const Dialog = ({ file, open, onOpenChange, onSchemaChange }: Props) => {
  const name = file.table_name ?? file.fileObject.name

  const formDefaults = {
    schemaColumns: [],
    partitionBy: "NONE",
    timestamp: "",
  }

  const [defaults, setDefaults] = useState<FormValues>(formDefaults)
  const [currentValues, setCurrentValues] = useState<FormValues>(formDefaults)

  const resetToDefaults = () => {
    setDefaults({
      schemaColumns: file.schema,
      partitionBy: file.partitionBy,
      timestamp: file.timestamp,
    })
  }

  const schema = Joi.object({
    partitionBy: Joi.string()
      .required()
      .custom((value, helpers) => {
        if (value !== "NONE" && currentValues.timestamp === "") {
          return helpers.error("string.timestampRequired")
        }
        return value
      })
      .messages({
        "string.timestampRequired":
          "Designated timestamp is required when partitioning is set to anything other than NONE",
      }),
    timestamp: Joi.string().allow(""),
    schemaColumns: Joi.array(),
  })

  useEffect(() => {
    if (file.schema) {
      resetToDefaults()
    }
  }, [file])

  const columnCount = defaults.schemaColumns.length

  return (
    <Drawer
      title={
        <Box gap="0.5rem">
          <StyledTableIcon size="20px" />
          <Text color="foreground">Table schema for {name}</Text>
        </Box>
      }
      open={open}
      trigger={
        <Button
          skin={columnCount > 0 ? "transparent" : "secondary"}
          prefixIcon={
            columnCount > 0 ? <Edit size="18px" /> : <TableIcon size="18px" />
          }
          onClick={() => onOpenChange(name)}
        >
          {columnCount > 0
            ? `${columnCount} col${columnCount > 1 ? "s" : ""}`
            : "Add"}
        </Button>
      }
      onDismiss={() => {
        resetToDefaults()
        onOpenChange(undefined)
      }}
      withCloseButton
    >
      <FormWrapper>
        <Form<FormValues>
          name="table-schema"
          defaultValues={defaults}
          onSubmit={(values) => {
            onSchemaChange(values)
            onOpenChange(undefined)
          }}
          onChange={(values) => setCurrentValues(values as FormValues)}
          validationSchema={schema}
        >
          <Items>
            <Inputs>
              <Drawer.GroupItem direction="column">
                <Form.Item
                  name="partitionBy"
                  label="Partition by"
                  helperText="If you're changing the partitioning strategy, you'll need to set `Write mode` to `Overwrite` in Settings."
                >
                  <Form.Select
                    name="partitionBy"
                    options={partitionByOptions.map((item) => ({
                      label: item,
                      value: item,
                    }))}
                  />
                </Form.Item>
              </Drawer.GroupItem>

              <Drawer.GroupHeader>
                <Text color="foreground">Columns</Text>
              </Drawer.GroupHeader>

              <Columns file={file} />
            </Inputs>

            <Drawer.Actions>
              <Form.Cancel<FormValues>
                prefixIcon={<Undo size={18} />}
                variant="secondary"
                defaultValues={defaults}
                onClick={() => {
                  onOpenChange(undefined)
                }}
              >
                Dismiss
              </Form.Cancel>

              <Form.Submit
                prefixIcon={<TableIcon size={18} />}
                variant="success"
              >
                Save
              </Form.Submit>
            </Drawer.Actions>
          </Items>
        </Form>
      </FormWrapper>
    </Drawer>
  )
}
