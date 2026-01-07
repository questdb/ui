import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react"
import { useSelector, useDispatch } from "react-redux"
import styled, { css, useTheme, keyframes } from "styled-components"
import { selectors, actions } from "../../../store"
import {
  CaretRightIcon,
  CheckCircleIcon,
  PauseCircleIcon,
  XCircleIcon,
  CodeIcon,
  TextColumnsIcon,
  RowsIcon,
  ClockCounterClockwiseIcon,
  WarningIcon,
  RowsPlusBottomIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  InfoIcon,
  CircleIcon,
} from "@phosphor-icons/react"
import { Drawer, Box, Text, CopyButton, Button } from "../../../components"
import { Badge, BadgeType } from "../../../components/Badge"
import { LiteEditor } from "../../../components/LiteEditor"
import { CircleNotchSpinner } from "../../Editor/Monaco/icons"
import { QuestContext } from "../../../providers"
import * as QuestDB from "../../../utils/questdb"
import type {
  Table,
  Column,
  MaterializedView,
} from "../../../utils/questdb/types"
import {
  formatRelativeTimestamp,
  formatMemoryPressure,
  formatRowCount,
  formatTTL,
} from "./utils"
import { ColumnIcon } from "../Row"
import { Tooltip, PopperHover } from "../../../components"
import {
  calculateHealthStatus,
  detectIngestionActive,
  MAX_TREND_SAMPLES,
  type TrendData,
  type HealthSeverity,
  type HealthIssue,
  type TrendIndicator,
} from "./healthCheck"
import { SuspensionDialog } from "../SuspensionDialog"
import { Restart } from "@styled-icons/remix-line"
import { useAdaptivePoll } from "../../../hooks"

const TableName = styled(Text).attrs({
  color: "foreground",
  weight: 600,
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.6rem;
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

const Section = styled(Box).attrs<{ $first?: boolean }>({
  flexDirection: "column",
  gap: "2rem",
  align: "stretch",
})<{ $first?: boolean }>`
  padding: 2rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.backgroundLighter};
  width: 100%;
  ${({ $first }) =>
    $first &&
    css`
      border-top: 1px solid ${({ theme }) => theme.color.backgroundLighter};
    `}
`

const TopSection = styled(Box).attrs({
  flexDirection: "column",
  align: "stretch",
})`
  padding: 1rem;
  border: 0;
  width: 100%;
`

const SectionTitleContainer = styled(Box).attrs({
  gap: "0.5rem",
  align: "center",
})`
  width: 100%;
`

const SectionTitle = styled(Text).attrs({
  color: "foreground",
  size: "lg",
  weight: 600,
})`
  svg {
    flex-shrink: 0;
  }
`

const StatusBadge = styled(Badge)`
  padding: 0.3rem 0.6rem;
  height: auto;
  font-size: 1.3rem;
  margin-left: 1rem;
`

const SectionTitleClickable = styled(SectionTitle)`
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  user-select: none;
`

const CaretIcon = styled(CaretRightIcon)<{ $expanded?: boolean }>`
  transition: transform 150ms ease;
  transform: rotate(${({ $expanded }) => ($expanded ? "90deg" : "0deg")});
`

const MetricsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.1rem;
  border-radius: 0.5rem;
  overflow: hidden;
`

const MetricCard = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.3rem",
  align: "flex-start",
  justifyContent: "space-between",
})`
  padding: 1rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
`

const TopMetricsCard = styled(MetricCard)`
  background: transparent;
  padding: 1rem 0.5rem;
`

const MetricLabel = styled(Text).attrs({
  color: "gray2",
  size: "sm",
})`
  letter-spacing: 0.03em;
`

const MetricValue = styled(Text).attrs({
  color: "foreground",
  size: "md",
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TwoColumnGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  padding: 0 1rem;
`

const ConfigItem = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.3rem",
  align: "flex-start",
})`
  min-width: 0;
  overflow: hidden;
`

const RateText = styled(Text)`
  transform: translateY(1px);
`

const ColumnNameBox = styled(Box)`
  min-width: 0;
  flex: 1;
`

const ColumnType = styled(Text).attrs({
  color: "gray2",
  size: "sm",
})`
  flex-shrink: 0;
  margin-left: 1rem;
`

