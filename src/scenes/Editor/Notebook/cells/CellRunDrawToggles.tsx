import React from "react"
import styled from "styled-components"
import { PlayIcon } from "../../Monaco/icons"
import { Spinner } from "./Spinner"
import { ChartIcon } from "./ChartIcon"
import { Tooltip } from "../../../../components"
import { ctrlCmd } from "../../../../utils/platform"

const ToggleButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 0.8rem;
  border: none;
  border-radius: 0.4rem;
  background: ${({ $active, theme }) =>
    $active ? theme.color.background : "transparent"};
  color: ${({ theme }) => theme.color.foreground};
  font-size: 1.4rem;
  cursor: pointer;

  svg {
    width: 2rem;
    height: 2rem;
  }

  &:hover:not([aria-disabled="true"]) {
    background: ${({ theme }) => theme.color.selection};
  }

  &[aria-disabled="true"] {
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
  onCancel: () => void
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
  onCancel,
  onDraw,
}) => (
  <>
    {isRunning ? (
      <Tooltip content="Cancel">
        <ToggleButton
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          aria-label="Cancel"
          aria-busy
        >
          <Spinner size={20} />
          {showLabels && "Run"}
        </ToggleButton>
      </Tooltip>
    ) : (
      <Tooltip
        content={runActive ? "Hide result" : `Run (${ctrlCmd}+Shift+Enter)`}
      >
        <ToggleButton
          type="button"
          $active={runActive}
          aria-pressed={runActive}
          aria-disabled={!runActive && !canRun}
          onClick={(e) => {
            e.stopPropagation()
            if (!runActive && !canRun) return
            if (runActive) {
              onHideResult()
              return
            }
            onRun()
          }}
          aria-label={runActive ? "Hide result" : "Run"}
        >
          <PlayIcon style={{ transform: "scale(1.1)" }} />
          {showLabels && "Run"}
        </ToggleButton>
      </Tooltip>
    )}
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
        $active={isDrawMode}
        aria-pressed={isDrawMode}
        aria-disabled={!canRun}
        aria-busy={isDrawMode && isChartLoading}
        onClick={(e) => {
          e.stopPropagation()
          if (!canRun) return
          onDraw()
        }}
        aria-label="Draw"
      >
        {isDrawMode && isChartLoading ? <Spinner size={20} /> : <ChartIcon />}
        {showLabels && "Draw"}
      </ToggleButton>
    </Tooltip>
  </>
)
