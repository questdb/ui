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
  type MaterializedView,
  type View,
  type LiveView,
} from "../../../utils/questdb/types"
import { createTableDetailsTarget } from "../../../store/Console/types"
import {
  calculateHealthStatus,
  detectIngestionActive,
  isLiveViewLoadFailure,
  LIVE_VIEW_ISSUE_GUIDANCE,
  LIVE_VIEW_POLL_MS,
  MAX_TREND_SAMPLES,
  type TrendData,
  type HealthIssue,
} from "./healthCheck"
import { getTrendSamplesForIssue } from "./utils"
import { HealthStatusLabel } from "./HealthStatusLabel"
import { useDebouncedWarnings } from "./useDebouncedWarnings"
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

const LIVE_VIEW_QUERY_TIMEOUT_MS = 10_000
const LIVE_VIEW_METADATA_FAILURE_THRESHOLD = 3
const LIVE_VIEW_METADATA_RECOVERY_THRESHOLD = 2
const TABLE_POLL_MIN_MS = 200
const TABLE_POLL_MAX_MS = 5_000
const DETAILS_TABLE_POLL_MS = 1_000

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
  const activeLiveViewQueryIdRef = useRef<QuestDB.QueryId | null>(null)

  const tableName = target?.tableName ?? ""
  const isMatView = target?.isMatView ?? false
  const isView = target?.isView ?? false
  const isLiveView = target?.isLiveView ?? false
  const kind: TableKind = isView
    ? "view"
    : isMatView
      ? "matview"
      : isLiveView
        ? "liveview"
        : "table"
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
        currentTarget.isMatView === (candidateKind === "matview") &&
        currentTarget.isView === (candidateKind === "view") &&
        currentTarget.isLiveView === (candidateKind === "liveview")
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
          payload: createTableDetailsTarget(
            option.label,
            option.kind ?? "table",
          ),
        }),
      )
    },
    [],
  )

  const { quest } = useContext(QuestContext)
  const { settings } = useSettings()
  const isEnterprise = settings["release.type"] === "EE"
  const [tableData, setTableData] = useState<Table | null>(null)
  const [matViewData, setMatViewData] = useState<MaterializedView | null>(null)
  const [viewData, setViewData] = useState<View | null>(null)
  const [liveViewData, setLiveViewData] = useState<LiveView | null>(null)
  const [liveViewMetadataError, setLiveViewMetadataError] = useState(false)
  const liveViewMetadataFailureCountRef = useRef(0)
  const liveViewMetadataSuccessCountRef = useRef(0)
  const [columns, setColumns] = useState<Column[]>([])
  const [ddl, setDdl] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [columnsExpanded, setColumnsExpanded] = useState(false)
  const [walExpanded, setWalExpanded] = useState(true)
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false)
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("monitoring")
  const [trendData, setTrendData] = useState<TrendData>({
    walPendingRowCount: [],
    transactionLag: [],
    ingestionMetric: [],
  })
  const [baseTableStatus, setBaseTableStatus] = useState<
    "Dropped" | "Suspended" | "Valid" | null
  >(null)
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"
  const liveViewLoadFailed = isLiveView && isLiveViewLoadFailure(liveViewData)

  const baseTableName = isMatView
    ? matViewData?.base_table_name
    : isLiveView
      ? (liveViewData?.base_table_name ?? undefined)
      : undefined

  const recordLiveViewMetadataSuccess = useCallback(() => {
    liveViewMetadataFailureCountRef.current = 0
    liveViewMetadataSuccessCountRef.current += 1
    if (
      liveViewMetadataSuccessCountRef.current >=
      LIVE_VIEW_METADATA_RECOVERY_THRESHOLD
    ) {
      setLiveViewMetadataError(false)
    }
  }, [])

  const recordLiveViewMetadataFailure = useCallback(() => {
    liveViewMetadataSuccessCountRef.current = 0
    liveViewMetadataFailureCountRef.current += 1
    if (
      liveViewMetadataFailureCountRef.current >=
      LIVE_VIEW_METADATA_FAILURE_THRESHOLD
    ) {
      setLiveViewMetadataError(true)
    }
  }, [])

  const resetLiveViewMetadataError = useCallback(() => {
    liveViewMetadataFailureCountRef.current = 0
    liveViewMetadataSuccessCountRef.current = 0
    setLiveViewMetadataError(false)
  }, [])

  const kindData: TableKindData = useMemo(
    () =>
      kind === "view"
        ? { kind, view: viewData }
        : kind === "matview"
          ? { kind, matView: matViewData }
          : kind === "liveview"
            ? { kind, liveView: liveViewData }
            : { kind: "table" },
    [kind, viewData, matViewData, liveViewData],
  )

  const handleNavigateToBaseTable = useCallback(() => {
    if (!baseTableName || !baseTableExists) return
    const baseTable = tables.find((t) => t.table_name === baseTableName)
    dispatch(
      actions.console.pushSidebarHistory({
        type: "tableDetails",
        payload: createTableDetailsTarget(
          baseTableName,
          baseTable ? getTableKind(baseTable) : "table",
        ),
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
        kindData.kind === "matview" && kindData.matView
          ? {
              source: "materialized_views()" as const,
              data: kindData.matView,
            }
          : kindData.kind === "liveview" && kindData.liveView
            ? {
                source: "live_views()" as const,
                data: kindData.liveView,
                guidance: LIVE_VIEW_ISSUE_GUIDANCE[issue.id],
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

  const fetchTableData = useCallback(async () => {
    try {
      const response = await quest.getTableDetails(tableName)
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setTableData(response.data[0])
      } else if (
        response.type === QuestDB.Type.DQL &&
        response.data.length === 0
      ) {
        clearIfCurrentTarget(tableName, kind)
      }
    } catch (error) {
      console.error("Failed to fetch table data:", error)
    }
  }, [quest, tableName, kind, clearIfCurrentTarget])

  const fetchMatViewData = useCallback(async () => {
    if (!isMatView) return
    try {
      const response = await quest.getMaterializedViewDetails(tableName)
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setMatViewData(response.data[0])
      }
    } catch (error) {
      console.error("Failed to fetch materialized view data:", error)
    }
  }, [quest, tableName, isMatView])

  const fetchViewData = useCallback(async () => {
    if (!isView) return
    try {
      const escapedName = tableName.replace(/'/g, "''")
      const response = await quest.query<View>(
        `views() WHERE view_name = '${escapedName}'`,
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setViewData(response.data[0])
      } else if (
        response.type === QuestDB.Type.DQL &&
        response.data.length === 0
      ) {
        clearIfCurrentTarget(tableName, "view")
      }
    } catch (error) {
      console.error("Failed to fetch view data:", error)
    }
  }, [quest, tableName, isView, clearIfCurrentTarget])

  const fetchLiveViewData = useCallback(async () => {
    if (!isLiveView) return
    if (activeLiveViewQueryIdRef.current !== null) return

    let queryId: QuestDB.QueryId | null = null
    let timeoutId: number | null = null
    let timedOut = false
    try {
      const escapedName = tableName.replace(/'/g, "''")
      const query = quest.queryRaw(
        `live_views() WHERE view_name = '${escapedName}'`,
        { cancellable: true },
      )
      const currentQueryId = query.queryId
      queryId = currentQueryId
      activeLiveViewQueryIdRef.current = currentQueryId
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true
          if (activeLiveViewQueryIdRef.current === currentQueryId) {
            quest.abort(currentQueryId)
          }
          reject(new Error("Live view metadata request timed out"))
        }, LIVE_VIEW_QUERY_TIMEOUT_MS)
      })

      const rawResponse = await Promise.race([query.promise, timeoutPromise])
      if (activeLiveViewQueryIdRef.current !== queryId) return
      if (!isCurrentTarget(tableName, "liveview")) return

      const response = QuestDB.Client.transformQueryRawResult<LiveView>(
        rawResponse,
        { convertLongsToBigInt: true },
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setLiveViewData(response.data[0])
        recordLiveViewMetadataSuccess()
      } else if (
        response.type === QuestDB.Type.DQL &&
        response.data.length === 0
      ) {
        clearIfCurrentTarget(tableName, "liveview")
      } else {
        recordLiveViewMetadataFailure()
      }
    } catch (error) {
      const wasCancelled =
        typeof error === "object" &&
        error !== null &&
        "error" in error &&
        error.error === "Cancelled by user"
      if (wasCancelled && !timedOut) {
        return
      }
      if (!isCurrentTarget(tableName, "liveview")) return
      recordLiveViewMetadataFailure()
      console.error("Failed to fetch live view data:", error)
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (activeLiveViewQueryIdRef.current === queryId) {
        activeLiveViewQueryIdRef.current = null
      }
    }
  }, [
    quest,
    tableName,
    isLiveView,
    isCurrentTarget,
    clearIfCurrentTarget,
    recordLiveViewMetadataSuccess,
    recordLiveViewMetadataFailure,
  ])

  const fetchColumns = useCallback(async () => {
    try {
      const response = await quest.showColumns(tableName)
      if (response.type === QuestDB.Type.DQL) {
        setColumns(response.data)
      }
    } catch (error) {
      console.error("Failed to fetch columns:", error)
    }
  }, [quest, tableName])

  const fetchDDL = useCallback(async () => {
    try {
      const response = await quest.showDDL(tableName, kind)
      if (response.type === QuestDB.Type.DQL && response.data[0]?.ddl) {
        setDdl(response.data[0].ddl)
      }
    } catch (error) {
      console.error("Failed to fetch DDL:", error)
    }
  }, [quest, tableName, kind])

  const checkBaseTableStatus = useCallback(async () => {
    if (!baseTableName) {
      setBaseTableStatus(null)
      return
    }
    try {
      const escapedName = baseTableName.replace(/'/g, "''")
      const response = await quest.query<Table>(
        `tables() WHERE table_name = '${escapedName}'`,
      )
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

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchTableData(),
      fetchMatViewData(),
      fetchViewData(),
      fetchLiveViewData(),
      fetchColumns(),
      fetchDDL(),
    ])
    setLoading(false)
  }, [
    fetchTableData,
    fetchMatViewData,
    fetchViewData,
    fetchLiveViewData,
    fetchColumns,
    fetchDDL,
  ])

  useEffect(() => {
    targetRef.current = target
    activeSidebarRef.current = activeSidebar
  }, [target, activeSidebar])

  useEffect(() => {
    if (isOpen && hasTarget) {
      setTableData(null)
      setMatViewData(null)
      setViewData(null)
      setLiveViewData(null)
      resetLiveViewMetadataError()
      setColumns([])
      setDdl("")
      setColumnsExpanded(isView)
      setWalExpanded(true)
      setHasAutoExpanded(false)
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
      setBaseTableStatus(null)
      void fetchAllData()
    } else if (!isOpen || !hasTarget) {
      setTableData(null)
      setMatViewData(null)
      setViewData(null)
      setLiveViewData(null)
      resetLiveViewMetadataError()
      setColumns([])
      setDdl("")
      setColumnsExpanded(false)
      setWalExpanded(true)
      setHasAutoExpanded(false)
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
      setBaseTableStatus(null)
    }
  }, [isOpen, hasTarget, tableName, fetchAllData, resetLiveViewMetadataError])

  useEffect(() => {
    if (baseTableName) {
      void checkBaseTableStatus()
    }
  }, [baseTableName, checkBaseTableStatus])

  useAdaptivePoll({
    fetchFn: fetchTableData,
    enabled: isOpen && hasTarget && !loading && !isView,
    key: `${tableName}-${activeTab}`,
    minIntervalMs:
      activeTab === "monitoring" ? TABLE_POLL_MIN_MS : DETAILS_TABLE_POLL_MS,
    maxIntervalMs:
      activeTab === "monitoring" ? TABLE_POLL_MAX_MS : DETAILS_TABLE_POLL_MS,
    multiplier: 1.5,
  })

  useEffect(() => {
    if (tableData && !loading) {
      const now = Date.now()
      setTrendData((prev) => {
        // For ingestion detection: use wal_txn for WAL tables, table_row_count for non-WAL
        const ingestionValue = tableData.walEnabled
          ? (tableData.wal_txn ?? BIGINT_ZERO)
          : (tableData.table_row_count ?? BIGINT_ZERO)
        const transactionLag =
          (tableData.wal_txn ?? BIGINT_ZERO) -
          (tableData.table_txn ?? BIGINT_ZERO)

        return {
          walPendingRowCount: tableData.walEnabled
            ? [
                ...prev.walPendingRowCount.slice(-(MAX_TREND_SAMPLES - 1)),
                {
                  value: tableData.wal_pending_row_count ?? BIGINT_ZERO,
                  timestamp: now,
                },
              ]
            : prev.walPendingRowCount,
          transactionLag: tableData.walEnabled
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
  }, [tableData, loading])

  useEffect(() => {
    if (!isOpen || !hasTarget || !isMatView) return

    const interval = setInterval(() => {
      void fetchMatViewData()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, hasTarget, isMatView, fetchMatViewData])

  useEffect(() => {
    if (!isOpen || !hasTarget || !isView) return

    const interval = setInterval(() => {
      void fetchViewData()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, hasTarget, isView, fetchViewData])

  useEffect(() => {
    if (!isOpen || !hasTarget || !isLiveView) return

    const interval = setInterval(() => {
      void fetchLiveViewData()
    }, LIVE_VIEW_POLL_MS)

    return () => {
      clearInterval(interval)
      const queryId = activeLiveViewQueryIdRef.current
      if (queryId !== null) {
        quest.abort(queryId)
        activeLiveViewQueryIdRef.current = null
      }
    }
  }, [isOpen, hasTarget, isLiveView, fetchLiveViewData, quest])

  useEffect(() => {
    if (!isOpen || !hasTarget) return
    // Not needed for monitoring
    if (!isView && activeTab !== "details") return

    const interval = setInterval(() => {
      void fetchColumns()
      void fetchDDL()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, hasTarget, isView, activeTab, fetchColumns, fetchDDL])

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
      (healthStatus?.issues.filter((i) => i.severity === "critical").length ??
        0) + (isLiveView && liveViewMetadataError ? 1 : 0)
    const warnings =
      healthStatus?.issues.filter((i) => i.severity === "warning").length ?? 0
    return { warnings, errors }
  }, [healthStatus, isLiveView, liveViewMetadataError])

  const criticalIssues = useMemo(() => {
    if (!healthStatus) return []
    return healthStatus.issues.filter((i) => i.severity === "critical")
  }, [healthStatus])

  const performanceWarnings = useMemo(() => {
    if (!healthStatus) return []
    return healthStatus.issues.filter((i) => i.severity === "warning")
  }, [healthStatus])

  const isIngestionDisabled = useMemo(() => {
    // Disable ingestion section when WAL is suspended or the view is invalid
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

  const drawerTitle = useMemo(
    () => (
      <TitleContainer>
        {hasTarget && (
          <HealthStatusLabel
            severity={
              isLiveView && liveViewMetadataError
                ? "critical"
                : isView
                  ? viewData?.view_status === "invalid"
                    ? "critical"
                    : "healthy"
                  : (healthStatus?.overallSeverity ?? "healthy")
            }
          />
        )}

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
    [
      hasTarget,
      isView,
      isLiveView,
      liveViewMetadataError,
      viewData?.view_status,
      healthStatus?.overallSeverity,
      tableOptions,
      tableName,
    ],
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
        ) : tableData ? (
          <>
            {isLiveView && liveViewMetadataError && (
              <MetadataErrorBannerWrapper
                role="alert"
                data-hook="table-details-live-view-metadata-error"
              >
                <ErrorBanner
                  title="Unable to load live view metadata"
                  description="Monitoring data may be stale or unavailable. The console will retry automatically."
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
                isLiveViewLoadFailure={liveViewLoadFailed}
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
                columns={columns}
                ddl={ddl}
                isLiveViewLoadFailure={liveViewLoadFailed}
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
