import React, { useEffect, useState } from "react"
import { ProcessedFile } from "./types"
import {
  AlertDialog,
  ForwardRef,
  Button,
  Overlay,
  Select,
} from "@questdb/react-components"
import { Box } from "../../../components/Box"
import styled from "styled-components"
import { Table as TableIcon, Edit } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { Form } from "../../../components/Form"
import { SchemaColumn } from "utils"
import { TableSchemaColumns } from "./table-schema-columns"

const StyledDescription = styled(AlertDialog.Description)`
  display: grid;
  gap: 2rem;
`

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
  const [schema, setSchema] = useState<SchemaColumn[]>([])

  useEffect(() => {
    if (file.schema) {
      setSchema(file.schema)
    }
  }, [file])

  const columnCount = schema.length

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Trigger asChild>
        <ForwardRef>
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
        </ForwardRef>
      </AlertDialog.Trigger>

      <AlertDialog.Portal>
        <ForwardRef>
          <Overlay primitive={AlertDialog.Overlay} />
        </ForwardRef>

        <Form<FormValues>
          name="table-schema"
          defaultValues={{ schemaColumns: schema }}
          onSubmit={(values) => {
            onSchemaChange(values)
            onOpenChange(undefined)
          }}
        >
          <AlertDialog.Content>
            <AlertDialog.Title>
              <Box>
                <TableIcon size="20px" />
                Table schema
              </Box>
            </AlertDialog.Title>

            <StyledDescription>
              <TableSchemaColumns schema={schema} />
            </StyledDescription>

            <AlertDialog.ActionButtons>
              <AlertDialog.Cancel asChild>
                <Button
                  prefixIcon={<Undo size={18} />}
                  skin="secondary"
                  onClick={() => onOpenChange(undefined)}
                >
                  Dismiss
                </Button>
              </AlertDialog.Cancel>

              <AlertDialog.Action asChild>
                <ForwardRef>
                  <Form.Submit
                    prefixIcon={<TableIcon size={18} />}
                    variant="success"
                  >
                    Save
                  </Form.Submit>
                </ForwardRef>
              </AlertDialog.Action>
            </AlertDialog.ActionButtons>
          </AlertDialog.Content>
        </Form>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
