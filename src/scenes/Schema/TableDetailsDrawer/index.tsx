import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react"
import { useSelector, useDispatch } from "react-redux"
import styled, { css, useTheme } from "styled-components"
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
} from "../../../components"
import {
  hideColumnsFromTableDDL,
  truncateLongDDL,
} from "../../../components/LiteEditor/utils"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import { QuestContext } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import {
  getTableKind,
  type Table,
  type Column,
  type MaterializedView,
  type View,
} from "../../../utils/questdb/types"
import {
  calculateHealthStatus,
  detectIngestionActive,
  MAX_TREND_SAMPLES,
  type TrendData,
  type HealthIssue,
} from "./healthCheck"
import { HealthStatusLabel } from "./HealthStatusLabel"
import { useDebouncedWarnings } from "./useDebouncedWarnings"
import { SuspensionDialog } from "../SuspensionDialog"
import { useAdaptivePoll, useAIQuickActions } from "../../../hooks"
import { MonitoringTab } from "./MonitoringTab"
import { DetailsTab } from "./DetailsTab"

const TypeBadge = styled.span`
  background: transparent;
  color: ${({ theme }) => theme.color.gray2};
  padding: 0.3rem 0;
  border-radius: 4px;
  font-size: 1.2rem;
  font-weight: 500;
  flex-shrink: 0;
  text-wrap: nowrap;
  height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
`

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
  color: ${({ theme }) => theme.color.foreground};
  margin: 0;
`

const EmptyStateSubheading = styled.p`
  font-size: 1.4rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.gray2};
  text-align: left;
  margin: 0;
  line-height: 1.5;
`

const TitleContainer = styled(Dialog.Title).attrs({})`
  display: flex;
  padding: 0;
  border: 0;
  gap: 1rem;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  margin-right: 1rem;
`

const StyledCopyButton = styled(CopyButton)`
  background: transparent;
  flex-shrink: 0;
`

type TabType = "monitoring" | "details"

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  padding-top: 0.375rem;
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
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ theme, $active }) => ($active ? theme.color.pink : "transparent")};
  color: ${({ theme, $active }) =>
    $active ? theme.color.foreground : theme.color.gray2};
  font-size: ${({ theme }) => theme.fontSize.lg};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  transition: all 150ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }

  ${({ $active }) =>
    !$active &&
    css`
      &:hover {
        border-bottom: 2px solid ${({ theme }) => theme.color.background};
      }
    `}
`

