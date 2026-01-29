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
import { ArrowLeftIcon, XSquareIcon, WarningIcon } from "@phosphor-icons/react"
import { Drawer, Box, Text, CopyButton, Dialog } from "../../../components"
import { hideColumnsFromTableDDL } from "../../../components/LiteEditor/utils"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import { QuestContext } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import type {
  Table,
  Column,
  MaterializedView,
} from "../../../utils/questdb/types"
import {
  calculateHealthStatus,
  detectIngestionActive,
  MAX_TREND_SAMPLES,
  type TrendData,
} from "./healthCheck"
import { HealthStatusLabel } from "./HealthStatusLabel"
import { SuspensionDialog } from "../SuspensionDialog"
import { useAdaptivePoll } from "../../../hooks"
import { MonitoringTab } from "./MonitoringTab"
import { DetailsTab } from "./DetailsTab"

const TableName = styled(Text).attrs({
  color: "foreground",
  code: true,
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.6rem;
  font-weight: 400;
`

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
  margin-left: auto;
  background: transparent;
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

const HeaderBackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.gray2};
  font-weight: 500;

  &:hover {
    background: transparent !important;
    color: ${({ theme }) => theme.color.foreground};
  }
`

export const TableDetailsDrawer = () => {
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const target = useSelector(selectors.console.getTableDetailsTarget)

  const tableName = target?.tableName ?? ""
  const isMatView = target?.isMatView ?? false
  const isOpen = activeSidebar === "tableDetails" && target !== null

  const handleClose = () => {
    dispatch(actions.console.setActiveSidebar(undefined))
  }

  const navigatedFrom = target !== null ? target.navigatedFrom : undefined

  const { quest } = useContext(QuestContext)
  const theme = useTheme()
  const [tableData, setTableData] = useState<Table | null>(null)
  const [matViewData, setMatViewData] = useState<MaterializedView | null>(null)
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
      actions.console.setTableDetailsTarget({
        tableName: matViewData.base_table_name,
        isMatView: false,
        navigatedFrom: {
          tableName,
          isMatView: true,
        },
      }),
    )
  }, [dispatch, matViewData?.base_table_name, tableName, baseTableExists])

  const handleNavigateBack = useCallback(() => {
    if (!navigatedFrom) return
    dispatch(
      actions.console.setTableDetailsTarget({
        tableName: navigatedFrom.tableName,
        isMatView: navigatedFrom.isMatView,
      }),
    )
  }, [dispatch, navigatedFrom])

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
        dispatch(actions.console.setActiveSidebar(undefined))
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
      const response = isMatView
        ? await quest.showMatViewDDL(tableName)
        : await quest.showTableDDL(tableName)
      if (response.type === QuestDB.Type.DQL && response.data[0]?.ddl) {
        setDdl(response.data[0].ddl)
      }
    } catch (error) {
      console.error("Failed to fetch DDL:", error)
    }
  }, [quest, tableName, isMatView])

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
      fetchColumns(),
      fetchDDL(),
    ])
    setLoading(false)
  }, [fetchTableData, fetchMatViewData, fetchColumns, fetchDDL])

  useEffect(() => {
    if (isOpen) {
      setTableData(null)
      setMatViewData(null)
      setColumns([])
      setDdl("")
      setColumnsExpanded(false)
      setWalExpanded(true)
      setHasAutoExpanded(false)
      setActiveTab("monitoring")
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
      setBaseTableStatus(null)
      void fetchAllData()
    } else {
      setColumnsExpanded(false)
      setWalExpanded(true)
      setHasAutoExpanded(false)
      setActiveTab("monitoring")
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
      setBaseTableStatus(null)
    }
  }, [isOpen, tableName, fetchAllData])

  useEffect(() => {
    if (matViewData?.base_table_name) {
      void checkBaseTableStatus()
    }
  }, [matViewData?.base_table_name, checkBaseTableStatus])

  useAdaptivePoll({
    fetchFn: fetchTableData,
    enabled: isOpen && !loading,
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
                  value:
                    (Number(tableData.wal_txn) || 0) -
                    (Number(tableData.table_txn) || 0),
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
    if (!isOpen || !isMatView) return

    const interval = setInterval(() => {
      void fetchMatViewData()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, isMatView, fetchMatViewData])

  const healthStatus = useMemo(() => {
    if (!tableData) return null
    return calculateHealthStatus(tableData, matViewData, trendData, isMatView)
  }, [tableData, matViewData, trendData, isMatView])

  const truncatedDDL = useMemo(() => {
    if (!ddl) return { text: "", grayedOutLines: null }
    return hideColumnsFromTableDDL(ddl, columns)
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

  if (!target) return null

  return (
    <Drawer
      mode="side"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      withCloseButton
      titleColor={
        isMatView ? theme.color.loginBackground : theme.color.backgroundLighter
      }
      title={
        <TitleContainer>
          {navigatedFrom && (
            <HeaderBackButton onClick={handleNavigateBack}>
              <ArrowLeftIcon size={14} weight="bold" />
              <span>Back</span>
            </HeaderBackButton>
          )}
          {healthStatus && (
            <HealthStatusLabel severity={healthStatus.overallSeverity} />
          )}
          <TableName ellipsis>{tableName}</TableName>
          <StyledCopyButton size="sm" text={tableName} iconOnly />
        </TitleContainer>
      }
      afterTitle={
        <TypeBadge>{isMatView ? "Materialized View" : "Table"}</TypeBadge>
      }
      onDismiss={handleClose}
      trigger={<span />}
    >
      <Drawer.ContentWrapper mode="side">
        {loading ? (
          <LoadingContainer>
            <CircleNotchSpinner size={24} />
            <Text color="gray2" size="md">
              Loading table details...
            </Text>
          </LoadingContainer>
        ) : tableData ? (
          <>
            <TabsContainer>
              <TabsNav>
                <Tab
                  $active={activeTab === "monitoring"}
                  onClick={() => setActiveTab("monitoring")}
                >
                  Monitoring
                  {monitoringIssuesCounts.errors > 0 && (
                    <TabBadge $type="error">
                      <XSquareIcon size={12} weight="fill" />
                      {monitoringIssuesCounts.errors}
                    </TabBadge>
                  )}
                  {monitoringIssuesCounts.errors === 0 &&
                    monitoringIssuesCounts.warnings > 0 && (
                      <TabBadge $type="warning">
                        <WarningIcon size={12} weight="fill" />
                        {monitoringIssuesCounts.warnings}
                      </TabBadge>
                    )}
                </Tab>
                <Tab
                  $active={activeTab === "details"}
                  onClick={() => setActiveTab("details")}
                >
                  Details
                </Tab>
              </TabsNav>
              <TabsSeparator />
            </TabsContainer>

            {activeTab === "monitoring" && (
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
              />
            )}

            {activeTab === "details" && (
              <DetailsTab
                tableData={tableData}
                matViewData={matViewData}
                columns={columns}
                ddl={ddl}
                isMatView={isMatView}
                truncatedDDL={truncatedDDL}
                baseTableStatus={baseTableStatus}
                columnsExpanded={columnsExpanded}
                onColumnsExpandedChange={setColumnsExpanded}
                onNavigateToBaseTable={handleNavigateToBaseTable}
              />
            )}

            <SuspensionDialog
              tableName={tableName}
              kind={isMatView ? "matview" : "table"}
              open={suspensionDialogOpen}
              onOpenChange={setSuspensionDialogOpen}
            />
          </>
        ) : (
          <LoadingContainer>
            <Text color="gray2">Table not found</Text>
          </LoadingContainer>
        )}
      </Drawer.ContentWrapper>
    </Drawer>
  )
}
