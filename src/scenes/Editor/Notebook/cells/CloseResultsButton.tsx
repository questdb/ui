import React from "react"
import styled from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { IconButton, Tooltip } from "../../../../components"
import { color } from "../../../../utils"
import { CLOSE_RESULTS_RESERVED_WIDTH } from "../result-table/styles"
import type { CellView } from "../notebookUtils"
import type { CellPaneLayout } from "../cellSizing"
import { useCellViewActions } from "./useCellViewActions"

// Floats over the end of the result area's top row, so it takes no height:
// the status line keeps room for it on its right, and a chart has its top
// margin there. Over the statement tabs, which scroll under it, it covers the
// row's end with the cell background. The cell shows it on hover or focus.
//
// The button is 2.2rem square around a 16px icon: little padding, so its
// border stays close to the icon and takes little room over a chart.
const BUTTON_SIZE_REM = 2.2

// Across, the button centres under the header's last button (⋮): that is a
// 3.4rem button with the header's 1rem right padding, so its centre is 2.7rem
// from the right, and this button keeps 2.7rem minus half its size on its
// right.
//
// Down, the button has one position in every view, so it does not move when
// the cell switches between table and chart. The box covers the status
// line's content (4rem high with a 1px border on each side), so the icon
// centres on it, and the button stays on whole pixels.
//
// Over a chart, the same box sits in the chart's top margin (ECharts grid.top,
// 40px). The top tick labels reach about 7px above the plot's top line, so
// the button ends above them.
const Placement = styled.div<{ $view: CellView }>`
  position: absolute;
  top: 2px;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  box-sizing: border-box;
  width: ${CLOSE_RESULTS_RESERVED_WIDTH};
  padding-right: ${2.7 - BUTTON_SIZE_REM / 2}rem;
  height: calc(4rem - 2px);
  background: ${({ $view }) =>
    $view === "chart" ? "transparent" : color("surfaceRaised")};
`

const CloseButton = styled(IconButton)`
  && {
    width: ${BUTTON_SIZE_REM}rem;
    min-width: ${BUTTON_SIZE_REM}rem;
    height: ${BUTTON_SIZE_REM}rem;
    min-height: ${BUTTON_SIZE_REM}rem;
  }
`

type Props = {
  cellId: string
  view: CellView
  paneLayout: CellPaneLayout
  isCellBusy: boolean
  // Closing removes the button. When it had focus, e.g. Enter on it, focus
  // moves here instead of falling to the page body.
  onClosedWhileFocused: () => void
}

export const CloseResultsButton: React.FC<Props> = ({
  cellId,
  view,
  paneLayout,
  isCellBusy,
  onClosedWhileFocused,
}) => {
  const { closeResults } = useCellViewActions({
    cellId,
    view,
    paneLayout,
    isCellBusy,
    method: "button",
  })

  return (
    <Placement className="cell-close-results" $view={view}>
      <Tooltip content="Close results">
        <CloseButton
          label="Close results"
          variant="secondary"
          size="sm"
          aria-disabled={isCellBusy}
          data-hook="cell-close-results"
          onClick={(e) => {
            e.stopPropagation()
            const hadFocus = e.currentTarget === document.activeElement
            if (closeResults() && hadFocus) onClosedWhileFocused()
          }}
        >
          <XIcon size={16} />
        </CloseButton>
      </Tooltip>
    </Placement>
  )
}
