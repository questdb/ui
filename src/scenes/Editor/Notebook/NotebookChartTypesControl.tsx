import React, { useRef, useState } from "react"
import { ShapesIcon, WarningIcon } from "@phosphor-icons/react"
import { useTheme } from "styled-components"
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const theme = useTheme()
  const count = settings.chartTypes?.length ?? 0
  const waiting =
    settings.chartTypes?.filter((t) => t.allowed !== true).length ?? 0
  const label =
    count === 0
      ? "Chart types"
      : waiting > 0
        ? `Chart types (${count} defined, ${waiting} not allowed to run)`
        : `Chart types (${count} defined)`

  return (
    <>
      <Tooltip content={label}>
        <Button
          variant="secondary"
          aria-label={label}
          data-hook="notebook-chart-types"
          onClick={(event) => {
            if (event.currentTarget instanceof HTMLButtonElement)
              triggerRef.current = event.currentTarget
            setOpen(true)
          }}
        >
          <ShapesIcon size={18} />
          {count > 0 && count}
          {waiting > 0 && (
            <WarningIcon
              size={14}
              weight="fill"
              color={theme.color.statusWarning}
              aria-hidden
            />
          )}
        </Button>
      </Tooltip>
      <ChartTypesDialog
        open={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
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
