import React, { useCallback, useEffect, useState } from "react"
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

export const Columns = ({
  file,
  schema,
}: {
  file: ProcessedFile
  schema: SchemaColumn[]
}) => {
  const { setValue, watch } = useFormContext()
  const { append, remove } = useFieldArray({
    name: "schemaColumns",
  })
  const [columns, setColumns] = useState<SchemaColumn[]>(schema)
  const [lastTypeChanged, setLastTypeChanged] = useState("")

  const watchTimestamp = watch("timestamp")

  const isEditLocked = file.exists && file.table_name === file.fileObject.name

  const addColumn = () => {
    const newColumn = {
      name: "",
      type: "",
      pattern: "",
      precision: "",
    }
    append(newColumn)
    setColumns([...columns, newColumn])
  }

  const listItemContent = useCallback(
    (index: number) => {
      const column = columns[index]

      if (!column) return null

      return (
        <>
          <Column
            file={file}
            index={index}
            column={column}
            onNameChange={(name) => {
              const cols = [...columns]
              cols[index].name = name
              setColumns(cols)
            }}
            onTypeChange={(type) => {
              const cols = [...columns]
              cols[index].type = type
              setColumns(cols)
              setLastTypeChanged(type)
            }}
            onRemove={(index) => {
              remove(index)
              const cols = [...columns]
              cols.splice(index, 1)
              setColumns(cols)
            }}
            onSetTimestamp={(name) => {
              setValue("timestamp", watchTimestamp === name ? "" : name)
            }}
            timestamp={watchTimestamp}
          />

          {index === columns.length - 1 && !isEditLocked && (
            <AddColumn onAdd={addColumn} />
          )}
        </>
      )
    },
    [columns.length, watchTimestamp, lastTypeChanged],
  )

  useEffect(() => {
    setValue("schemaColumns", schema)
  }, [schema])

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
        {columns.length > 0 ? (
          <VirtualList
            itemContent={listItemContent}
            totalCount={columns.length}
          />
        ) : (
          !isEditLocked && <AddColumn onAdd={addColumn} />
        )}
      </SchemaRoot>

      <Form.Input name="timestamp" hidden />
    </>
  )
}
