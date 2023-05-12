import React, { useCallback, useEffect, useState } from "react"
import styled from "styled-components"
import { useFieldArray, useFormContext } from "react-hook-form"
import { Box } from "../../../../components/Box"
import { Form } from "../../../../components/Form"
import { Button } from "@questdb/react-components"
import { AddCircle } from "styled-icons/remix-line"
import { Drawer } from "../../../../components/Drawer"
import { SchemaColumn } from "../types"
import { VirtualList } from "../../../../components/VirtualList"
import { Column } from "./column"

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

export const Columns = ({ schema }: { schema: SchemaColumn[] }) => {
  const { setValue, watch } = useFormContext()
  const { append, remove } = useFieldArray({
    name: "schemaColumns",
  })
  const [columns, setColumns] = useState<SchemaColumn[]>(schema)

  const watchTimestamp = watch("timestamp")

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
            }}
            onRemove={(index) => {
              remove(index)
              const cols = [...columns]
              cols.splice(index, 1)
              setColumns(cols)
            }}
            onSetTimestamp={(name) => {
              setValue("timestamp", name)
            }}
            timestamp={watchTimestamp}
          />

          {index === columns.length - 1 && <AddColumn onAdd={addColumn} />}
        </>
      )
    },
    [columns.length, watchTimestamp],
  )

  useEffect(() => {
    setValue("schemaColumns", schema)
  }, [schema])

  return (
    <>
      <SchemaRoot>
        {columns.length > 0 ? (
          <VirtualList
            itemContent={listItemContent}
            totalCount={columns.length}
          />
        ) : (
          <AddColumn onAdd={addColumn} />
        )}
      </SchemaRoot>

      <Form.Input name="timestamp" hidden />
    </>
  )
}
