import React, { useCallback } from "react"
import styled from "styled-components"
import { FieldError, useFormContext } from "react-hook-form"
import { Box } from "../Box"
import { Form } from "../Form"
import { Text } from ".."
import { Drawer } from "../Drawer"
import { VirtualList } from "../VirtualList"
import { Information } from "@styled-icons/remix-line"
import { Action, SchemaColumn } from "./types"
import { Column } from "./column"

const Disclaimer = styled(Box).attrs({ align: "center", gap: "1.5rem" })<{
  isEditLocked: boolean
}>`
  width: 100%;
  padding: 2rem;
  color: ${({ theme, isEditLocked }) =>
    theme.color[isEditLocked ? "orange" : "foreground"]};
`

const SchemaRoot = styled.div`
  width: 100%;
  height: 100%;
`

const Error = styled(Drawer.GroupItem).attrs({ direction: "column" })`
  align-items: center;
`

export const Columns = ({
  action,
  isEditLocked,
  onColumnFocus,
  lastFocusedIndex,
}: {
  action: Action
  isEditLocked: boolean
  onColumnFocus: (index: number) => void
  lastFocusedIndex?: number
}) => {
  const { formState, getValues, setValue, watch } = useFormContext()

  const watchTimestamp = watch("timestamp") as string
  const watchSchemaColumns = getValues()["schemaColumns"] as SchemaColumn[]

  const listItemContent = useCallback(
    (index: number) => {
      const column = watch(`schemaColumns.${index}`) as SchemaColumn

      return (
        <>
          <Column
            action={action}
            column={column}
            disabled={isEditLocked}
            index={index}
            lastFocusedIndex={lastFocusedIndex}
            onFocus={onColumnFocus}
            onSetTimestamp={(name) => {
              setValue("timestamp", watchTimestamp === name ? "" : name)
            }}
            timestamp={watchTimestamp}
          />
        </>
      )
    },
    [
      watchTimestamp,
      watchSchemaColumns.length,
      watchSchemaColumns.map((c: SchemaColumn) => c.type).join(","),
    ],
  )

  const schemaColumnsErrors = formState.errors.schemaColumns as unknown as
    | FieldError[]
    | FieldError
    | undefined

  return (
    <>
      {action === "import" && !isEditLocked && (
        <Disclaimer isEditLocked={false}>
          <Information size="20px" />
          <Text color="foreground">
            Column names have to match the CSV header.
            <br />
            Order is not important.
          </Text>
        </Disclaimer>
      )}
      {schemaColumnsErrors &&
        (Array.isArray(schemaColumnsErrors)
          ? schemaColumnsErrors
          : [schemaColumnsErrors]
        ).map((error) => (
          <Error key={error?.message}>
            <Text color="red">{error?.message}</Text>
          </Error>
        ))}
      <SchemaRoot>
        {watchSchemaColumns.length > 0 && (
          <VirtualList
            itemContent={listItemContent}
            totalCount={watchSchemaColumns.length}
            followOutput
          />
        )}
      </SchemaRoot>

      <Form.Input name="timestamp" hidden />
    </>
  )
}
