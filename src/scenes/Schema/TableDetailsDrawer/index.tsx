import React, { useContext, useEffect, useState, useCallback } from "react"
import { useSelector, useDispatch } from "react-redux"
import styled, { useTheme } from "styled-components"
import { selectors, actions } from "../../../store"
import {
  CaretRightIcon,
  CheckCircleIcon,
  PauseCircleIcon,
  XCircleIcon,
  FileTextIcon,
  DatabaseIcon,
  GearIcon,
  CodeIcon,
  TextColumnsIcon,
  ChartBarIcon,
} from "@phosphor-icons/react"
import { Drawer, Box, Text } from "../../../components"
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
  formatO3MaxLag,
  formatMemoryPressure,
  formatRowCount,
  formatTTL,
  getMetricKey,
  METRIC_OPTIONS,
  type MetricType,
} from "./utils"
import { Select } from "../../../components/Select"
import { TableIcon } from "../table-icon"
import { ColumnIcon } from "../Row"

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
  background: ${({ theme }) => theme.color.selection};
  color: ${({ theme }) => theme.color.foreground};
  padding: 0.3rem 0.8rem;
  border-radius: 4px;
  font-size: 1.1rem;
  font-weight: 500;
  flex-shrink: 0;
  text-wrap: nowrap;
`

const Section = styled(Box).attrs({
  flexDirection: "column",
  gap: "2rem",
  align: "stretch",
})`
  padding: 2rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.backgroundLighter};
  width: 100%;
`

const TopSection = styled(Box).attrs({
  flexDirection: "column",
  align: "stretch",
})`
  padding: 2rem 1rem 0 1rem;
  border: 0;
  width: 100%;
`

const SectionTitleContainer = styled(Box).attrs({
  gap: "0.5rem",
  align: "center",
})`
  width: fit-content;
`

const SectionTitle = styled(Text).attrs({
  color: "foreground",
  size: "md",
  weight: 600,
})``

const StatusBadge = styled(Badge)`
  padding: 0.3rem 0.6rem;
  height: auto;
  font-size: 1.1rem;
  margin-left: 1rem;
`

const SectionTitleClickable = styled(SectionTitle)`
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
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

const MetricLabel = styled(Text).attrs({
  color: "gray2",
  size: "xs",
})`
  letter-spacing: 0.03em;
`

