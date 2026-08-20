import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { Table as TableIcon } from "../../components/icons"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { SIDEBAR_ICON_SIZE } from "../../consts"

const ToggleButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

export const TableDetailsButton = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const tableDetailsTarget = useSelector(
    selectors.console.getTableDetailsTarget,
  )

  const handleClick = () => {
    if (activeSidebar?.type === "tableDetails") {
      dispatch(actions.console.closeSidebar())
    } else {
      dispatch(
        actions.console.pushSidebarHistory({
          type: "tableDetails",
          payload: tableDetailsTarget,
        }),
      )
    }
  }

  return (
    <ToggleButton
      aria-label="Table details"
      selected={activeSidebar?.type === "tableDetails"}
      onClick={handleClick}
      data-hook="table-details-toggle-button"
    >
      <IconWithTooltip
        icon={
          <TooltipWrapper>
            <TableIcon size={SIDEBAR_ICON_SIZE} />
          </TooltipWrapper>
        }
        placement="left"
        tooltip="Table Details"
      />
    </ToggleButton>
  )
}
