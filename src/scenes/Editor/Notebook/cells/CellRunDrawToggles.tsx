import React from "react"
import styled from "styled-components"
import { PlayIcon } from "@phosphor-icons/react"
import { Spinner } from "./Spinner"
import { ChartIcon } from "./ChartIcon"
import { Tooltip } from "../../../../components"
import { ctrlCmd } from "../../../../utils/platform"
import {
  NotebookViewToggle,
  NotebookViewToggleSegment,
} from "../NotebookViewToggle"

const ToggleButton = styled(NotebookViewToggleSegment)`
  &&:hover:not(:disabled):not([aria-disabled="true"]):not(
      [aria-pressed="true"]
    ) {
    background: ${({ theme }) => theme.color.glassSurface};
    box-shadow:
      inset 0 0 0 1px ${({ theme }) => theme.color.glassBorder},
      inset 0 -2px 0 ${({ theme }) => theme.color.glassEdge},
      0 3px 9px ${({ theme }) => theme.color.shadowSoft};
    backdrop-filter: blur(2px) saturate(150%);
    -webkit-backdrop-filter: blur(2px) saturate(150%);
  }

  &&[aria-disabled="true"] {
    opacity: 0.3;
    cursor: default;
    filter: none;
  }
`

type Props = {
  isRunning: boolean
  isChartLoading: boolean
  runActive: boolean
  isDrawMode: boolean
  canRun: boolean
  autoRefreshOn: boolean
  showLabels: boolean
  onRun: () => void
  onHideResult: () => void
  onDraw: () => void
}

export const CellRunDrawToggles: React.FC<Props> = ({
  isRunning,
  isChartLoading,
  runActive,
  isDrawMode,
  canRun,
  autoRefreshOn,
  showLabels,
  onRun,
  onHideResult,
  onDraw,
}) => (
  <NotebookViewToggle role="group" aria-label="Cell execution mode">
    <Tooltip
      content={runActive ? "Hide result" : `Run (${ctrlCmd}+Shift+Enter)`}
    >
      <ToggleButton
        type="button"
        $size="md"
        $active={runActive}
        $tone="success"
        $activeTone="neutral"
        aria-pressed={runActive}
        aria-disabled={isRunning || (!runActive && !canRun)}
        onClick={(e) => {
          e.stopPropagation()
          if (isRunning || (!runActive && !canRun)) return
          if (runActive) {
            onHideResult()
            return
          }
          onRun()
        }}
        aria-label={runActive ? "Hide result" : "Run"}
      >
        <PlayIcon weight="fill" />
        {showLabels && "Run"}
      </ToggleButton>
    </Tooltip>
    <Tooltip
      content={
        isDrawMode
          ? autoRefreshOn
            ? "Drawing — auto-refresh on"
            : "Refresh chart"
          : "Draw (auto-refresh chart)"
      }
    >
      <ToggleButton
        type="button"
        $size="md"
        $active={isDrawMode}
        $tone="info"
        $activeTone="neutral"
        aria-pressed={isDrawMode}
        aria-disabled={isRunning || !canRun}
        aria-busy={isDrawMode && isChartLoading}
        onClick={(e) => {
          e.stopPropagation()
          if (isRunning || !canRun) return
          onDraw()
        }}
        aria-label="Draw"
      >
        {isDrawMode && isChartLoading ? <Spinner size={18} /> : <ChartIcon />}
        {showLabels && "Draw"}
      </ToggleButton>
    </Tooltip>
  </NotebookViewToggle>
)
