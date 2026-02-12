import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { Table as TableIcon } from "@styled-icons/remix-line"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"

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

  // Only show if table details has been opened at least once
  if (!tableDetailsTarget) {
    return null
  }

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
      selected={activeSidebar?.type === "tableDetails"}
      onClick={handleClick}
      data-hook="table-details-toggle-button"
    >
      <IconWithTooltip
        icon={
          <TooltipWrapper>
            <TableIcon size={24} />
          </TooltipWrapper>
        }
        placement="left"
        tooltip="Table Details"
      />
    </ToggleButton>
  )
}