const SchemaRow = styled(Box).attrs({
  justifyContent: "space-between",
  align: "center",
})`
  max-width: 100%;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.backgroundLighter};
  }
`

const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  padding: 4rem;
  height: 100%;
`

const TitleContainer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  max-width: 100%;
  overflow: hidden;
  margin-right: 1rem;
`

const HealthDot = styled.div<{ $severity: HealthSeverity }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ theme, $severity }) => {
    switch ($severity) {
      case "critical":
        return theme.color.red
      case "warning":
        return theme.color.orange
      case "recovering":
        return theme.color.green
      default:
        return theme.color.green
    }
  }};
`

const IngestionStatusContainer = styled(Box).attrs({
  flexDirection: "row",
  gap: "1.5rem",
  align: "center",
  justifyContent: "space-between",
})`
  border-radius: 4px;
  width: 100%;
`

const IngestionIndicator = styled(Box).attrs({
  gap: "0.5rem",
  align: "center",
})`
  margin-left: auto;
  flex-shrink: 0;
`

const pulseColor = keyframes`
  0%, 100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
`

const PulsingCircle = styled(CircleIcon)`
  animation: ${pulseColor} 1.5s ease-in-out infinite;
  color: ${({ theme }) => theme.color.green};
`

const getSeverityColor = (
  theme: { color: Record<string, string> },
  severity: HealthSeverity | undefined,
): string => {
  switch (severity) {
    case "critical":
      return theme.color.red
    case "warning":
      return theme.color.orange
    case "recovering":
      return theme.color.green
    default:
      return theme.color.foreground
  }
}

const getSeverityTextColor = (
  severity: HealthSeverity | undefined,
): "foreground" | "red" | "orange" | "green" | "gray2" => {
  switch (severity) {
    case "critical":
      return "red"
    case "warning":
      return "orange"
    case "recovering":
      return "green"
    default:
      return "gray2"
  }
}

const formatRate = (rate: number, field: string): string => {
  const absRate = Math.abs(rate)
  const unit = field === "transactionLag" ? "transactions/s" : "rows/s"

  if (absRate >= 1_000_000_000_000) {
    return `${(absRate / 1_000_000_000_000).toFixed(1)}T ${unit}`
  }
  if (absRate >= 1_000_000_000) {
    return `${(absRate / 1_000_000_000).toFixed(1)}B ${unit}`
  }
  if (absRate >= 1_000_000) {
    return `${(absRate / 1_000_000).toFixed(1)}M ${unit}`
  }
  if (absRate >= 1_000) {
    return `${(absRate / 1_000).toFixed(1)}K ${unit}`
  }
  return `${Math.round(absRate)} ${unit}`
}

const ConfigItemWithHealth = ({
  label,
  value,
  issue,
  trend,
}: {
  label: string
  value: React.ReactNode
  issue?: HealthIssue
  trend?: TrendIndicator
}) => {
  const theme = useTheme()
  const trendColor =
    trend?.direction === "increasing" ? theme.color.orange : theme.color.green
  const TrendArrow =
    trend?.direction === "increasing" ? ArrowUpIcon : ArrowDownIcon

  const labelColor = issue ? getSeverityTextColor(issue.severity) : "gray2"
  const valueColor = issue ? getSeverityTextColor(issue.severity) : "foreground"
  const iconColor = issue ? getSeverityColor(theme, issue.severity) : undefined

  const content = (
    <ConfigItem>
      <Box gap="0.5rem" align="center">
        <Text color={labelColor} size="sm">
          {label}
        </Text>
        {issue && <WarningIcon size={12} weight="fill" color={iconColor} />}
      </Box>
      <Box gap="1rem" align="center">
        <Text color={valueColor} weight={500}>
          {value}
        </Text>
        {trend && (
          <Box gap="0.2rem" align="center">
            <TrendArrow size={14} weight="bold" color={trendColor} />
            <RateText
              color={trend.direction === "increasing" ? "orange" : "green"}
              size="xs"
            >
              {trend.rate > 0 ? "+" : "-"}
              {formatRate(trend.rate, trend.field)}
            </RateText>
          </Box>
        )}
      </Box>
    </ConfigItem>
  )

  const tooltipMessage = issue?.message ?? trend?.message
  if (tooltipMessage) {
    return (
      <PopperHover placement="left-start" trigger={content}>
        <Tooltip>{tooltipMessage}</Tooltip>
      </PopperHover>
    )
  }

  return content
}

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

  const { quest } = useContext(QuestContext)
  const theme = useTheme()
  const [tableData, setTableData] = useState<Table | null>(null)
  const [matViewData, setMatViewData] = useState<MaterializedView | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [ddl, setDdl] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [columnsExpanded, setColumnsExpanded] = useState(false)
  const [walExpanded, setWalExpanded] = useState(false)
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false)
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false)
  const [trendData, setTrendData] = useState<TrendData>({
    walPendingRowCount: [],
    transactionLag: [],
    ingestionMetric: [],
  })

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
      setWalExpanded(false)
      setHasAutoExpanded(false)
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
      void fetchAllData()
    } else {
      setColumnsExpanded(false)
      setWalExpanded(false)
      setHasAutoExpanded(false)
      setTrendData({
        walPendingRowCount: [],
        transactionLag: [],
        ingestionMetric: [],
      })
    }
  }, [isOpen, tableName, fetchAllData])

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
        isMatView ? theme.color.loginBackground : theme.color.tableSelection
      }
      title={
        <TitleContainer>
          {healthStatus && (
            <HealthDot $severity={healthStatus.overallSeverity} />
          )}
          <TableName ellipsis>{tableName}</TableName>
          <CopyButton size="sm" text={tableName} iconOnly />
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
            {/* Top Section */}
            <TopSection>
              <TwoColumnGrid>
                <TopMetricsCard>
                  <Box gap="0.5rem" align="center">
                    <RowsIcon size="16px" weight="bold" />
                    <Text size="md" color="foreground" weight={600}>
                      Rows
                    </Text>
                  </Box>
                  <Text color="foreground" size="lg">
                    {formatRowCount(tableData.table_row_count)}
                  </Text>
                </TopMetricsCard>

                {isMatView && matViewData ? (
                  <TopMetricsCard>
                    <Box gap="0.5rem" align="center">
                      <ClockCounterClockwiseIcon size="16px" weight="bold" />
                      <Text size="md" color="foreground" weight={600}>
                        Last Refresh
                      </Text>
                    </Box>
                    <Text color="foreground" size="lg">
                      {formatRelativeTimestamp(
                        matViewData.last_refresh_finish_timestamp,
                      )}
                    </Text>
                  </TopMetricsCard>
                ) : (
                  <TopMetricsCard>
                    <Box gap="0.5rem" align="center">
                      <ClockCounterClockwiseIcon size="16px" weight="bold" />
                      <Text size="md" color="foreground" weight={600}>
                        Last Update
                      </Text>
                    </Box>
                    <Text color="foreground" size="lg">
                      {formatRelativeTimestamp(tableData.table_max_timestamp)}
                    </Text>
                  </TopMetricsCard>
                )}
              </TwoColumnGrid>
            </TopSection>

            <Section $first>
              <SectionTitleContainer>
                <InfoIcon size="16px" weight="bold" />
                <SectionTitle>Details</SectionTitle>
              </SectionTitleContainer>
              <MetricsGrid>
                {isMatView && matViewData && (
                  <>
                    <MetricCard>
                      <Box gap="0" align="center">
                        <MetricLabel>View Status</MetricLabel>
                        {matViewData.view_status === "invalid" && (
                          <StatusBadge
                            type={BadgeType.ERROR}
                            icon={<XCircleIcon weight="fill" size="14px" />}
                          >
                            Invalid
                          </StatusBadge>
                        )}
                      </Box>
                      <Box gap="0.5rem" align="center">
                        {matViewData.view_status === "valid" ? (
                          <>
                            <CheckCircleIcon
                              size={16}
                              weight="fill"
                              color={theme.color.green}
                            />
                            <Text color="green">Valid</Text>
                          </>
                        ) : matViewData.view_status === "refreshing" ? (
                          <MetricValue>Refreshing</MetricValue>
                        ) : matViewData.invalidation_reason ? (
                          <Text color="red">
                            {matViewData.invalidation_reason}
                          </Text>
                        ) : null}
                      </Box>
                    </MetricCard>

                    <MetricCard>
                      <MetricLabel>Refresh Type</MetricLabel>
                      <MetricValue>
                        {matViewData.refresh_type.charAt(0).toUpperCase() +
                          matViewData.refresh_type.slice(1).toLowerCase()}
                      </MetricValue>
                    </MetricCard>
                  </>
                )}
                <MetricCard>
                  <MetricLabel>TTL</MetricLabel>
                  <MetricValue>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </MetricValue>
                </MetricCard>
                <MetricCard>
                  <MetricLabel>Deduplication</MetricLabel>
                  <MetricValue>
                    {tableData.dedup ? "Enabled" : "Disabled"}
                  </MetricValue>
                </MetricCard>
              </MetricsGrid>
              <TwoColumnGrid>
                {isMatView && matViewData && (
                  <ConfigItem>
                    <Text color="gray2" size="sm">
                      Base Table
                    </Text>
                    <Text color="foreground" weight={500}>
                      {matViewData.base_table_name}
                    </Text>
                  </ConfigItem>
                )}
                <ConfigItem>
                  <Text color="gray2" size="sm">
                    Partitioning
                  </Text>
                  <Text color="foreground" weight={500}>
                    {tableData.partitionBy === "NONE"
                      ? "None"
                      : `${tableData.partitionBy.charAt(0).toUpperCase() + tableData.partitionBy.slice(1).toLowerCase()}`}
                  </Text>
                </ConfigItem>
              </TwoColumnGrid>
            </Section>

            {/* Ingestion Section */}
            <Section>
              {/* WAL enabled and NOT suspended - expandable with metrics */}
              {tableData.walEnabled && !tableData.table_suspended && (
                <>
                  <SectionTitleClickable
                    onClick={() => setWalExpanded(!walExpanded)}
                  >
                    <SectionTitleContainer>
                      <CaretIcon
                        size={14}
                        weight="bold"
                        $expanded={walExpanded}
                      />
                      <RowsPlusBottomIcon size="16px" />
                      <SectionTitle>Ingestion</SectionTitle>
                      {hasIngestionWarning && (
                        <WarningIcon
                          size={16}
                          weight="fill"
                          color={theme.color.orange}
                          style={{ marginLeft: "0.5rem" }}
                        />
                      )}
                      {isIngestionActive && (
                        <IngestionIndicator>
                          <PulsingCircle size={10} weight="fill" />
                          <Text color="gray2" size="sm" weight={400}>
                            Ingesting...
                          </Text>
                        </IngestionIndicator>
                      )}
                    </SectionTitleContainer>
                  </SectionTitleClickable>
                  {walExpanded && (
                    <TwoColumnGrid>
                      <ConfigItemWithHealth
                        label="Pending Rows"
                        value={formatRowCount(tableData.wal_pending_row_count)}
                        issue={healthStatus?.fieldIssues.get("pendingRows")}
                        trend={healthStatus?.trendIndicators.get("pendingRows")}
                      />
                      <ConfigItemWithHealth
                        label="Transaction Lag"
                        value={
                          tableData.wal_txn !== null ||
                          tableData.table_txn !== null
                            ? `${(tableData.wal_txn ?? 0) - (tableData.table_txn ?? 0)} txn${(tableData.wal_txn ?? 0) - (tableData.table_txn ?? 0) === 1 ? "" : "s"}`
                            : "N/A"
                        }
                        issue={healthStatus?.fieldIssues.get("transactionLag")}
                        trend={healthStatus?.trendIndicators.get(
                          "transactionLag",
                        )}
                      />
                      <ConfigItem>
                        <Text color="gray2" size="sm">
                          WAL Transaction Number
                        </Text>
                        <Text color="foreground" weight={500}>
                          {tableData.wal_txn !== null
                            ? tableData.wal_txn.toLocaleString()
                            : "N/A"}
                        </Text>
                      </ConfigItem>
                      <ConfigItemWithHealth
                        label="Memory Pressure"
                        value={formatMemoryPressure(
                          tableData.table_memory_pressure_level,
                        )}
                        issue={healthStatus?.fieldIssues.get("memoryPressure")}
                      />
                      <ConfigItem>
                        <Text color="gray2" size="sm">
                          Deduped Rows
                        </Text>
                        <Text color="foreground" weight={500}>
                          {formatRowCount(
                            tableData.dedup_row_count_since_start,
                          )}
                        </Text>
                      </ConfigItem>
                      <ConfigItemWithHealth
                        label="Transaction Size (p90)"
                        value={
                          tableData.wal_tx_size_p90 !== null
                            ? `${tableData.wal_tx_size_p90.toLocaleString()} rows`
                            : "N/A"
                        }
                        issue={healthStatus?.fieldIssues.get("txSizeP90")}
                      />
                      <ConfigItemWithHealth
                        label="Write Amplification (p50)"
                        value={
                          tableData.table_write_amp_p50 !== null
                            ? `${tableData.table_write_amp_p50.toFixed(2)}x`
                            : "N/A"
                        }
                        issue={healthStatus?.fieldIssues.get("writeAmp")}
                      />
                      <ConfigItemWithHealth
                        label="Merge Rate (p99)"
                        value={
                          tableData.table_merge_rate_p99 !== null
                            ? `${tableData.table_merge_rate_p99.toLocaleString()} rows/s`
                            : "N/A"
                        }
                        issue={healthStatus?.fieldIssues.get("mergeRate")}
                      />
                    </TwoColumnGrid>
                  )}
                </>
              )}

              {/* WAL enabled but SUSPENDED - not expandable, show status + resume button */}
              {tableData.walEnabled && tableData.table_suspended && (
                <>
                  <SectionTitleContainer>
                    <RowsPlusBottomIcon size="16px" />
                    <SectionTitle>Ingestion</SectionTitle>
                  </SectionTitleContainer>
                  <IngestionStatusContainer>
                    <Box gap="0.5rem" align="center">
                      <PauseCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.red}
                      />
                      <Text color="red">Write-Ahead Log suspended</Text>
                    </Box>
                    <Button
                      skin="secondary"
                      prefixIcon={<Restart size={14} />}
                      onClick={() => setSuspensionDialogOpen(true)}
                    >
                      Resume WAL
                    </Button>
                  </IngestionStatusContainer>
                </>
              )}

              {/* WAL disabled - not expandable, just show status */}
              {!tableData.walEnabled && (
                <>
                  <SectionTitleContainer>
                    <RowsPlusBottomIcon size="16px" />
                    <SectionTitle>Ingestion</SectionTitle>
                    {isIngestionActive && (
                      <IngestionIndicator>
                        <PulsingCircle size={10} weight="fill" />
                        <Text color="gray2" size="sm" weight={400}>
                          Ingesting...
                        </Text>
                      </IngestionIndicator>
                    )}
                  </SectionTitleContainer>
                  <IngestionStatusContainer>
                    <Box gap="0.5rem" align="center">
                      <XCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.gray2}
                      />
                      <Text color="gray2">Write-Ahead Log is disabled</Text>
                    </Box>
                  </IngestionStatusContainer>
                </>
              )}
            </Section>

            {/* DDL Section */}
            <Section>
              <SectionTitleContainer>
                <CodeIcon size="16px" weight="bold" />

                <SectionTitle>DDL</SectionTitle>
              </SectionTitleContainer>
              {ddl && <LiteEditor value={ddl} height="200px" />}
            </Section>

            {/* Columns Section */}
            <Section>
              <SectionTitleClickable
                onClick={() => setColumnsExpanded(!columnsExpanded)}
              >
                <SectionTitleContainer>
                  <CaretIcon
                    size={14}
                    weight="bold"
                    $expanded={columnsExpanded}
                  />
                  <TextColumnsIcon
                    size="16px"
                    weight="bold"
                    style={{ transform: "translateY(1px)" }}
                  />

                  <SectionTitle>Columns ({columns.length})</SectionTitle>
                </SectionTitleContainer>
              </SectionTitleClickable>
              {columnsExpanded && (
                <Box gap="0" flexDirection="column" align="stretch">
                  {columns.map((col) => (
                    <SchemaRow key={col.column}>
                      <ColumnNameBox gap="0.5rem" align="center">
                        <ColumnIcon
                          isDesignatedTimestamp={col.designated}
                          type={col.type}
                        />
                        <Text color="foreground" ellipsis>
                          {col.column}
                        </Text>
                      </ColumnNameBox>
                      <ColumnType>{col.type}</ColumnType>
                    </SchemaRow>
                  ))}
                </Box>
              )}
            </Section>
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
