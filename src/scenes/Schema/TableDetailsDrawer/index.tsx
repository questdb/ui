import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react"
import { useSelector, useDispatch } from "react-redux"
import styled from "styled-components"
import { selectors, actions } from "../../../store"
import { XSquareIcon, WarningIcon } from "@phosphor-icons/react"
import {
  Drawer,
  Box,
  Text,
  Dialog,
  CopyButton,
  TableSelector,
  type TableOption,
  Badge,
  TabButton,
} from "../../../components"
import {
  hideColumnsFromTableDDL,
  truncateLongDDL,
} from "../../../components/LiteEditor/utils"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import { QuestContext, useSettings } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import {
  getTableKind,
  getTableKindLabel,
  type Table,
  type TableKind,
  type Column,
  type LiveView,
  type MaterializedView,
  type StoragePolicy,
  type View,
} from "../../../utils/questdb/types"
import {
  calculateHealthStatus,
  detectIngestionActive,
  getLiveViewIssueGuidance,
  LIVE_VIEW_POLL_MS,
  MAX_TREND_SAMPLES,
  type TrendData,
  type HealthIssue,
  type HealthSeverity,
} from "./healthCheck"
import { getTrendSamplesForIssue } from "./utils"
import { HealthStatusLabel } from "./HealthStatusLabel"
import { useDebouncedWarnings } from "./useDebouncedWarnings"
import { useCatalogSource } from "./useCatalogSource"
import { SuspensionDialog } from "../SuspensionDialog"
import { useAdaptivePoll, useAIQuickActions } from "../../../hooks"
import { MonitoringTab } from "./MonitoringTab"
import { DetailsTab } from "./DetailsTab"
import { ErrorBanner } from "./ErrorBanner"
import type { TableKindData } from "./types"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const TypeBadge = styled(Badge).attrs({ variant: "neutral", size: "sm" })`
  flex-shrink: 0;
`

const BIGINT_ZERO = BigInt(0)

const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  padding: 4rem;
  height: 100%;
`

const EmptyState = styled(Box).attrs({
  flexDirection: "column",
  align: "flex-start",
  justifyContent: "center",
})`
  gap: 1.2rem;
  padding: 1.8rem;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 40rem;
  margin: 0 auto;
`

const EmptyStateHeading = styled.h2`
  font-size: 2rem;
  font-weight: 600;
  text-align: left;
  color: ${({ theme }) => theme.color.contentPrimary};
  margin: 0;
`

const EmptyStateSubheading = styled.p`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-align: left;
  margin: 0;
  line-height: 1.5;
`

const MetadataErrorBannerWrapper = styled.div`
  padding: 1.5rem;
`

const TitleContainer = styled(Dialog.Title).attrs({})`
  display: flex;
  padding: 0;
  border: 0;
  gap: 1rem;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  margin-right: 1rem;
`

const CopyButtonSlot = styled.span`
  display: inline-flex;
  flex-shrink: 0;
`

type TabType = "monitoring" | "details"

const TABLE_POLL_MIN_MS = 200
const TABLE_POLL_MAX_MS = 5_000
const DETAILS_TABLE_POLL_MS = 1_000
const KIND_POLL_MS = 1_000

type TableSourceData = { type: "found"; data: Table } | { type: "missing" }

const firstCatalogRow = <T extends Record<string, unknown>>(
  response: QuestDB.QueryRawResult,
): T | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<T>(response, {
    convertLongsToBigInt: true,
  })
  return result.type === QuestDB.Type.DQL ? result.data[0] : undefined
}

const firstRow = <T extends Record<string, unknown>>(
  response: QuestDB.QueryRawResult,
): T | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<T>(response)
  return result.type === QuestDB.Type.DQL ? result.data[0] : undefined
}

const transformTableResponse = (
  response: QuestDB.QueryRawResult,
): TableSourceData | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<Table>(response, {
    convertLongsToBigInt: true,
  })
  if (result.type !== QuestDB.Type.DQL) return undefined
  return result.data[0]
    ? { type: "found", data: result.data[0] }
    : { type: "missing" }
}

const transformMatViewResponse = (response: QuestDB.QueryRawResult) =>
  firstCatalogRow<MaterializedView>(response)

const transformViewResponse = (response: QuestDB.QueryRawResult) =>
  firstRow<View>(response)

const transformLiveViewResponse = (response: QuestDB.QueryRawResult) =>
  firstCatalogRow<LiveView>(response)

const transformColumnsResponse = (
  response: QuestDB.QueryRawResult,
): Column[] | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<Column>(response)
  return result.type === QuestDB.Type.DQL ? result.data : undefined
}

const transformDDLResponse = (
  response: QuestDB.QueryRawResult,
): string | undefined => {
  const row = firstRow<{ ddl: string }>(response)
  return row?.ddl ? row.ddl.replace(/\n{2,}/g, "\n") : undefined
}

const transformStoragePolicyResponse = (
  response: QuestDB.QueryRawResult,
): StoragePolicy | null | undefined => {
  const result = QuestDB.Client.transformQueryRawResult<StoragePolicy>(response)
  if (result.type !== QuestDB.Type.DQL) return undefined
  return result.data[0] ?? null
}

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
`

