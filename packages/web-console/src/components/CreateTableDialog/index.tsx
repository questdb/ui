import React, { useState } from "react"
import { Dialog as TableSchemaDialog } from "../../components/TableSchemaDialog/dialog"
import { useDispatch, useSelector } from "react-redux"
import { selectors, actions } from "../../store"
import { Table as TableIcon } from "@styled-icons/remix-line"
import { SchemaFormValues } from "components/TableSchemaDialog/types"
import { formatTableSchemaQuery } from "../../utils/formatTableSchemaQuery"
import { useEditor } from "../../providers"
import { PrimaryToggleButton } from "../../components"
import { BUTTON_ICON_SIZE } from "../../consts"

export const CreateTableDialog = () => {
  const [addTableDialogOpen, setAddTableDialogOpen] = useState<
    string | undefined
  >(undefined)
  const dispatch = useDispatch()
  const tables = useSelector(selectors.query.getTables)
  const { appendQuery } = useEditor()

  const handleAddTableSchema = (values: SchemaFormValues) => {
    const { name, partitionBy, timestamp, schemaColumns, walEnabled } = values
    const tableSchemaQuery = formatTableSchemaQuery({
      name,
      partitionBy,
      timestamp,
      walEnabled: walEnabled === "true",
      schemaColumns: schemaColumns.map((column) => ({
        column: column.name,
        type: column.type,
      })),
    })
    appendQuery(tableSchemaQuery, { appendAt: "end" })
    dispatch(actions.query.toggleRunning())
  }

  return (
    <TableSchemaDialog
      action="add"
      isEditLocked={false}
      hasWalSetting={true}
      walEnabled={false}
      name=""
      partitionBy="NONE"
      schema={[]}
      tables={tables}
      timestamp=""
      onOpenChange={(open) => setAddTableDialogOpen(open)}
      open={addTableDialogOpen !== undefined}
      onSchemaChange={handleAddTableSchema}
      trigger={
        <PrimaryToggleButton
          selected={addTableDialogOpen !== undefined}
          onClick={() =>
            setAddTableDialogOpen(
              addTableDialogOpen === undefined ? "add" : undefined,
            )
          }
        >
          <TableIcon size={BUTTON_ICON_SIZE} />
        </PrimaryToggleButton>
      }
      ctaText="Create"
    />
  )
}
