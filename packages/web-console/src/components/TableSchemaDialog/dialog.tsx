import React, { useEffect, useState } from "react"
import { Button } from "@questdb/react-components"
import { Box } from "../Box"
import { Text } from "../Text"
import styled from "styled-components"
import { Table as TableIcon, Edit } from "styled-icons/remix-line"
import { Undo, Book } from "styled-icons/boxicons-regular"
import { Form } from "../Form"
import { Columns } from "./columns"
import { Drawer } from "../Drawer"
import { Action, SchemaColumn, SchemaFormValues } from "./types"
import Joi from "joi"
import { isValidTableName } from "./isValidTableName"
import { Controls } from "./controls"
import * as QuestDB from "../../utils/questdb"

const StyledTableIcon = styled(TableIcon)`
  color: ${({ theme }) => theme.color.foreground};
`

const FormWrapper = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  --columns: auto 120px 40px; /* magic numbers to fit input, type dropdown and remove button nicely */
  width: 100%;
  height: calc(100vh - 6.1rem);

  form {
    width: 100%;
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

const PartitionByBox = styled(Box).attrs({
  gap: "1rem",
  flexDirection: "column",
})`
  width: 100%;
`

const partitionByOptions = ["NONE", "HOUR", "DAY", "MONTH", "YEAR"]

type Props = {
  action: Action
  open: boolean
  isEditLocked: boolean
  hasWalSetting: boolean
  walEnabled?: boolean
  onOpenChange: (openedFileName: string | undefined) => void
  onSchemaChange: (values: SchemaFormValues) => void
  name: string
  schema: SchemaColumn[]
  partitionBy: string
  timestamp: string
  trigger?: React.ReactNode
  tables?: QuestDB.Table[]
  ctaText: string
}

export const Dialog = ({
  action,
  name,
  schema,
  partitionBy,
  timestamp,
  open,
  isEditLocked,
  hasWalSetting,
  walEnabled,
  onOpenChange,
  onSchemaChange,
  trigger,
  tables,
  ctaText,
}: Props) => {
  const formDefaults = {
    name,
    schemaColumns: schema,
    partitionBy,
    timestamp,
    walEnabled: hasWalSetting ? "false" : undefined,
  }

  const [defaults, setDefaults] = useState<SchemaFormValues>(formDefaults)
  const [currentValues, setCurrentValues] =
    useState<SchemaFormValues>(formDefaults)

  const resetToDefaults = () => {
    setDefaults({
      name: name,
      schemaColumns: schema,
      partitionBy: partitionBy,
      timestamp: timestamp,
      walEnabled:
        hasWalSetting && walEnabled !== undefined
          ? walEnabled.toString()
          : undefined,
    })
  }

  const validationSchema = Joi.object({
    name: Joi.string()
      .required()
      .custom((value, helpers) => {
        if (!isValidTableName(value)) {
          return helpers.error("string.validTableName")
        }
        if (action === "add" && tables?.find((table) => table.name === value)) {
          return helpers.error("string.uniqueTableName")
        }
        return value
      })
      .messages({
        "string.empty": "Please enter a name",
        "string.validTableName": "Invalid table name",
        "string.uniqueTableName": "Table name must be unique",
      }),
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
    walEnabled: Joi.any()
      .allow(...["true", "false"])
      .empty(),
    timestamp: Joi.string().allow(""),
    schemaColumns: Joi.array()
      .custom((value, helpers) => {
        if (action === "add" && value.length === 0) {
          return helpers.error("array.required")
        }
        return value
      })
      .messages({
        "array.required": "Please add at least one column",
      }),
  })

  useEffect(() => {
    if (schema) {
      resetToDefaults()
    }
  }, [schema])

  const columnCount = defaults.schemaColumns.length

  return (
    <Drawer
      title={
        <Box gap="0.5rem">
          <StyledTableIcon size="20px" />
          <Text color="foreground">
            {name !== "" ? `Table schema for ${name}` : "Add a new table"}
          </Text>
        </Box>
      }
      open={open}
      trigger={
        trigger ?? (
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
        )
      }
      onDismiss={() => {
        resetToDefaults()
        onOpenChange(undefined)
      }}
      withCloseButton
    >
      <FormWrapper>
        <Form<SchemaFormValues>
          name="table-schema"
          defaultValues={defaults}
          onSubmit={(values) => {
            onSchemaChange(values)
            onOpenChange(undefined)
          }}
          onChange={(values) => setCurrentValues(values as SchemaFormValues)}
          validationSchema={validationSchema}
        >
          <Items>
            <Inputs>
              {action === "add" && (
                <Drawer.GroupItem direction="column">
                  <Form.Item name="name" label="Table name">
                    <Form.Input name="name" />
                  </Form.Item>
                </Drawer.GroupItem>
              )}

              <Drawer.GroupItem direction="column">
                <PartitionByBox>
                  <Controls>
                    <Form.Item name="partitionBy" label="Partition by">
                      <Form.Select
                        name="partitionBy"
                        options={partitionByOptions.map((item) => ({
                          label: item,
                          value: item,
                        }))}
                      />
                    </Form.Item>
                    <a
                      href="https://questdb.io/docs/concept/partitions/"
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
                  {action === "import" && (
                    <Text color="gray2">
                      If you're changing the partitioning strategy, you'll need
                      to set `Write mode` to `Overwrite` in Settings.
                    </Text>
                  )}
                </PartitionByBox>
              </Drawer.GroupItem>

              {hasWalSetting && (
                <Drawer.GroupItem direction="column">
                  <Controls>
                    <Form.Item name="walEnabled" label="Write-Ahead Log (WAL)">
                      <Form.Select
                        name="walEnabled"
                        options={[
                          { label: "Enabled", value: "true" },
                          { label: "Disabled", value: "false" },
                        ]}
                      />
                    </Form.Item>
                    <a
                      href="https://questdb.io/docs/concept/write-ahead-log/"
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
                </Drawer.GroupItem>
              )}

              <Drawer.GroupHeader>
                <Text color="foreground">Columns</Text>
              </Drawer.GroupHeader>

              <Columns action={action} isEditLocked={isEditLocked} />
            </Inputs>

            <Drawer.Actions>
              <Form.Cancel<SchemaFormValues>
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
                {ctaText}
              </Form.Submit>
            </Drawer.Actions>
          </Items>
        </Form>
      </FormWrapper>
    </Drawer>
  )
}