const TabsNav = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0 1.5rem;
`

const TabsSeparator = styled.div`
  width: 100%;
  height: 0.1rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
`

const Tab = styled(TabButton)`
  && {
    min-height: 4.4rem;
    gap: 1rem;
    padding: 1rem 1.2rem;
    font-size: ${({ theme }) => theme.fontSize.lg};
    line-height: 1.4;
  }
`

const TabBadge = styled(Badge)`
  height: 1.8rem;
`

export const TableDetailsDrawer = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const target = useSelector(selectors.console.getTableDetailsTarget)
  const targetRef = useRef(target)
  const activeSidebarRef = useRef(activeSidebar)

  const tableName = target?.tableName ?? ""
  const kind: TableKind = target?.kind ?? "table"
  const isMatView = kind === "matview"
  const isView = kind === "view"
  const isLiveView = kind === "liveview"
  const hasTarget = target !== null
  const isOpen = activeSidebar?.type === "tableDetails"

  const handleClose = () => {
    dispatch(actions.console.closeSidebar())
  }

  const isCurrentTarget = useCallback(
    (candidateTableName: string, candidateKind: TableKind) => {
      const currentTarget = targetRef.current
      return (
        activeSidebarRef.current?.type === "tableDetails" &&
        currentTarget?.tableName === candidateTableName &&
        currentTarget.kind === candidateKind
      )
    },
    [],
  )

  const clearIfCurrentTarget = useCallback(
    (missingTableName: string, missingKind: TableKind) => {
      if (isCurrentTarget(missingTableName, missingKind)) {
        dispatch(
          actions.console.replaceSidebarHistory({
            type: "tableDetails",
            payload: null,
          }),
        )
      }
    },
    [dispatch, isCurrentTarget],
  )

  const tables = useSelector(selectors.query.getTables)
  const { quest } = useContext(QuestContext)
  const { settings } = useSettings()
  const isEnterprise = settings["release.type"] === "EE"
  const [activeTab, setActiveTab] = useState<TabType>("monitoring")

  const escapedTableName = QuestDB.escapeSqlLiteral(tableName)
  const sourcePrefix = `${kind}:${tableName}`
  const tableSource = useCatalogSource<TableSourceData>({
    sourceKey: `${sourcePrefix}:tables`,
    sourceName: "table metadata",
    enabled: isOpen && hasTarget,
    query: `tables() where table_name = '${escapedTableName}';`,
    pollIntervalMs: null,
    transformResponse: transformTableResponse,
  })
  const matViewSource = useCatalogSource<MaterializedView>({
    sourceKey: `${sourcePrefix}:materialized-views`,
    sourceName: "materialized view metadata",
    enabled: isOpen && hasTarget && isMatView,
    query: `materialized_views() WHERE view_name = '${escapedTableName}';`,
    pollIntervalMs: KIND_POLL_MS,
    transformResponse: transformMatViewResponse,
  })
  const viewSource = useCatalogSource<View>({
    sourceKey: `${sourcePrefix}:views`,
    sourceName: "view metadata",
    enabled: isOpen && hasTarget && isView,
    query: `views() WHERE view_name = '${escapedTableName}';`,
    pollIntervalMs: KIND_POLL_MS,
    transformResponse: transformViewResponse,
  })
  const liveViewSource = useCatalogSource<LiveView>({
    sourceKey: `${sourcePrefix}:live-views`,
    sourceName: "live view metadata",
    enabled: isOpen && hasTarget && isLiveView,
    query: `live_views() WHERE view_name = '${escapedTableName}'`,
    pollIntervalMs: LIVE_VIEW_POLL_MS,
    transformResponse: transformLiveViewResponse,
  })
  const columnsSource = useCatalogSource<Column[]>({
    sourceKey: `${sourcePrefix}:columns`,
    sourceName: "columns",
    enabled: isOpen && hasTarget,
    query: `SHOW COLUMNS FROM '${escapedTableName}';`,
    pollIntervalMs:
      isView || activeTab === "details" ? DETAILS_TABLE_POLL_MS : null,
    transformResponse: transformColumnsResponse,
  })
  const ddlSource = useCatalogSource<string>({
    sourceKey: `${sourcePrefix}:ddl`,
    sourceName: "DDL",
    enabled: isOpen && hasTarget,
    query: QuestDB.buildDDLQuery(tableName, kind),
    pollIntervalMs:
      isView || activeTab === "details" ? DETAILS_TABLE_POLL_MS : null,
    transformResponse: transformDDLResponse,
  })
  const currentTableResult =
    tableSource.state.status === "ready"
      ? tableSource.state.data
      : tableSource.lastReadyData
  const tableData =
    currentTableResult?.type === "found" ? currentTableResult.data : null
  const storageDirectoryName = tableData?.directoryName ?? ""
  const escapedStorageDirectoryName =
    QuestDB.escapeSqlLiteral(storageDirectoryName)
  const storagePolicySource = useCatalogSource<StoragePolicy | null>({
    sourceKey: `${sourcePrefix}:storage-policy:${storageDirectoryName}`,
    sourceName: "storage policy",
    enabled:
      isOpen &&
      hasTarget &&
      isEnterprise &&
      kind === "table" &&
      activeTab === "details" &&
      tableData !== null,
    query: `storage_policies WHERE table_dir_name = '${escapedStorageDirectoryName}';`,
    pollIntervalMs: DETAILS_TABLE_POLL_MS,
    transformResponse: transformStoragePolicyResponse,
  })

  const tableOptions: TableOption[] = useMemo(
    () =>
      tables.map((t) => ({
        label: t.table_name,
        value: t.table_name,
        kind: getTableKind(t),
        walEnabled: t.walEnabled,
        partitionBy: t.partitionBy,
        designatedTimestamp: t.designatedTimestamp,
      })),
    [tables],
  )

  const handleTableSelect = useCallback(
    (_value: string, option: TableOption) => {
      dispatch(
        actions.console.pushSidebarHistory({
          type: "tableDetails",
          payload: { tableName: option.label, kind: option.kind ?? "table" },
        }),
      )
    },
    [],
  )

  const [columnsExpanded, setColumnsExpanded] = useState(false)
  const [walExpanded, setWalExpanded] = useState(true)
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false)
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false)
  const [trendData, setTrendData] = useState<TrendData>({
    walPendingRowCount: [],
    transactionLag: [],
    ingestionMetric: [],
  })
  const [baseTableStatus, setBaseTableStatus] = useState<
    "Dropped" | "Suspended" | "Valid" | null
  >(null)

  const matViewData =
    matViewSource.state.status === "ready" ? matViewSource.state.data : null
  const viewData =
    viewSource.state.status === "ready" ? viewSource.state.data : null
  const liveViewData =
    liveViewSource.state.status === "ready" ? liveViewSource.state.data : null
  const columns =
    columnsSource.state.status === "ready" ? columnsSource.state.data : []
  const ddl = ddlSource.state.status === "ready" ? ddlSource.state.data : ""
  const loading = tableSource.state.status === "loading" && tableData === null
  const tablesUnavailable = tableSource.state.status === "unavailable"
  const kindSourceUnavailable =
    (isView && viewSource.state.status === "unavailable") ||
    (isMatView && matViewSource.state.status === "unavailable") ||
    (isLiveView && liveViewSource.state.status === "unavailable")
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"

  const baseTableName =
    matViewData?.base_table_name ?? liveViewData?.base_table_name ?? undefined

  const kindData: TableKindData = useMemo(
    () =>
      kind === "view"
        ? { kind, view: viewSource.state }
        : kind === "matview"
          ? { kind, matView: matViewSource.state }
          : kind === "liveview"
            ? { kind, liveView: liveViewSource.state }
            : { kind: "table" },
    [kind, viewSource.state, matViewSource.state, liveViewSource.state],
  )

  const handleNavigateToBaseTable = useCallback(() => {
    if (!baseTableName || !baseTableExists) return
    const baseTable = tables.find((t) => t.table_name === baseTableName)
    dispatch(
      actions.console.pushSidebarHistory({
        type: "tableDetails",
        payload: {
          tableName: baseTableName,
          kind: baseTable ? getTableKind(baseTable) : "table",
        },
      }),
    )
  }, [dispatch, baseTableName, baseTableExists, tables])

  const { handleExplainSchema, handleAskAIForHealthIssue } = useAIQuickActions()

  const handleExplainWithAI = useCallback(() => {
    void trackEvent(ConsoleEvent.TABLE_DETAILS_SCHEMA_EXPLAIN)
    if (tableData?.id == null) return
    void handleExplainSchema(tableData.id, tableName, kind, {
      partitionBy: tableData.partitionBy,
      walEnabled: tableData.walEnabled,
      designatedTimestamp: tableData.designatedTimestamp,
    })
  }, [handleExplainSchema, tableData, tableName, kind])

  const handleAskAIForIssue = useCallback(
    (issue: HealthIssue) => {
      void trackEvent(ConsoleEvent.TABLE_DETAILS_ASK_AI)
      if (tableData?.id == null) return

      const diagnosticContext =
        kindData.kind === "matview" && kindData.matView.status === "ready"
          ? {
              source: "materialized_views()" as const,
              data: kindData.matView.data,
            }
          : kindData.kind === "liveview" && kindData.liveView.status === "ready"
            ? {
                source: "live_views()" as const,
                data: kindData.liveView.data,
                guidance: getLiveViewIssueGuidance(issue.id),
              }
            : undefined

      void handleAskAIForHealthIssue(
        tableData.id,
        tableName,
        issue,
        getTrendSamplesForIssue(issue.field, trendData),
        diagnosticContext,
      )
    },
    [handleAskAIForHealthIssue, tableData, tableName, trendData, kindData],
  )

  const handleAskAIForViewIssue = useCallback(() => {
    if (tableData?.id == null) return
    const issue: HealthIssue = {
      id: "R4",
      severity: "critical",
      field: "viewStatus",
      message: `View is invalid: ${viewData?.invalidation_reason}`,
    }
    void handleAskAIForHealthIssue(tableData.id, tableName, issue)
  }, [
    handleAskAIForHealthIssue,
    tableData,
    tableName,
    viewData?.invalidation_reason,
  ])

  const checkBaseTableStatus = useCallback(async () => {
    if (!baseTableName) {
      setBaseTableStatus(null)
      return
    }
    try {
      const response = await quest.getTableDetails(baseTableName)
      const baseTableExists =
        response.type === QuestDB.Type.DQL && response.data.length > 0
      const suspended = baseTableExists
        ? response.data[0]?.table_suspended
        : false
      const status = baseTableExists
        ? suspended
          ? "Suspended"
          : "Valid"
        : "Dropped"
      setBaseTableStatus(status)
    } catch (error) {
      console.error("Failed to check base table existence:", error)
      setBaseTableStatus(null)
    }
  }, [quest, baseTableName])

  useEffect(() => {
    targetRef.current = target
    activeSidebarRef.current = activeSidebar
  }, [target, activeSidebar])

  useEffect(() => {
    setColumnsExpanded(isOpen && hasTarget ? isView : false)
    setWalExpanded(true)
    setHasAutoExpanded(false)
    setTrendData({
      walPendingRowCount: [],
      transactionLag: [],
      ingestionMetric: [],
    })
    setBaseTableStatus(null)
  }, [isOpen, hasTarget, isView, sourcePrefix])

  useEffect(() => {
    if (
      tableSource.state.status === "ready" &&
      tableSource.state.data.type === "missing"
    ) {
      clearIfCurrentTarget(tableName, kind)
    }
  }, [clearIfCurrentTarget, kind, tableName, tableSource.state])

  useEffect(() => {
    if (baseTableName && !kindSourceUnavailable) {
      void checkBaseTableStatus()
    } else {
      setBaseTableStatus(null)
    }
  }, [baseTableName, checkBaseTableStatus, kindSourceUnavailable])

  const usesDetailsPolling = isView || activeTab === "details"

  useAdaptivePoll({
    fetchFn: tableSource.fetchNow,
    enabled: isOpen && hasTarget,
    key: `${sourcePrefix}-${activeTab}`,
    minIntervalMs: usesDetailsPolling
      ? DETAILS_TABLE_POLL_MS
      : TABLE_POLL_MIN_MS,
    maxIntervalMs: usesDetailsPolling
      ? DETAILS_TABLE_POLL_MS
      : TABLE_POLL_MAX_MS,
    multiplier: 1.5,
  })

  useEffect(() => {
    if (
      tableSource.state.status === "ready" &&
      tableSource.state.data.type === "found"
    ) {
      const currentTableData = tableSource.state.data.data
      const now = Date.now()
      setTrendData((prev) => {
        const ingestionValue = currentTableData.walEnabled
          ? (currentTableData.wal_txn ?? BIGINT_ZERO)
          : (currentTableData.table_row_count ?? BIGINT_ZERO)
        const transactionLag =
          (currentTableData.wal_txn ?? BIGINT_ZERO) -
          (currentTableData.table_txn ?? BIGINT_ZERO)

        return {
          walPendingRowCount: currentTableData.walEnabled
            ? [
                ...prev.walPendingRowCount.slice(-(MAX_TREND_SAMPLES - 1)),
                {
                  value: currentTableData.wal_pending_row_count ?? BIGINT_ZERO,
                  timestamp: now,
                },
              ]
            : prev.walPendingRowCount,
          transactionLag: currentTableData.walEnabled
            ? [
                ...prev.transactionLag.slice(-(MAX_TREND_SAMPLES - 1)),
                {
                  value:
                    transactionLag > BIGINT_ZERO ? transactionLag : BIGINT_ZERO,
                  timestamp: now,
                },
              ]
            : prev.transactionLag,
          ingestionMetric: [
            ...prev.ingestionMetric.slice(-(MAX_TREND_SAMPLES - 1)),
            { value: ingestionValue, timestamp: now },
          ],
        }
      })
    }
  }, [tableSource.state])

  const rawHealthStatus = useMemo(() => {
    if (!tableData) return null
    return calculateHealthStatus(tableData, kindData, trendData)
  }, [tableData, kindData, trendData])

  const healthStatus = useDebouncedWarnings(rawHealthStatus)

  const truncatedDDL = useMemo(() => {
    if (!ddl) return { text: "", grayedOutLines: null }
    const result = hideColumnsFromTableDDL(ddl, columns)
    if (result.grayedOutLines) return result
    return truncateLongDDL(ddl)
  }, [ddl, columns])

  const isIngestionActive = useMemo(() => {
    return detectIngestionActive(trendData.ingestionMetric)
  }, [trendData.ingestionMetric])

  const hasIngestionWarning = useMemo(() => {
    const hasWarning = healthStatus?.issues.some(
      (i) =>
        i.severity === "warning" &&
        ["memoryPressure", "txSizeP90", "writeAmp"].includes(i.field),
    )
    const hasIncreasingTrend =
      healthStatus?.trendIndicators.get("transactionLag")?.direction ===
        "increasing" ||
      healthStatus?.trendIndicators.get("pendingRows")?.direction ===
        "increasing"
    return hasWarning || hasIncreasingTrend
  }, [healthStatus])

  const monitoringIssuesCounts = useMemo(() => {
    const errors =
      healthStatus?.issues.filter((i) => i.severity === "critical").length ?? 0
    const warnings =
      healthStatus?.issues.filter((i) => i.severity === "warning").length ?? 0
    return { warnings, errors }
  }, [healthStatus])

  const criticalIssues = useMemo(() => {
    if (!healthStatus) return []
    return healthStatus.issues.filter((i) => i.severity === "critical")
  }, [healthStatus])

  const performanceWarnings = useMemo(() => {
    if (!healthStatus) return []
    return healthStatus.issues.filter((i) => i.severity === "warning")
  }, [healthStatus])

  const isIngestionDisabled = useMemo(() => {
    const walSuspended = tableData?.walEnabled && tableData?.table_suspended
    const matViewInvalid = isMatView && matViewData?.view_status === "invalid"
    const liveViewInvalid =
      isLiveView && liveViewData?.view_status === "invalid"
    return walSuspended || matViewInvalid || liveViewInvalid
  }, [tableData, isMatView, matViewData, isLiveView, liveViewData])

  useEffect(() => {
    if (hasIngestionWarning && !hasAutoExpanded && !walExpanded) {
      setWalExpanded(true)
      setHasAutoExpanded(true)
    }
  }, [hasIngestionWarning, hasAutoExpanded, walExpanded])

  const healthSeverity = useMemo<HealthSeverity>(() => {
    const calculatedSeverity = isView
      ? viewData?.view_status === "invalid"
        ? "critical"
        : kindSourceUnavailable
          ? "unknown"
          : "healthy"
      : (healthStatus?.overallSeverity ?? "healthy")

    if (
      tablesUnavailable &&
      calculatedSeverity !== "critical" &&
      calculatedSeverity !== "warning"
    ) {
      return "unknown"
    }
    return calculatedSeverity
  }, [
    healthStatus?.overallSeverity,
    isView,
    kindSourceUnavailable,
    tablesUnavailable,
    viewData?.view_status,
  ])

  const kindSourceTitle = isLiveView
    ? "Unable to load live view metadata"
    : isMatView
      ? "Unable to load materialized view metadata"
      : "Unable to load view metadata"

  const drawerTitle = useMemo(
    () => (
      <TitleContainer>
        {hasTarget && <HealthStatusLabel severity={healthSeverity} />}

        <TableSelector
          titleDataHook="table-details-name"
          options={tableOptions}
          onSelect={handleTableSelect}
          value={hasTarget ? tableName : ""}
          placeholder="Select a table"
          defaultOpen={!hasTarget}
        />
        {hasTarget && (
          <CopyButtonSlot>
            <CopyButton
              size="sm"
              text={tableName}
              iconOnly
              data-hook="table-details-copy-name"
            />
          </CopyButtonSlot>
        )}
      </TitleContainer>
    ),
    [hasTarget, healthSeverity, tableOptions, tableName],
  )

  return (
    <Drawer
      mode="side"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      withCloseButton
      title={drawerTitle}
      afterTitle={
        hasTarget ? (
          <TypeBadge data-hook="table-details-type-badge">
            {getTableKindLabel(kind)}
          </TypeBadge>
        ) : undefined
      }
      onDismiss={handleClose}
      trigger={<span />}
    >
      <Drawer.ContentWrapper data-hook="table-details-drawer">
        {hasTarget && loading ? (
          <LoadingContainer data-hook="table-details-loading">
            <CircleNotchSpinner size={24} />
            <Text color="contentSecondary" size="md">
              Loading table details...
            </Text>
          </LoadingContainer>
        ) : hasTarget && tablesUnavailable && tableData === null ? (
          <EmptyState data-hook="table-details-source-error">
            <ErrorBanner
              title={`Unable to load ${tableName}`}
              description="The console cannot reach the server. It will retry automatically."
            />
          </EmptyState>
        ) : tableData ? (
          <>
            {tablesUnavailable && (
              <MetadataErrorBannerWrapper
                role="alert"
                data-hook="table-details-tables-error"
              >
                <ErrorBanner
                  title="Unable to refresh table metadata"
                  description="The displayed table data is from the last successful response. The console will retry automatically."
                />
              </MetadataErrorBannerWrapper>
            )}
            {kindSourceUnavailable && (
              <MetadataErrorBannerWrapper
                role="alert"
                data-hook="table-details-kind-metadata-error"
              >
                <ErrorBanner
                  title={kindSourceTitle}
                  description="Some metadata is unavailable. The console will retry automatically."
                />
              </MetadataErrorBannerWrapper>
            )}
            {!isView && (
              <TabsContainer>
                <TabsNav role="tablist" aria-label="Table details sections">
                  <Tab
                    $active={activeTab === "monitoring"}
                    role="tab"
                    onClick={() => {
                      void trackEvent(ConsoleEvent.TABLE_DETAILS_TAB_SWITCH, {
                        tab: "monitoring",
                      })
                      setActiveTab("monitoring")
                    }}
                    data-hook="table-details-tab-monitoring"
                    data-active={activeTab === "monitoring"}
                  >
                    Monitoring
                    {monitoringIssuesCounts.errors > 0 && (
                      <TabBadge
                        variant="danger"
                        size="sm"
                        data-hook="table-details-tab-error-badge"
                      >
                        <XSquareIcon size={12} weight="fill" />
                        {monitoringIssuesCounts.errors}
                      </TabBadge>
                    )}
                    {monitoringIssuesCounts.errors === 0 &&
                      monitoringIssuesCounts.warnings > 0 && (
                        <TabBadge
                          variant="warning"
                          size="sm"
                          data-hook="table-details-tab-warning-badge"
                        >
                          <WarningIcon size={12} weight="fill" />
                          {monitoringIssuesCounts.warnings}
                        </TabBadge>
                      )}
                  </Tab>
                  <Tab
                    $active={activeTab === "details"}
                    role="tab"
                    onClick={() => {
                      void trackEvent(ConsoleEvent.TABLE_DETAILS_TAB_SWITCH, {
                        tab: "details",
                      })
                      setActiveTab("details")
                    }}
                    data-hook="table-details-tab-details"
                    data-active={activeTab === "details"}
                  >
                    Details
                  </Tab>
                </TabsNav>
                <TabsSeparator />
              </TabsContainer>
            )}

            {!isView && activeTab === "monitoring" && (
              <MonitoringTab
                tableData={tableData}
                kindData={kindData}
                healthStatus={healthStatus}
                criticalIssues={criticalIssues}
                performanceWarnings={performanceWarnings}
                isIngestionActive={isIngestionActive}
                isIngestionDisabled={!!isIngestionDisabled}
                baseTableName={baseTableName}
                baseTableStatus={baseTableStatus}
                walExpanded={walExpanded}
                onWalExpandedChange={setWalExpanded}
                onOpenSuspensionDialog={() => setSuspensionDialogOpen(true)}
                onAskAI={handleAskAIForIssue}
              />
            )}

            {(isView || activeTab === "details") && (
              <DetailsTab
                tableData={tableData}
                kindData={kindData}
                columnsState={columnsSource.state}
                ddlState={ddlSource.state}
                storagePolicyState={storagePolicySource.state}
                isEnterprise={isEnterprise}
                truncatedDDL={truncatedDDL}
                baseTableName={baseTableName}
                baseTableStatus={baseTableStatus}
                columnsExpanded={columnsExpanded}
                onColumnsExpandedChange={setColumnsExpanded}
                onNavigateToBaseTable={handleNavigateToBaseTable}
                onExplainWithAI={handleExplainWithAI}
                onAskAIForViewIssue={handleAskAIForViewIssue}
              />
            )}

            {!isView && (
              <SuspensionDialog
                tableName={tableName}
                kind={kind}
                open={suspensionDialogOpen}
                onOpenChange={setSuspensionDialogOpen}
              />
            )}
          </>
        ) : (
          <EmptyState data-hook="table-details-empty-state">
            <EmptyStateHeading>
              Monitor and inspect your tables
            </EmptyStateHeading>
            <EmptyStateSubheading>
              Select a table from the dropdown above to view its metadata,
              health status, ingestion metrics, and performance insights in real
              time.
            </EmptyStateSubheading>
          </EmptyState>
        )}
      </Drawer.ContentWrapper>
    </Drawer>
  )
}