const TabBadge = styled.span<{ $type: "warning" | "error" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  height: 1.8rem;
  padding: 0 0.6rem;
  border-radius: 10px;
  font-size: 1.2rem;
  background: ${({ theme, $type }) =>
    $type === "error" ? `${theme.color.red}30` : `${theme.color.orange}30`};
  color: ${({ theme, $type }) =>
    $type === "error" ? theme.color.red : theme.color.orange};
  border: 1px solid
    ${({ theme, $type }) =>
      $type === "error" ? theme.color.red : theme.color.orange};
`

export const TableDetailsDrawer = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const target = useSelector(selectors.console.getTableDetailsTarget)

  const tableName = target?.tableName ?? ""
  const isMatView = target?.isMatView ?? false
  const isView = target?.isView ?? false
  const hasTarget = target !== null
  const isOpen = activeSidebar?.type === "tableDetails"

  const handleClose = () => {
    dispatch(actions.console.closeSidebar())
  }

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
          payload: {
            tableName: option.label,
            isMatView: option.kind === "matview",
            isView: option.kind === "view",
          },
        }),
      )
    },
    [dispatch],
  )

  const { quest } = useContext(QuestContext)
  const theme = useTheme()
  const [tableData, setTableData] = useState<Table | null>(null)
  const [matViewData, setMatViewData] = useState<MaterializedView | null>(null)
  const [viewData, setViewData] = useState<View | null>(null)
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

  const handleNavigateToBaseTable = useCallback(() => {
    if (!matViewData?.base_table_name || !baseTableExists) return
    dispatch(
      actions.console.pushSidebarHistory({
        type: "tableDetails",
        payload: {
          tableName: matViewData.base_table_name,
          isMatView: false,
          isView: false,
        },
      }),
    )
  }, [dispatch, matViewData?.base_table_name, baseTableExists])

  const { handleExplainSchema, handleAskAIForHealthIssue } = useAIQuickActions()

  const handleExplainWithAI = useCallback(() => {
    if (tableData?.id == null) return
    void handleExplainSchema(
      tableData.id,
      tableName,
      isView ? "view" : isMatView ? "matview" : "table",
      {
        partitionBy: tableData.partitionBy,
        walEnabled: tableData.walEnabled,
        designatedTimestamp: tableData.designatedTimestamp,
      },
    )
  }, [handleExplainSchema, tableData, tableName, isMatView, isView])

  const handleAskAIForIssue = useCallback(
    (issue: HealthIssue) => {
      if (tableData?.id == null) return

      let samples = undefined
      if (issue.field === "transactionLag") {
        samples = trendData.transactionLag
      } else if (issue.field === "pendingRows") {
        samples = trendData.walPendingRowCount
      }

      void handleAskAIForHealthIssue(tableData.id, tableName, issue, samples)
    },
    [handleAskAIForHealthIssue, tableData, tableName, trendData],
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
      const escapedName = tableName.replace(/'/g, "''")
      const response = await quest.query<Table>(
        `tables() WHERE table_name = '${escapedName}'`,
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setTableData(response.data[0])
      } else if (
        response.type === QuestDB.Type.DQL &&
        response.data.length === 0
      ) {
        dispatch(
          actions.console.replaceSidebarHistory({
            type: "tableDetails",
            payload: null,
          }),
        )
      }
    } catch (error) {
      console.error("Failed to fetch table data:", error)
    }
  }, [quest, tableName])

  const fetchMatViewData = useCallback(async () => {
    if (!isMatView) return
    try {
      const escapedName = tableName.replace(/'/g, "''")
      const response = await quest.query<MaterializedView>(
        `materialized_views() WHERE view_name = '${escapedName}'`,
      )
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
        dispatch(
          actions.console.replaceSidebarHistory({
            type: "tableDetails",
            payload: null,
          }),
        )
      }
    } catch (error) {
      console.error("Failed to fetch view data:", error)
    }
  }, [quest, tableName, isView, dispatch])

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
      const response = isView
        ? await quest.showViewDDL(tableName)
        : isMatView
          ? await quest.showMatViewDDL(tableName)
          : await quest.showTableDDL(tableName)
      if (response.type === QuestDB.Type.DQL && response.data[0]?.ddl) {
        setDdl(response.data[0].ddl)
      }
    } catch (error) {
      console.error("Failed to fetch DDL:", error)
    }
  }, [quest, tableName, isMatView, isView])

  const checkBaseTableStatus = useCallback(async () => {
    if (!isMatView || !matViewData?.base_table_name) {
      setBaseTableStatus(null)
      return
    }
    try {
      const escapedName = matViewData.base_table_name.replace(/'/g, "''")
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
  }, [quest, isMatView, matViewData?.base_table_name])

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    await Promise.all([
      fetchTableData(),
      fetchMatViewData(),
      fetchViewData(),
      fetchColumns(),
      fetchDDL(),
    ])
    setLoading(false)
  }, [fetchTableData, fetchMatViewData, fetchViewData, fetchColumns, fetchDDL])

  useEffect(() => {
    if (isOpen && hasTarget) {
      setTableData(null)
      setMatViewData(null)
      setViewData(null)
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
  }, [isOpen, hasTarget, tableName, fetchAllData])

  useEffect(() => {
    if (matViewData?.base_table_name) {
      void checkBaseTableStatus()
    }
  }, [matViewData?.base_table_name, checkBaseTableStatus])

  useAdaptivePoll({
    fetchFn: fetchTableData,
    enabled: isOpen && hasTarget && !loading && !isView,
    key: tableName,
    minIntervalMs: 200,
    maxIntervalMs: 5000,
    multiplier: 1.5,
  })

  useEffect(() => {
    if (tableData && !loading) {
      const now = Date.now()
      setTrendData((prev) => {
        // For ingestion detection: use wal_txn for WAL tables, table_row_count for non-WAL
        const ingestionValue = tableData.walEnabled
          ? (tableData.wal_txn ?? 0)
          : (tableData.table_row_count ?? 0)

        return {
          walPendingRowCount: tableData.walEnabled
            ? [
                ...prev.walPendingRowCount.slice(-(MAX_TREND_SAMPLES - 1)),
                {
                  value: Number(tableData.wal_pending_row_count) || 0,
                  timestamp: now,
                },
              ]
            : prev.walPendingRowCount,
          transactionLag: tableData.walEnabled
            ? [
                ...prev.transactionLag.slice(-(MAX_TREND_SAMPLES - 1)),
                {
                  value: Math.max(
                    0,
                    (Number(tableData.wal_txn) || 0) -
                      (Number(tableData.table_txn) || 0),
                  ),
                  timestamp: now,
                },
              ]
            : prev.transactionLag,
          ingestionMetric: [
            ...prev.ingestionMetric.slice(-(MAX_TREND_SAMPLES - 1)),
            { value: Number(ingestionValue) || 0, timestamp: now },
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
    if (!isOpen || !hasTarget) return

    const interval = setInterval(() => {
      void fetchColumns()
      void fetchDDL()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, hasTarget, fetchColumns, fetchDDL])

  const rawHealthStatus = useMemo(() => {
    if (!tableData) return null
    return calculateHealthStatus(tableData, matViewData, trendData, isMatView)
  }, [tableData, matViewData, trendData, isMatView])

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
    if (!healthStatus) return { warnings: 0, errors: 0 }
    const errors = healthStatus.issues.filter(
      (i) => i.severity === "critical",
    ).length
    const warnings = healthStatus.issues.filter(
      (i) => i.severity === "warning",
    ).length
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
    // Disable ingestion section when WAL is suspended or matview is invalid
    const walSuspended = tableData?.walEnabled && tableData?.table_suspended
    const matViewInvalid = isMatView && matViewData?.view_status === "invalid"
    return walSuspended || matViewInvalid
  }, [tableData, isMatView, matViewData])

  useEffect(() => {
    if (hasIngestionWarning && !hasAutoExpanded && !walExpanded) {
      setWalExpanded(true)
      setHasAutoExpanded(true)
    }
  }, [hasIngestionWarning, hasAutoExpanded, walExpanded])

  return (
    <Drawer
      mode="side"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      withCloseButton
      titleColor={
        hasTarget && isMatView
          ? theme.color.loginBackground
          : isView
            ? theme.color.tableSelection
            : theme.color.backgroundLighter
      }
      title={
        <TitleContainer>
          {hasTarget && (
            <HealthStatusLabel
              severity={
                isView
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
            <StyledCopyButton
              size="sm"
              text={tableName}
              iconOnly
              data-hook="table-details-copy-name"
            />
          )}
        </TitleContainer>
      }
      afterTitle={
        hasTarget ? (
          <TypeBadge data-hook="table-details-type-badge">
            {isView ? "View" : isMatView ? "Materialized View" : "Table"}
          </TypeBadge>
        ) : undefined
      }
      onDismiss={handleClose}
      trigger={<span />}
    >
      <Drawer.ContentWrapper mode="side" data-hook="table-details-drawer">
        {hasTarget && loading ? (
          <LoadingContainer data-hook="table-details-loading">
            <CircleNotchSpinner size={24} />
            <Text color="gray2" size="md">
              Loading table details...
            </Text>
          </LoadingContainer>
        ) : tableData ? (
          <>
            {!isView && (
              <TabsContainer>
                <TabsNav>
                  <Tab
                    $active={activeTab === "monitoring"}
                    onClick={() => setActiveTab("monitoring")}
                    data-hook="table-details-tab-monitoring"
                    data-active={activeTab === "monitoring"}
                  >
                    Monitoring
                    {monitoringIssuesCounts.errors > 0 && (
                      <TabBadge
                        $type="error"
                        data-hook="table-details-tab-error-badge"
                      >
                        <XSquareIcon size={12} weight="fill" />
                        {monitoringIssuesCounts.errors}
                      </TabBadge>
                    )}
                    {monitoringIssuesCounts.errors === 0 &&
                      monitoringIssuesCounts.warnings > 0 && (
                        <TabBadge
                          $type="warning"
                          data-hook="table-details-tab-warning-badge"
                        >
                          <WarningIcon size={12} weight="fill" />
                          {monitoringIssuesCounts.warnings}
                        </TabBadge>
                      )}
                  </Tab>
                  <Tab
                    $active={activeTab === "details"}
                    onClick={() => setActiveTab("details")}
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
                matViewData={matViewData}
                isMatView={isMatView}
                healthStatus={healthStatus}
                criticalIssues={criticalIssues}
                performanceWarnings={performanceWarnings}
                isIngestionActive={isIngestionActive}
                isIngestionDisabled={!!isIngestionDisabled}
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
                matViewData={matViewData}
                viewData={viewData}
                columns={columns}
                ddl={ddl}
                isMatView={isMatView}
                isView={isView}
                truncatedDDL={truncatedDDL}
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
                kind={isMatView ? "matview" : "table"}
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
