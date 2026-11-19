import React, { useState } from "react"
import { ShapesIcon } from "@phosphor-icons/react"
import { Button, Tooltip } from "../../../components"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookState,
} from "./NotebookProvider"
import { signalUserEdit } from "../../../utils/notebooks/notebookAIBridge"
import { ChartTypesDialog } from "./customChart/ChartTypesDialog"

// The notebook's chart types (JavaScript custom series), from the toolbar.
export const NotebookChartTypesControl: React.FC = () => {
  const { settings, cells } = useNotebookState()
  const { saveChartTypes } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const [open, setOpen] = useState(false)
  const count = settings.chartTypes?.length ?? 0
  const label = count === 0 ? "Chart types" : `Chart types (${count} defined)`

  return (
    <>
      <Tooltip content={label}>
        <Button
          variant="secondary"
          aria-label={label}
          data-hook="notebook-chart-types"
          onClick={() => setOpen(true)}
        >
          <ShapesIcon size={18} />
          {count > 0 && count}
        </Button>
      </Tooltip>
      <ChartTypesDialog
        open={open}
        onOpenChange={setOpen}
        types={settings.chartTypes}
        cells={cells}
        onSave={(types, renames) => {
          signalUserEdit(bufferId)
          saveChartTypes(types, renames)
        }}
      />
    </>
  )
}
