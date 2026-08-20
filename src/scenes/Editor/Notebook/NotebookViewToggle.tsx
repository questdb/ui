import React from "react"
import styled from "styled-components"
import { SegmentedControl, SegmentedControlButton } from "../../../components"
import { ListIcon, SquaresFourIcon } from "@phosphor-icons/react"

/**
 * Shared track for notebook-level view switches.
 *
 * Keep this as the single surface definition for both the notebook list/grid
 * switch and the cell table/chart switch so their backgrounds cannot drift.
 */
export const NotebookViewToggle = styled(SegmentedControl)`
  background: ${({ theme }) => theme.color.controlTrack};
`

export const NotebookViewToggleSegment = styled(SegmentedControlButton)`
  svg {
    width: 1.8rem;
    height: 1.8rem;
  }
`

const LayoutSegment = styled(NotebookViewToggleSegment)`
  && {
    padding-inline: 2rem;
  }
`

type LayoutMode = "list" | "grid"

type LayoutToggleProps = {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
  ariaLabel?: string
}

export const NotebookLayoutToggle: React.FC<LayoutToggleProps> = ({
  mode,
  onChange,
  ariaLabel = "Layout",
}) => (
  <NotebookViewToggle role="group" aria-label={ariaLabel}>
    <LayoutSegment
      type="button"
      $size="md"
      $active={mode === "list"}
      $activeTone="neutral"
      aria-pressed={mode === "list"}
      onClick={() => onChange("list")}
      title="List layout"
    >
      <ListIcon />
      List
    </LayoutSegment>
    <LayoutSegment
      type="button"
      $size="md"
      $active={mode === "grid"}
      $activeTone="neutral"
      aria-pressed={mode === "grid"}
      onClick={() => onChange("grid")}
      title="Grid layout"
    >
      <SquaresFourIcon />
      Grid
    </LayoutSegment>
  </NotebookViewToggle>
)
