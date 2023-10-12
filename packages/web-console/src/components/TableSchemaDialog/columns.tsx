import React, { useCallback } from "react"
import styled from "styled-components"
import { useFieldArray, useFormContext } from "react-hook-form"
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

const AddBox = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  margin: auto;
`

const Error = styled(Drawer.GroupItem).attrs({ direction: "column" })`
  align-items: center;
`

export const Columns = ({
  action,
  isEditLocked,
}: {
  action: Action
  isEditLocked: boolean
}) => {
  const { formState, getValues, setValue, watch } = useFormContext()
  const { append } = useFieldArray({
    name: "schemaColumns",
  })

  const watchTimestamp = watch("timestamp")
  const watchSchemaColumns = getValues()["schemaColumns"]

  const listItemContent = useCallback(
    (index: number) => {
      const column = watch(`schemaColumns.${index}`)

      return (
        <>
          <Column
            action={action}
            column={column}
            disabled={isEditLocked}
            index={index}
            onRemove={(index) => {
              setValue(
                "schemaColumns",
                watchSchemaColumns.filter(
                  (_: SchemaColumn, i: number) => i !== index,
                ),
              )
            }}
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

  const errors = formState.errors["schemaColumns"]

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
      {errors &&
        (Array.isArray(errors) ? errors : [errors]).map((error: any, index) => (
          <Error key={index}>
            <Text color="red">{error.message}</Text>
          </Error>
        ))}
      <SchemaRoot>
        {watchSchemaColumns.length > 0 && (
          <VirtualList
            itemContent={listItemContent}
            totalCount={watchSchemaColumns.length}
            followOutput={true}
          />
        )}
      </SchemaRoot>

      <Form.Input name="timestamp" hidden />
    </>
  )
}
