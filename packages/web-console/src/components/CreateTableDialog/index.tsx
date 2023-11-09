import React, { useEffect, useState } from "react"
import { Dialog as TableSchemaDialog } from "../../components/TableSchemaDialog/dialog"
import { useDispatch, useSelector } from "react-redux"
import { selectors, actions } from "../../store"
import { Table as TableIcon } from "@styled-icons/remix-line"
import { SchemaFormValues } from "components/TableSchemaDialog/types"
import { formatTableSchemaQuery } from "../../utils/formatTableSchemaQuery"
import { useEditor } from "../../providers"
import { PrimaryToggleButton } from "../../components"
import { BUTTON_ICON_SIZE } from "../../consts"
import { IconWithTooltip } from "../../components/IconWithTooltip"

export const CreateTableDialog = () => {
  const [addTableDialogOpen, setAddTableDialogOpen] = useState<
    string | undefined
  >(undefined)
  const dispatch = useDispatch()
  const tables = useSelector(selectors.query.getTables)
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const { readOnly } = useSelector(selectors.console.getConfig)
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

  useEffect(() => {
    setAddTableDialogOpen(activeSidebar === "create" ? "add" : undefined)
  }, [activeSidebar])

  useEffect(() => {
    if (addTableDialogOpen !== undefined) {
      dispatch(actions.console.setActiveSidebar("create"))
    }
  }, [addTableDialogOpen])

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
        <IconWithTooltip
          icon={
            <PrimaryToggleButton
              data-hook="create-table-panel-button"
              readOnly={readOnly}
              selected={addTableDialogOpen !== undefined}
              {...(!readOnly && {
                onClick: () => {
                  dispatch(
                    actions.console.setActiveSidebar(
                      addTableDialogOpen ? undefined : "create",
                    ),
                  )
                },
              })}
            >
              <TableIcon size={BUTTON_ICON_SIZE} />
            </PrimaryToggleButton>
          }
          placement="left"
          tooltip={
            readOnly
              ? "To use this feature, turn off read-only mode in the configuration file"
              : "Create table"
          }
        />
      }
      ctaText="Create"
    />
  )
}
