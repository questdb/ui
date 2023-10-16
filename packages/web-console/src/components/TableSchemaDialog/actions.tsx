import React from "react"
import { Button } from "@questdb/react-components"
import { Box } from "../Box"
import { Table as TableIcon } from "@styled-icons/remix-line"
import { Form } from "../Form"
import { PopperHover } from "../PopperHover"
import { Tooltip } from "../Tooltip"
import { useFieldArray } from "react-hook-form"
import type { Action } from "./types"
import { InsertRowBottom, InsertRowTop } from "@styled-icons/remix-editor"

export const Actions = ({
  action,
  ctaText,
  lastFocusedIndex,
  columnCount,
}: {
  action: Action
  ctaText: string
  lastFocusedIndex?: number
  columnCount: number
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

  return (
    <Box gap="1rem">
      <PopperHover
        trigger={
          <Button
            disabled={columnCount === 0}
            skin="secondary"
            type="button"
            onClick={() =>
              insert(
                lastFocusedIndex !== undefined ? lastFocusedIndex : columnCount,
                newEntry,
              )
            }
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
            onClick={() =>
              insert(
                lastFocusedIndex !== undefined
                  ? lastFocusedIndex + 1
                  : columnCount,
                newEntry,
              )
            }
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
      <Form.Submit prefixIcon={<TableIcon size={18} />} variant="success">
        {ctaText}
      </Form.Submit>
    </Box>
  )
}
