import React from "react"
import { Stop } from "@styled-icons/remix-line"
import { Queue } from "@phosphor-icons/react"
import { Box, Text } from "../../../../components"
import Notification from "../../../Notifications/Notification"
import { NotificationType } from "../../../../store/Query/types"
import type { CellResult, SingleQueryResult } from "../../../../store/notebook"
import QueryResult from "../../QueryResult"
import { QueryInNotification } from "../../Monaco/query-in-notification"
import { CancelButton, LiveRegion, NotificationContainer } from "./styles"

const liveRegionMessage = (result: SingleQueryResult): string => {
  switch (result.type) {
    case "running":
      return "Query running"
    case "queued":
      return "Query queued"
    case "cancelled":
      return "Query cancelled by user"
    case "error":
      return `Query failed: ${result.error}`
    case "dql":
      return `Query succeeded: ${result.dataset.length} rows`
    default:
      return "Query succeeded"
  }
}

type Props = {
  timestamp: number
  activeResult: SingleQueryResult
  activeIndex: CellResult["activeResultIndex"]
  onCancelQuery?: (index: number) => void
}

export const StatusNotification: React.FC<Props> = ({
  timestamp,
  activeResult,
  activeIndex,
  onCancelQuery,
}) => {
  const { type } = activeResult
  const isError = type === "error"
  const isCancelled = type === "cancelled"

  const baseProps = {
    query: "@0-0" as const,
    createdAt: new Date(timestamp),
    compact: true,
    isMinimized: true,
    sideContent: <QueryInNotification query={activeResult.query} />,
  }

  let body: React.ReactElement
  if (type === "running") {
    body = (
      <Notification
        {...baseProps}
        content={
          <Box gap="1rem" align="center">
            <Text color="foreground">Running...</Text>
            {onCancelQuery && (
              <CancelButton
                skin="error"
                onClick={() => onCancelQuery(activeIndex)}
              >
                <Stop size="18px" />
              </CancelButton>
            )}
          </Box>
        }
        type={NotificationType.LOADING}
      />
    )
  } else if (type === "queued") {
    body = (
      <Notification
        {...baseProps}
        content={
          <Box gap="1rem" align="center">
            <Queue size={16} />
            <Text color="foreground">Queued</Text>
          </Box>
        }
        type={NotificationType.INFO}
      />
    )
  } else if (isCancelled) {
    body = (
      <Notification
        {...baseProps}
        content={<span>Cancelled by user</span>}
        type={NotificationType.ERROR}
      />
    )
  } else if (isError) {
    body = (
      <Notification
        {...baseProps}
        content={<span>{activeResult.error}</span>}
        type={NotificationType.ERROR}
      />
    )
  } else if (activeResult.type === "dql" && activeResult.timings) {
    body = (
      <Notification
        {...baseProps}
        content={
          <QueryResult
            rowCount={activeResult.dataset.length}
            totalRowCount={activeResult.count}
            count={activeResult.timings.count}
            compiler={activeResult.timings.compiler}
            authentication={activeResult.timings.authentication}
            execute={activeResult.timings.execute}
            fetch={activeResult.timings.fetch}
          />
        }
        type={NotificationType.SUCCESS}
      />
    )
  } else {
    body = (
      <Notification
        {...baseProps}
        content={<span>OK</span>}
        type={NotificationType.SUCCESS}
      />
    )
  }

  return (
    <NotificationContainer
      role={isError || isCancelled ? "alert" : "status"}
      aria-live={isError || isCancelled ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <LiveRegion>{liveRegionMessage(activeResult)}</LiveRegion>
      {body}
    </NotificationContainer>
  )
}