const MetricValue = styled(Text).attrs({
  color: "foreground",
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.4rem;
`

const TwoColumnGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
`

const ThreeColumnGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
`

const ConfigItem = styled(Box).attrs({
  flexDirection: "column",
  gap: "0.3rem",
  align: "flex-start",
})`
  min-width: 0;
  overflow: hidden;
`

const BreakableText = styled(Text)`
  word-break: break-all;
`

const ColumnNameBox = styled(Box)`
  min-width: 0;
  flex: 1;
`

const EllipsisText = styled(Text)`
  max-width: 100%;
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

const SelectContainer = styled.div`
  margin-left: auto;
  height: 2rem;

  svg {
    width: 24px;
    height: 24px;
  }
`

const LoadingContainer = styled(Box).attrs({
  align: "center",
  justifyContent: "center",
})`
  padding: 4rem;
  height: 100%;
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

  const { quest } = useContext(QuestContext)
  const theme = useTheme()
  const [tableData, setTableData] = useState<Table | null>(null)
  const [matViewData, setMatViewData] = useState<MaterializedView | null>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [ddl, setDdl] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [columnsExpanded, setColumnsExpanded] = useState(false)
  const [statisticsExpanded, setStatisticsExpanded] = useState(false)
  const [metricType, setMetricType] = useState<MetricType>("p50")

  const fetchTableData = useCallback(async () => {
    try {
      const escapedName = tableName.replace(/'/g, "''")
      const response = await quest.query<Table>(
        `tables() WHERE table_name = '${escapedName}'`,
      )
      if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
        setTableData(response.data[0])
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
      void fetchAllData()
    } else {
      setColumnsExpanded(false)
      setStatisticsExpanded(false)
      setMetricType("p50")
    }
  }, [isOpen, fetchAllData])

  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      void fetchTableData()
      void fetchMatViewData()
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, fetchTableData, fetchMatViewData])

  if (!target) return null

  return (
    <Drawer
      mode="side"
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      withCloseButton
      title={
        <Box gap="1rem" align="center">
          {tableData && (
            <TableIcon
              walEnabled={tableData.walEnabled}
              partitionBy={tableData.partitionBy}
              designatedTimestamp={tableData.designatedTimestamp}
              isMaterializedView={isMatView}
              size="16px"
            />
          )}
          <TableName>{tableName}</TableName>
          <TypeBadge>{isMatView ? "Materialized View" : "Table"}</TypeBadge>
        </Box>
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
              <MetricsGrid>
                <MetricCard>
                  <MetricLabel>Rows</MetricLabel>
                  <MetricValue>
                    {formatRowCount(tableData.table_row_count)}
                  </MetricValue>
                </MetricCard>

                {isMatView && matViewData ? (
                  <MetricCard>
                    <MetricLabel>Last Refresh</MetricLabel>
                    <MetricValue>
                      {formatRelativeTimestamp(
                        matViewData.last_refresh_finish_timestamp,
                      )}
                    </MetricValue>
                  </MetricCard>
                ) : (
                  <MetricCard>
                    <MetricLabel>Last Update</MetricLabel>
                    <MetricValue>
                      {formatRelativeTimestamp(tableData.table_max_timestamp)}
                    </MetricValue>
                  </MetricCard>
                )}
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
              </MetricsGrid>
            </TopSection>
            {isMatView && matViewData && (
              <Section>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    Base Table
                  </Text>
                  <Text color="foreground" weight={500}>
                    {matViewData.base_table_name}
                  </Text>
                </ConfigItem>
              </Section>
            )}

            {/* Storage Section */}
            <Section>
              <SectionTitleContainer>
                <DatabaseIcon size="16px" weight="bold" />

                <SectionTitle>Storage</SectionTitle>
              </SectionTitleContainer>
              <ThreeColumnGrid>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    Partitioning
                  </Text>
                  <Text color="foreground" weight={500}>
                    {tableData.partitionBy === "NONE"
                      ? "None"
                      : `By ${tableData.partitionBy.toLowerCase()}`}
                  </Text>
                </ConfigItem>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    TTL
                  </Text>
                  <Text color="foreground" weight={500}>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </Text>
                </ConfigItem>
                <ConfigItem>
                  <Box gap="0.5rem" align="center">
                    <Text color="gray2" size="xs">
                      Directory
                    </Text>
                    {tableData.directoryName?.endsWith("(->)") && (
                      <StatusBadge type={BadgeType.INFO}>Symlink</StatusBadge>
                    )}
                  </Box>
                  <BreakableText color="foreground" weight={500}>
                    {tableData.directoryName
                      ? tableData.directoryName.replace("(->)", "").trim()
                      : "N/A"}
                  </BreakableText>
                </ConfigItem>
              </ThreeColumnGrid>
            </Section>

            {/* WAL Section */}
            <Section>
              <SectionTitleContainer>
                <FileTextIcon size="16px" weight="bold" />
                <SectionTitle>WAL</SectionTitle>
                {tableData.walEnabled ? (
                  <StatusBadge
                    icon={
                      tableData.table_suspended ? (
                        <PauseCircleIcon weight="fill" size="14px" />
                      ) : (
                        <CheckCircleIcon weight="fill" size="14px" />
                      )
                    }
                    type={
                      tableData.table_suspended
                        ? BadgeType.ERROR
                        : BadgeType.SUCCESS
                    }
                  >
                    {tableData.table_suspended ? "Suspended" : "Active"}
                  </StatusBadge>
                ) : (
                  <StatusBadge
                    icon={<XCircleIcon weight="fill" size="14px" />}
                    type={BadgeType.DISABLED}
                  >
                    Disabled
                  </StatusBadge>
                )}
              </SectionTitleContainer>
              {tableData.walEnabled && (
                <TwoColumnGrid>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      Pending Rows
                    </Text>
                    <Text color="foreground" weight={500}>
                      {formatRowCount(tableData.wal_pending_row_count)}
                    </Text>
                  </ConfigItem>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      Transaction Lag
                    </Text>
                    <Text color="foreground" weight={500}>
                      {tableData.wal_txn !== null &&
                      tableData.table_txn !== null
                        ? `${tableData.wal_txn - tableData.table_txn} txn${tableData.wal_txn - tableData.table_txn === 1 ? "" : "s"}`
                        : "N/A"}
                    </Text>
                  </ConfigItem>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      WAL Transaction Number
                    </Text>
                    <Text color="foreground" weight={500}>
                      {tableData.wal_txn !== null
                        ? tableData.wal_txn.toLocaleString()
                        : "N/A"}
                    </Text>
                  </ConfigItem>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      Last WAL Update
                    </Text>
                    <Text color="foreground" weight={500}>
                      {formatRelativeTimestamp(tableData.wal_max_timestamp)}
                    </Text>
                  </ConfigItem>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      Memory Pressure
                    </Text>
                    <Text color="foreground" weight={500}>
                      {formatMemoryPressure(
                        tableData.table_memory_pressure_level,
                      )}
                    </Text>
                  </ConfigItem>
                  <ConfigItem>
                    <Text color="gray2" size="xs">
                      Deduped Rows
                    </Text>
                    <Text color="foreground" weight={500}>
                      {formatRowCount(tableData.dedup_row_count_since_start)}
                    </Text>
                  </ConfigItem>
                </TwoColumnGrid>
              )}
            </Section>

            {/* Configuration Section */}
            <Section>
              <SectionTitleContainer>
                <GearIcon size="16px" weight="bold" />
                <SectionTitle>Configuration</SectionTitle>
              </SectionTitleContainer>
              <TwoColumnGrid>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    Max Uncommitted Rows
                  </Text>
                  <Text color="foreground" weight={500}>
                    {tableData.maxUncommittedRows?.toLocaleString() ?? "N/A"}
                  </Text>
                </ConfigItem>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    O3 Max Lag
                  </Text>
                  <Text color="foreground" weight={500}>
                    {formatO3MaxLag(tableData.o3MaxLag)}
                  </Text>
                </ConfigItem>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    Designated Timestamp
                  </Text>
                  <EllipsisText color="foreground" weight={500} ellipsis>
                    {tableData.designatedTimestamp || "None"}
                  </EllipsisText>
                </ConfigItem>
                <ConfigItem>
                  <Text color="gray2" size="xs">
                    Deduplication
                  </Text>
                  <Text color="foreground" weight={500}>
                    {tableData.dedup ? "Enabled" : "Disabled"}
                  </Text>
                </ConfigItem>
              </TwoColumnGrid>
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
                <div>
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
                </div>
              )}
            </Section>

            {/* Statistics Section */}
            <Section>
              <Box gap="1rem" align="center">
                <SectionTitleClickable
                  onClick={() => setStatisticsExpanded(!statisticsExpanded)}
                >
                  <SectionTitleContainer>
                    <CaretIcon
                      size={14}
                      weight="bold"
                      $expanded={statisticsExpanded}
                    />
                    <ChartBarIcon size="16px" weight="bold" />
                    Statistics
                  </SectionTitleContainer>
                </SectionTitleClickable>
                {statisticsExpanded && (
                  <SelectContainer onClick={(e) => e.stopPropagation()}>
                    <Select
                      style={{
                        lineHeight: "1.5",
                        fontSize: "1.2rem",
                        height: "25px",
                      }}
                      name="metricType"
                      options={METRIC_OPTIONS}
                      value={metricType}
                      onChange={(e) =>
                        setMetricType(e.target.value as MetricType)
                      }
                    />
                  </SelectContainer>
                )}
              </Box>

              {statisticsExpanded && (
                <>
                  <TwoColumnGrid>
                    <ConfigItem>
                      <Text color="gray2" size="xs">
                        Write Amplification
                      </Text>
                      <Text color="foreground" weight={500}>
                        {formatRowCount(
                          tableData[
                            getMetricKey(
                              "table_write_amp",
                              metricType,
                            ) as keyof Table
                          ] as number | null,
                        )}
                      </Text>
                    </ConfigItem>
                    <ConfigItem>
                      <Text color="gray2" size="xs">
                        Merge Rate
                      </Text>
                      <Text color="foreground" weight={500}>
                        {formatRowCount(
                          tableData[
                            getMetricKey(
                              "table_merge_rate",
                              metricType,
                            ) as keyof Table
                          ] as number | null,
                        )}
                      </Text>
                    </ConfigItem>
                    {tableData.walEnabled && metricType !== "count" && (
                      <ConfigItem>
                        <Text color="gray2" size="xs">
                          WAL TX Size
                        </Text>
                        <Text color="foreground" weight={500}>
                          {formatRowCount(
                            tableData[
                              getMetricKey(
                                "wal_tx_size",
                                metricType,
                              ) as keyof Table
                            ] as number | null,
                          )}
                        </Text>
                      </ConfigItem>
                    )}
                  </TwoColumnGrid>
                </>
              )}
            </Section>
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
