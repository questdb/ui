import React from "react"
import { CrosshairSimpleIcon } from "@phosphor-icons/react"
import { Button, DropdownMenu, Tooltip } from "../../../components"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookState,
} from "./NotebookProvider"
import type { ChartSync } from "../../../store/notebook"
import { signalUserEdit } from "../../../utils/notebooks/notebookAIBridge"

// The notebook setting that links its time charts: a shared crosshair (with
// or without each chart's tooltip) and synced zoom.

const CROSSHAIR_LABELS: Record<ChartSync["crosshair"], string> = {
  off: "No shared crosshair",
  line: "Shared crosshair",
  tooltip: "Shared crosshair and tooltips",
}

export const NotebookChartSyncControl: React.FC = () => {
  const { settings } = useNotebookState()
  const { updateSettings } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const sync: ChartSync = settings.chartSync ?? {
    crosshair: "off",
    zoom: false,
  }
  const active = sync.crosshair !== "off" || sync.zoom

  const save = (next: ChartSync) => {
    signalUserEdit(bufferId)
    updateSettings({
      chartSync: next.crosshair === "off" && !next.zoom ? undefined : next,
    })
  }

  return (
    <DropdownMenu.Root>
      <Tooltip content="Link time charts">
        <DropdownMenu.Trigger asChild>
          <Button
            variant={active ? "primary" : "secondary"}
            aria-label="Link time charts"
            data-hook="notebook-chart-sync"
          >
            <CrosshairSimpleIcon size={18} />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4}>
          {(["off", "line", "tooltip"] as const).map((crosshair) => (
            <DropdownMenu.CheckboxItem
              key={crosshair}
              checked={sync.crosshair === crosshair}
              onSelect={() => save({ ...sync, crosshair })}
            >
              {CROSSHAIR_LABELS[crosshair]}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Divider />
          <DropdownMenu.CheckboxItem
            checked={sync.zoom}
            onSelect={() => save({ ...sync, zoom: !sync.zoom })}
          >
            Zoom time charts together
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
