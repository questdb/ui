import React from "react"
import { Stop } from "@styled-icons/remix-line"
import { ArrowClockwiseIcon, Queue } from "@phosphor-icons/react"
import { Box, Text } from "../../../../components"
import Notification from "../../../Notifications/Notification"
import { NotificationType } from "../../../../store/Query/types"
import type { SingleQueryResult } from "../../../../store/notebook"
import QueryResult from "../../QueryResult"
import { QueryInNotification } from "../../Monaco/query-in-notification"
import type { StatementSlotView } from "./statementSlotView"
import { CancelButton, LiveRegion, NotificationContainer } from "./styles"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"

const liveRegionMessage = (slot: StatementSlotView): string => {
  if (slot.refreshing) return "Refreshing query"
  if (slot.result?.type === "running") return "Query running"
  if (slot.refreshError !== undefined) {
    return `Refresh failed: ${slot.refreshError}`
  }
  if (slot.result === null) return "Query not run"
  const { result } = slot
  switch (result.type) {
    case "running":
      return "Query running"
    case "queued":
      return "Query queued"
    case "cancelled":
      return result.reason === "priorFailure"
        ? "Query skipped: a previous query failed"
        : "Query cancelled by user"
    case "error":
      return `Query failed: ${result.error}`
    case "dql":
      return result.notice !== undefined
        ? `Query succeeded: ${result.dataset.length} rows. ${result.notice}`
        : `Query succeeded: ${result.dataset.length} rows`
    default:
      return "Query succeeded"
  }
}

type Props = {
  timestamp: number
  slot: StatementSlotView
  onCancelQuery?: (statementKey: string) => void
}

export const StatusNotification: React.FC<Props> = ({
  timestamp,
  slot,
  onCancelQuery,
}) => {
  const activeResult: SingleQueryResult = slot.result ?? {
    type: "queued",
    query: slot.sql,
  }
  const { type } = activeResult
  const isError =
    type === "error" || (slot.refreshError !== undefined && type !== "running")
  const isCancelled = type === "cancelled"
  const notice = activeResult.type === "dql" ? activeResult.notice : undefined

  const baseProps = {
    query: "@0-0" as const,
    createdAt: new Date(slot.fetchedAt ?? timestamp),
    compact: true,
    isMinimized: true,
    sideContent: <QueryInNotification query={slot.sql} />,
  }

  const cancelButton = onCancelQuery && (
    <CancelButton
      skin="error"
      onClick={() => {
        void trackEvent(ConsoleEvent.NOTEBOOK_CELL_RUN_CANCEL)
        onCancelQuery(slot.key)
      }}
    >
      <Stop size="18px" />
    </CancelButton>
  )

  let body: React.ReactElement
  // A live run wins over refresh state; refresh state wins over the settled
  // result the tab still shows — those rows are the previous round's, and
  // the line must say so.
  if (slot.refreshing) {
    body = (
      <Notification
        {...baseProps}
        content={
          <Box gap="1rem" align="center">
            <Text color="foreground">Refreshing...</Text>
            {cancelButton}
          </Box>
        }
        type={NotificationType.LOADING}
      />
    )
  } else if (type === "running") {
    body = (
      <Notification
        {...baseProps}
        content={
          <Box gap="1rem" align="center">
            <Text color="foreground">Running...</Text>
            {cancelButton}
          </Box>
        }
        type={NotificationType.LOADING}
      />
    )
  } else if (slot.refreshError !== undefined) {
    body = (
      <Notification
        {...baseProps}
        content={
          <Box gap="1rem" align="center">
            <ArrowClockwiseIcon size={16} />
            <span>{`Refresh failed: ${slot.refreshError}`}</span>
          </Box>
        }
        type={NotificationType.ERROR}
      />
    )
  } else if (slot.result === null) {
    body = (
      <Notification
        {...baseProps}
        content={<Text color="gray2">Not run</Text>}
        type={NotificationType.INFO}
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
  } else if (activeResult.type === "cancelled") {
    body = (
      <Notification
        {...baseProps}
        content={
          <span>
            {activeResult.reason === "priorFailure"
              ? "Skipped: a previous query failed"
              : "Cancelled by user"}
          </span>
        }
        type={NotificationType.ERROR}
      />
    )
  } else if (activeResult.type === "error") {
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
        type={
          notice !== undefined
            ? NotificationType.NOTICE
            : NotificationType.SUCCESS
        }
      />
    )
  } else {
    body = (
      <Notification
        {...baseProps}
        content={<span>{notice ?? "OK"}</span>}
        type={
          notice !== undefined
            ? NotificationType.NOTICE
            : NotificationType.SUCCESS
        }
      />
    )
  }

  return (
    <NotificationContainer
      role={isError || isCancelled ? "alert" : "status"}
      aria-live={isError || isCancelled ? "assertive" : "polite"}
      aria-atomic="true"
      title={notice}
    >
      <LiveRegion>{liveRegionMessage(slot)}</LiveRegion>
      {body}
    </NotificationContainer>
  )
}
