import React, { useEffect, useState } from "react"
import { Button } from "@questdb/react-components"
import { Box } from "../Box"
import { Text } from "../Text"
import styled from "styled-components"
import { Table as TableIcon, Edit } from "styled-icons/remix-line"
import { InfoCircle, Undo } from "styled-icons/boxicons-regular"
import { Form } from "../Form"
import { Columns } from "./columns"
import { Drawer } from "../Drawer"
import { PopperHover } from "../PopperHover"
import { Tooltip } from "../Tooltip"
import { Action, SchemaColumn, SchemaFormValues } from "./types"
import Joi from "joi"
import { isValidTableName } from "./isValidTableName"
import * as QuestDB from "../../utils/questdb"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

const StyledContentWrapper = styled(Drawer.ContentWrapper)`
  --columns: auto 120px; /* magic numbers to fit input, type dropdown and remove button nicely */
`

const Items = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  height: 100%;
`

const Inputs = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
  height: 100%;
  overflow: auto;
`

const Controls = styled.div<{ action: Action }>`
  display: grid;
  grid-template-columns: ${({ action }) =>
    action === "add" ? "auto 120px 120px" : "1fr"};
  gap: 1rem;
  align-items: flex-start;
  width: 100%;
`

const partitionByOptions = ["NONE", "HOUR", "DAY", "MONTH", "YEAR"]

type Props = {
  action: Action
  open: boolean
  isEditLocked: boolean
  hasWalSetting: boolean
  walEnabled?: boolean
  onOpenChange: (openedFileName?: string) => void
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
  const dispatch = useDispatch()

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
      .unique((a, b) => a.name === b.name)
      .messages({
        "array.required": "Please add at least one column",
        "array.unique": "Column names must be unique",
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
      mode={action === "add" ? "side" : "modal"}
      title={name !== "" ? `Table schema for ${name}` : "Create table"}
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
      onOpenChange={(isOpen) => {
        if (isOpen && action === "add") {
          dispatch(
            actions.console.setActivePanel(isOpen ? "create" : "console"),
          )
        }
      }}
    >
      <StyledContentWrapper>
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
              <Drawer.GroupItem direction="column">
                <Controls action={action}>
                  {action === "add" && (
                    <Form.Item name="name" label="Table name">
                      <Form.Input name="name" autoComplete="off" />
                    </Form.Item>
                  )}

                  <Box align="flex-end">
                    <Form.Item
                      name="partitionBy"
                      label={
                        <PopperHover
                          trigger={
                            <Box
                              align="center"
                              justifyContent="center"
                              gap="0.5rem"
                            >
                              <InfoCircle size="14" />
                              <span>Partition by</span>
                            </Box>
                          }
                          placement="bottom"
                        >
                          <Tooltip>
                            Splits data into smaller chunks by intervals of time
                            in order to improve the performance and scalability
                            of the database system.
                          </Tooltip>
                        </PopperHover>
                      }
                    >
                      <Form.Select
                        name="partitionBy"
                        options={partitionByOptions.map((item) => ({
                          label: item,
                          value: item,
                        }))}
                      />
                    </Form.Item>
                  </Box>

                  {hasWalSetting && (
                    <Box align="flex-end">
                      <Form.Item
                        name="walEnabled"
                        label={
                          <PopperHover
                            trigger={
                              <Box
                                align="center"
                                justifyContent="center"
                                gap="0.5rem"
                              >
                                <InfoCircle size="14" />
                                <span>WAL</span>
                              </Box>
                            }
                            placement="bottom"
                          >
                            <Tooltip>
                              WAL (Write-Ahead Log) allows concurrent data
                              ingestion and modifications via multiple
                              interfaces as well as table schema changes.
                              {currentValues.partitionBy === "NONE" && (
                                <>
                                  <br />
                                  <br />
                                  To enable WAL, set `Partition by` to a value
                                  other than NONE.
                                </>
                              )}
                            </Tooltip>
                          </PopperHover>
                        }
                      >
                        <Form.Select
                          name="walEnabled"
                          disabled={currentValues.partitionBy === "NONE"}
                          options={[
                            { label: "Enabled", value: "true" },
                            { label: "Disabled", value: "false" },
                          ]}
                        />
                      </Form.Item>
                    </Box>
                  )}

                  {action === "import" && (
                    <Text color="gray2">
                      If you're changing the partitioning strategy, you'll need
                      to set `Write mode` to `Overwrite` in Settings.
                    </Text>
                  )}
                </Controls>
              </Drawer.GroupItem>

              <Drawer.GroupHeader>
                <Text color="foreground">Columns</Text>
              </Drawer.GroupHeader>

              <Columns action={action} isEditLocked={isEditLocked} />
            </Inputs>

            <Drawer.Actions>
              {action === "import" && (
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
              )}

              <Form.Submit
                prefixIcon={<TableIcon size={18} />}
                variant="success"
              >
                {ctaText}
              </Form.Submit>
            </Drawer.Actions>
          </Items>
        </Form>
      </StyledContentWrapper>
    </Drawer>
  )
}
