import React, { useContext, useMemo, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { Badge, Drawer, ErrorBanner, Text } from "../../components"
import { toast } from "../../components/Toast"
import { CircleNotchSpinner } from "../Editor/Monaco/icons"
import { QuestContext, useEditor, useLocalStorage } from "../../providers"
import { actions, selectors } from "../../store"
import { StoreKey } from "../../utils/localStorage/types"
import { formatQuery } from "./queryPreview"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  EmptyState,
  EmptyStateHeading,
  EmptyStateSubheading,
  LoadingContainer,
} from "../Schema/TableDetailsDrawer/shared-styles"
import { CancelQueryDialog } from "./CancelQueryDialog"
import { QueryActivityList } from "./QueryActivityList"
import { QueryActivitySummary } from "./QueryActivitySummary"
import { QueryActivityToolbar } from "./QueryActivityToolbar"
import {
  buildQueryActivityItems,
  filterQueryActivityRows,
  summarizeQueryActivity,
  type QueryActivityOrder,
  type QueryActivityRow,
} from "./queryActivity"
import { QUERY_ACTIVITY_THRESHOLDS } from "./thresholds"
import { useQueryActivity } from "./useQueryActivity"

const CountBadge = styled(Badge).attrs({ variant: "neutral", size: "sm" })`
  flex-shrink: 0;
`

const BannerWrapper = styled.div`
  padding: 1.5rem;
`

const getErrorMessage = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "error" in error &&
  typeof error.error === "string"
    ? error.error
    : "Unable to cancel the query"

export const QueryActivityDrawer = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const { quest } = useContext(QuestContext)
  const { autoRefreshQueryActivity, updateSettings } = useLocalStorage()
  const { addBuffer } = useEditor()
  const [filter, setFilter] = useState("")
  const [order, setOrder] = useState<QueryActivityOrder>({
    sort: "duration",
    direction: "desc",
  })
  const [cancelTarget, setCancelTarget] = useState<QueryActivityRow | null>(
    null,
  )

  const isOpen = activeSidebar?.type === "queryActivity"
  const {
    state,
    snapshot,
    finished,
    clientNowMs,
    fetchNow,
    setHeld,
    dismissFinished,
  } = useQueryActivity({
    enabled: isOpen,
    autoRefresh: autoRefreshQueryActivity,
  })

  const visibleSnapshot = useMemo(
    () =>
      snapshot && {
        ...snapshot,
        rows: filterQueryActivityRows(
          [...snapshot.rows, ...[...finished.values()].map((f) => f.row)],
          filter,
        ),
      },
    [snapshot, finished, filter],
  )
  const items = visibleSnapshot
    ? buildQueryActivityItems(
        visibleSnapshot,
        finished,
        clientNowMs,
        order,
        QUERY_ACTIVITY_THRESHOLDS,
      )
    : []
  const isFiltered = filter.trim() !== ""
  const summary = summarizeQueryActivity(snapshot?.rows ?? [])
  const isUnavailable = state.status === "unavailable"
  const isLoading = state.status === "loading" && snapshot === null

  const handleClose = () => {
    dispatch(actions.console.closeSidebar())
  }

  const handleOrderChange = (nextOrder: QueryActivityOrder) => {
    void trackEvent(ConsoleEvent.QUERY_ACTIVITY_SORT, nextOrder)
    setOrder(nextOrder)
  }

  const handleAutoRefreshToggle = () => {
    updateSettings(
      StoreKey.AUTO_REFRESH_QUERY_ACTIVITY,
      !autoRefreshQueryActivity,
    )
    void fetchNow()
  }

  const handleOpenInEditor = (row: QueryActivityRow) => {
    void addBuffer({ value: formatQuery(row.query) })
  }

  const handleConfirmCancel = async () => {
    if (cancelTarget === null) return
    const target = cancelTarget
    setCancelTarget(null)
    void trackEvent(ConsoleEvent.QUERY_ACTIVITY_CANCEL)

    try {
      await quest.cancelQuery(target.queryId)
      toast.success(`Cancel requested for query ${target.queryId}`)
      void fetchNow()
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <Drawer
      mode="side"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      withCloseButton
      title="Query Activity"
      afterTitle={
        snapshot ? (
          <CountBadge data-hook="query-activity-count-badge">
            {summary.activeCount} running
          </CountBadge>
        ) : undefined
      }
      onDismiss={handleClose}
      trigger={<span />}
    >
      <Drawer.ContentWrapper data-hook="query-activity-drawer">
        {isLoading ? (
          <LoadingContainer data-hook="query-activity-loading">
            <CircleNotchSpinner size={24} />
            <Text color="contentSecondary" size="md">
              Loading query activity...
            </Text>
          </LoadingContainer>
        ) : snapshot === null ? (
          <EmptyState role="alert">
            <ErrorBanner
              title="Unable to load query activity"
              description="The console cannot reach the server. It will retry automatically."
              data-hook="query-activity-error"
            />
          </EmptyState>
        ) : (
          <>
            {isUnavailable && (
              <BannerWrapper role="alert">
                <ErrorBanner
                  title="Unable to refresh query activity"
                  description="The displayed queries are from the last successful response. The console will retry automatically."
                  data-hook="query-activity-stale"
                />
              </BannerWrapper>
            )}
            <QueryActivitySummary summary={summary} />
            <QueryActivityToolbar
              filter={filter}
              onFilterChange={setFilter}
              order={order}
              onOrderChange={handleOrderChange}
              autoRefresh={autoRefreshQueryActivity}
              onAutoRefreshToggle={handleAutoRefreshToggle}
            />
            {items.length === 0 && isFiltered ? (
              <EmptyState data-hook="query-activity-no-match">
                <EmptyStateHeading>No matching queries</EmptyStateHeading>
                <EmptyStateSubheading>
                  No running query matches this filter
                </EmptyStateSubheading>
              </EmptyState>
            ) : items.length === 0 ? (
              <EmptyState data-hook="query-activity-empty">
                <EmptyStateHeading>No active queries</EmptyStateHeading>
                <EmptyStateSubheading>
                  Track running queries and their resource usage here
                </EmptyStateSubheading>
              </EmptyState>
            ) : (
              <QueryActivityList
                items={items}
                onOpenInEditor={handleOpenInEditor}
                onCancel={setCancelTarget}
                onHoldChange={setHeld}
                onFadeEnd={dismissFinished}
              />
            )}
          </>
        )}
      </Drawer.ContentWrapper>
      <CancelQueryDialog
        row={cancelTarget}
        onDismiss={() => setCancelTarget(null)}
        onConfirm={() => void handleConfirmCancel()}
      />
    </Drawer>
  )
}
