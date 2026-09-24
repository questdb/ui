import React from "react"
import styled from "styled-components"
import { PrimaryToggleButton, IconWithTooltip, Box } from "../../components"
import { Pulse } from "../../components/icons"
import { useSelector, useDispatch } from "react-redux"
import { selectors, actions } from "../../store"
import { SIDEBAR_ICON_SIZE } from "../../consts"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const ToggleButton = styled(PrimaryToggleButton)`
  padding: 0;
`

const TooltipWrapper = styled(Box).attrs({ justifyContent: "center" })`
  width: 100%;
  height: 100%;
`

export const QueryActivityButton = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const isActive = activeSidebar?.type === "queryActivity"

  const handleClick = () => {
    if (isActive) {
      dispatch(actions.console.closeSidebar())
    } else {
      void trackEvent(ConsoleEvent.QUERY_ACTIVITY_OPEN)
      dispatch(actions.console.pushSidebarHistory({ type: "queryActivity" }))
    }
  }

  return (
    <ToggleButton
      aria-label="Query activity"
      selected={isActive}
      onClick={handleClick}
      data-hook="query-activity-toggle-button"
    >
      <IconWithTooltip
        icon={
          <TooltipWrapper>
            <Pulse size={SIDEBAR_ICON_SIZE} />
          </TooltipWrapper>
        }
        placement="left"
        tooltip="Query Activity"
      />
    </ToggleButton>
  )
}
