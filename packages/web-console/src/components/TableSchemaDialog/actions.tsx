import React from "react"
import { Button } from "@questdb/react-components"
import { Box } from "../Box"
import { DeleteBin2, Table as TableIcon } from "@styled-icons/remix-line"
import { Form } from "../Form"
import { PopperHover } from "../PopperHover"
import { Tooltip } from "../Tooltip"
import { useFieldArray, useFormContext } from "react-hook-form"
import type { Action, SchemaColumn } from "./types"
import { InsertRowBottom, InsertRowTop } from "@styled-icons/remix-editor"

export const Actions = ({
  action,
  ctaText,
  lastFocusedIndex,
  onAdded,
  isEditLocked,
}: {
  action: Action
  ctaText: string
  lastFocusedIndex?: number
  onAdded: (index?: number) => void
  isEditLocked?: boolean
}) => {
  const newEntry = {
    name: "",
    type: action === "import" ? "" : "STRING",
    pattern: "",
    precision: "",
  }

  const { insert } = useFieldArray({
    name: "schemaColumns",
  })
  const { getValues, setValue } = useFormContext()
  const watchSchemaColumns = getValues()["schemaColumns"]

  return (
    <Box gap="1rem">
      {!isEditLocked && (
        <React.Fragment>
          <PopperHover
            trigger={
              <Button
                disabled={
                  watchSchemaColumns.length === 0 ||
                  lastFocusedIndex === undefined
                }
                skin="secondary"
                type="button"
                onClick={() => {
                  setValue(
                    "schemaColumns",
                    watchSchemaColumns.filter(
                      (_: SchemaColumn, i: number) => i !== lastFocusedIndex,
                    ),
                  )
                  onAdded(undefined)
                }}
              >
                <DeleteBin2 size="18px" />
              </Button>
            }
            placement="bottom"
          >
            <Tooltip>
              {lastFocusedIndex !== undefined &&
                `Remove column ${lastFocusedIndex + 1}`}
            </Tooltip>
          </PopperHover>
          <PopperHover
            trigger={
              <Button
                disabled={
                  watchSchemaColumns.length === 0 ||
                  lastFocusedIndex === undefined
                }
                skin="secondary"
                type="button"
                onClick={() => {
                  const index =
                    lastFocusedIndex !== undefined
                      ? lastFocusedIndex
                      : watchSchemaColumns.length
                  insert(index, newEntry)
                  onAdded(index)
                }}
              >
                <InsertRowTop size="20px" />
              </Button>
            }
            placement="bottom"
          >
            <Tooltip>
              {lastFocusedIndex !== undefined
                ? `Insert column above ${lastFocusedIndex + 1}`
                : `Insert column`}
            </Tooltip>
          </PopperHover>

          <PopperHover
            trigger={
              <Button
                skin="secondary"
                type="button"
                onClick={() => {
                  const index =
                    lastFocusedIndex !== undefined
                      ? lastFocusedIndex + 1
                      : watchSchemaColumns.length
                  insert(index, newEntry)
                  onAdded(index)
                }}
              >
                <InsertRowBottom size="20px" />
              </Button>
            }
            placement="bottom"
          >
            <Tooltip>
              {lastFocusedIndex !== undefined
                ? `Insert column below ${lastFocusedIndex + 1}`
                : `Insert column`}
            </Tooltip>
          </PopperHover>
        </React.Fragment>
      )}
      <Form.Submit prefixIcon={<TableIcon size={18} />} variant="success">
        {ctaText}
      </Form.Submit>
    </Box>
  )
}
