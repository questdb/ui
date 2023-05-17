import React, { useCallback, useEffect } from "react"
import styled from "styled-components"
import { useFieldArray, useFormContext } from "react-hook-form"
import { Box } from "../../../../components/Box"
import { Form } from "../../../../components/Form"
import { Text } from "../../../../components"
import { Drawer } from "../../../../components/Drawer"
import { VirtualList } from "../../../../components/VirtualList"
import { Button } from "@questdb/react-components"
import { AddCircle, Alert, Information } from "styled-icons/remix-line"
import { SchemaColumn } from "../types"
import { Column } from "./column"
import { ProcessedFile } from "../types"

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

const AddColumn = ({ onAdd }: { onAdd: () => void }) => (
  <Drawer.GroupItem direction="column">
    <AddBox>
      <Button
        prefixIcon={<AddCircle size="18px" />}
        skin="transparent"
        onClick={onAdd}
        type="button"
      >
        Add column
      </Button>
    </AddBox>
  </Drawer.GroupItem>
)

export const Columns = ({ file }: { file: ProcessedFile }) => {
  const { getValues, setValue, watch } = useFormContext()
  const { append, remove } = useFieldArray({
    name: "schemaColumns",
  })

  const watchTimestamp = watch("timestamp")
  const watchSchemaColumns = getValues()["schemaColumns"]

  const isEditLocked = file.exists && file.table_name === file.fileObject.name

  const addColumn = () => {
    append({
      name: "",
      type: "",
      pattern: "",
      precision: "",
    })
  }

  const listItemContent = useCallback(
    (index: number) => {
      if (!watchSchemaColumns[index]) {
        return null
      }

      const column = watch(`schemaColumns.${index}`)

      return (
        <>
          <Column
            column={column}
            disabled={isEditLocked}
            index={index}
            onRemove={(index) => {
              remove(index)
            }}
            onSetTimestamp={(name) => {
              setValue("timestamp", watchTimestamp === name ? "" : name)
            }}
            timestamp={watchTimestamp}
          />

          {index === watchSchemaColumns.length - 1 && !isEditLocked && (
            <AddColumn onAdd={addColumn} />
          )}
        </>
      )
    },
    [
      watchTimestamp,
      watchSchemaColumns.length,
      watchSchemaColumns.map((c: SchemaColumn) => c.type).join(","),
    ],
  )

  return (
    <>
      {!isEditLocked && (
        <Disclaimer isEditLocked={false}>
          <Information size="20px" />
          <Text color="foreground">
            Column names have to match the CSV header.
            <br />
            Order is not important.
          </Text>
        </Disclaimer>
      )}
      <SchemaRoot>
        {watchSchemaColumns.length > 0 ? (
          <VirtualList
            itemContent={listItemContent}
            totalCount={watchSchemaColumns.length}
          />
        ) : (
          !isEditLocked && <AddColumn onAdd={addColumn} />
        )}
      </SchemaRoot>

      <Form.Input name="timestamp" hidden />
    </>
  )
}
