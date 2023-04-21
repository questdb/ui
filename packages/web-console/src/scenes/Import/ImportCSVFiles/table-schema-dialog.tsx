import React, { useEffect, useState } from "react"
import { ProcessedFile } from "./types"
import { Button } from "@questdb/react-components"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import styled from "styled-components"
import { Table as TableIcon, Edit } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { Form } from "../../../components/Form"
import { SchemaColumn } from "utils"
import { TableSchemaColumns } from "./table-schema-columns"
import { Drawer } from "../../../components/Drawer"

const StyledTableIcon = styled(TableIcon)`
  color: ${({ theme }) => theme.color.foreground};
`

const Content = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
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

export const TableSchemaDialog = ({
  file,
  open,
  onOpenChange,
  onSchemaChange,
}: Props) => {
  const name = file.table_name ?? file.fileObject.name
  const [defaults, setDefaults] = useState<FormValues>({
    schemaColumns: [],
    partitionBy: "NONE",
    timestamp: "",
  })

  useEffect(() => {
    if (file.schema) {
      setDefaults({
        schemaColumns: file.schema,
        partitionBy: file.partitionBy,
        timestamp: file.timestamp,
      })
    }
  }, [file])

  const columnCount = defaults.schemaColumns.length

  return (
    <Drawer
      title={
        <Box gap="0.5rem">
          <StyledTableIcon size="20px" />
          <Text color="foreground">Table schema</Text>
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
            ? `${columnCount} column${columnCount > 1 ? "s" : ""}`
            : "Add"}
        </Button>
      }
    >
      <Form<FormValues>
        name="table-schema"
        defaultValues={defaults}
        onSubmit={(values) => {
          onSchemaChange(values)
          onOpenChange(undefined)
        }}
      >
        <Box gap="0" flexDirection="column">
          <Content>
            <Drawer.GroupHeader>
              <Text color="foreground">Settings</Text>
            </Drawer.GroupHeader>

            <Drawer.GroupItem direction="column">
              <Form.Item
                name="partitionBy"
                label="Partition by"
                helperText="Important: If you're changing the partitioning strategy, you'll need to set `Write mode` to `Overwrite` in Settings."
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

            <TableSchemaColumns schema={defaults.schemaColumns} />
          </Content>

          <Drawer.Actions>
            <Form.Cancel<FormValues>
              prefixIcon={<Undo size={18} />}
              variant="secondary"
              onClick={() => {
                onOpenChange(undefined)
              }}
            >
              Dismiss
            </Form.Cancel>

            <Form.Submit prefixIcon={<TableIcon size={18} />} variant="success">
              Save
            </Form.Submit>
          </Drawer.Actions>
        </Box>
      </Form>
    </Drawer>
  )
}
