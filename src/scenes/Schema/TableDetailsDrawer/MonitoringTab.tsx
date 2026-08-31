import React from "react"
import styled, { css, useTheme, keyframes } from "styled-components"
import {
  CheckCircleIcon,
  XCircleIcon,
  WarningIcon,
  RowsPlusBottomIcon,
  XSquareIcon,
  TrendUpIcon,
  TrendDownIcon,
  InfoIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  TimerIcon,
  MemoryIcon,
} from "@phosphor-icons/react"
import { SquareWithShadow } from "./HealthStatusLabel"
import { Badge, Box, CopyButton, Text, Tooltip } from "../../../components"
import { type Table } from "../../../utils/questdb/types"
import type { TableKindData } from "./types"
import {
  formatRelativeTimestamp,
  formatMemoryPressure,
  formatRowCount,
  formatMicrosDuration,
  formatBytes,
  formatTxnCount,
} from "./utils"
import {
  ISSUE_DOCS_URLS,
  getLiveViewIssueGuidance,
  type HealthStatus,
  type HealthSeverity,
  type HealthIssue,
  type TrendIndicator,
  type TrendDirection,
} from "./healthCheck"
import { ErrorBanner } from "./ErrorBanner"
import { PerformanceAlerts } from "./PerformanceAlerts"
import {
  Section,
  SectionTitle,
  SectionTitleClickable,
  SectionTitleContainer,
  CaretIcon,
} from "./shared-styles"

const BIGINT_ZERO = BigInt(0)

export interface MonitoringTabProps {
  tableData: Table
  kindData: TableKindData
  isLiveViewLoadFailure: boolean
  healthStatus: HealthStatus | null
  criticalIssues: HealthIssue[]
  performanceWarnings: HealthIssue[]
  isIngestionActive: boolean
  isIngestionDisabled: boolean
  baseTableName: string | undefined
  baseTableStatus: "Valid" | "Suspended" | "Dropped" | null
  walExpanded: boolean
  onWalExpandedChange: (expanded: boolean) => void
  onOpenSuspensionDialog: () => void
  onAskAI: (issue: HealthIssue) => void
}

const RowCountIndicatorInner = styled.div<{ $attachedToStatus?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: ${({ theme }) => theme.color.surfaceValue};
  padding: 1rem 1.5rem;
  border-radius: 0.4rem;
  width: 100%;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.color.contentPrimary};
  ${({ $attachedToStatus }) =>
    $attachedToStatus &&
    css`
      border-bottom-left-radius: 0 !important;
      border-bottom-right-radius: 0 !important;
    `}
`

const RowCountBold = styled.span`
  font-weight: 600;
`

const TimestampUnderline = styled.span`
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const MetricsGrid = styled.div<{ $attachedToRowCount?: boolean }>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
  ${({ $attachedToRowCount }) =>
    $attachedToRowCount &&
    css`
      border-top-left-radius: 0 !important;
      border-top-right-radius: 0 !important;
    `}
`

const MetricCard = styled(Box).attrs<{ $background?: string }>({
  flexDirection: "column",
  gap: "0.3rem",
  align: "flex-start",
  justifyContent: "space-between",
})<{ $background?: string }>`
  padding: 1rem 1.5rem;
  background: ${({ theme }) => theme.color.surfaceValue};
`

const MetricLabel = styled(Text).attrs({
  color: "contentSecondary",
  size: "sm",
})``

const MetricValue = styled(Text).attrs({
  color: "contentPrimary",
  size: "md",
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ConfigGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, 1fr);
  gap: 1rem;
  padding: 0 1rem;
`

const ConfigItem = styled(Box).attrs<{
  $background?: string
  $fullWidth?: boolean
}>({
  flexDirection: "column",
  gap: "0.5rem",
  align: "flex-start",
})<{ $background?: string; $fullWidth?: boolean }>`
  background: ${({ $background }) => $background};
  min-width: 0;
  overflow: hidden;
  ${({ $fullWidth }) =>
    $fullWidth &&
    css`
      grid-column: 1 / -1;
    `}
`

const RateText = styled(Text)`
  transform: translateY(1px);
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

const PulsingSquare = styled(SquareWithShadow).attrs({
  width: "12px",
  height: "12px",
})`
  animation: ${pulseColor} 1.5s ease-in-out infinite;
  color: ${({ theme }) => theme.color.statusSuccess};
`

const TrendValueBox = styled(Box).attrs<{ $background?: string }>({
  gap: "0.4rem",
  align: "center",
  justifyContent: "space-between",
})<{ $background?: string }>`
  align-self: stretch;
  width: 100%;
  justify-content: space-between;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.surfaceValue};
  padding: 0.8rem 0.6rem;
`

const TrendBadge = styled(Badge)`
  flex-shrink: 0;
`

const TrendValueText = styled(Text)<{ $color?: string }>`
  min-width: 0;
  color: ${({ $color, theme }) => $color ?? theme.color.contentSecondary};
`

const DisabledOverlay = styled.div<{ $disabled: boolean }>`
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
  transition: opacity 150ms ease;
`

const getSeverityColor = (
  theme: { color: Record<string, string> },
  severity: HealthSeverity | undefined,
): string => {
  switch (severity) {
    case "critical":
      return theme.color.statusDanger
    case "warning":
      return theme.color.statusWarning
    case "recovering":
      return theme.color.statusSuccess
    default:
      return theme.color.contentPrimary
  }
}

export const HELPER_TEXT = {
  pendingRows: (
    <>
      <Text color="contentSecondary">
        Rows waiting in WAL to be written to table storage. Unbounded growth
        risks disk full or OOM errors, causing table suspension.
      </Text>
      <br />
      <br />
      <Box gap="0.5rem" align="center">
        <ArrowUpRightIcon size={16} />
        <Text color="contentSecondary">
          Increasing = Writer can&apos;t keep up with ingestion rate
        </Text>
      </Box>
      <Box gap="0.5rem" align="center">
        <ArrowDownRightIcon size={16} />
        <Text color="contentSecondary">Decreasing = Backlog is clearing</Text>
      </Box>
      <Box gap="0.5rem" align="center">
        <ArrowRightIcon size={16} />
        <Text color="contentSecondary">
          Stable = Writer is keeping pace with ingestion
        </Text>
      </Box>
    </>
  ),
  liveViewLag: (
    <Text color="contentSecondary">
      Base-table transactions the view has not yet applied and flushed. This
      normally rises between flushes and drops when a flush completes.
    </Text>
  ),
  liveViewSinceLastFlush: (
    <>
      <Text color="contentSecondary">
        Time since the last successful flush. This measures flush activity, not
        data staleness; it keeps growing while the base table is idle.
      </Text>
    </>
  ),
  liveViewInMemory: (
    <>
      <Text color="contentSecondary">
        Rows in Memory is the live row count of the in-memory tier and drops as
        rows age out. Memory Footprint is a peak high-water mark that does not
        shrink after a burst.
      </Text>
    </>
  ),
  liveViewDroppedRows: (
    <>
      <Text color="contentSecondary">
        Rows the START FROM boundary excluded from the view, split into in-order
        and out-of-order arrivals. Counters reset on restart.
      </Text>
    </>
  ),
  transactionLag: (
    <>
      <Text color="contentSecondary">
        Transactions committed to WAL but not yet applied to table storage. Data
        in pending transactions is not visible to queries.
      </Text>
      <br />
      <br />
      <Box gap="0.5rem" align="center">
        <ArrowUpRightIcon size={16} />
        <Text color="contentSecondary">
          Increasing = Ingestion exceeds apply rate
        </Text>
      </Box>
      <Box gap="0.5rem" align="center">
        <ArrowDownRightIcon size={16} />
        <Text color="contentSecondary">Decreasing = Backlog is clearing</Text>
      </Box>
      <Box gap="0.5rem" align="center">
        <ArrowRightIcon size={16} />
        <Text color="contentSecondary">
          Stable = Apply rate is keeping pace with ingestion
        </Text>
      </Box>
    </>
  ),
}

const getTrendAssets = (
  theme: { color: Record<string, string> },
  direction?: TrendDirection,
): { color: string; background: string; icon: React.ReactNode | null } => {
  if (direction === "increasing") {
    return {
      color: theme.color.statusWarning,
      background: `${theme.color.statusWarning}20`,
      icon: <TrendUpIcon size={16} color={theme.color.statusWarning} />,
    }
  }
  if (direction === "decreasing") {
    return {
      color: theme.color.statusSuccess,
      background: `${theme.color.statusSuccess}20`,
      icon: <TrendDownIcon size={16} color={theme.color.statusSuccess} />,
    }
  }
  return {
    color: theme.color.contentPrimary,
    background: theme.color.surfaceRaised,
    icon: null,
  }
}

const formatRateMagnitude = (absRate: number): string => {
  if (absRate >= 1_000_000_000_000) {
    return `${(absRate / 1_000_000_000_000).toFixed(1)}T`
  }
  if (absRate >= 1_000_000_000) {
    return `${(absRate / 1_000_000_000).toFixed(1)}B`
  }
  if (absRate >= 1_000_000) {
    return `${(absRate / 1_000_000).toFixed(1)}M`
  }
  if (absRate >= 1_000) {
    return `${(absRate / 1_000).toFixed(1)}K`
  }
  return `${Math.round(absRate)}`
}

const formatRate = (rate: number, field: string): string => {
  const unit = field === "transactionLag" ? "transactions/s" : "rows/s"
  const magnitude = formatRateMagnitude(Math.abs(rate))
  const sign = magnitude === "0" ? "" : rate > 0 ? "+" : "-"
  return `${sign}${magnitude} ${unit}`
}

const LIVE_VIEW_FAILURE_STATUS_LABELS: Record<string, string> = {
  invalid: "Invalid",
  version_unsupported: "Version unsupported",
  state_unreadable: "State unreadable",
}

const ConfigItemWithHealth = ({
  label,
  helperText,
  value,
  issue,
  showTrend,
  trend,
  boxedValue,
  fullWidth,
  dataHook,
}: {
  label: string
  helperText?: React.ReactNode
  value: React.ReactNode
  issue?: HealthIssue
  showTrend?: boolean
  trend?: TrendIndicator
  boxedValue?: boolean
  fullWidth?: boolean
  dataHook?: string
}) => {
  const theme = useTheme()
  const trendAssets = showTrend
    ? getTrendAssets(theme, trend?.direction ?? "stable")
    : undefined

  const iconColor = issue ? getSeverityColor(theme, issue.severity) : undefined
  const isWarningTrend = trend?.direction === "increasing"

  const trendValue = (
    <TrendValueBox
      $background={showTrend ? trendAssets?.background : undefined}
      data-hook={dataHook}
      data-trend={trend?.direction}
    >
      <TrendValueText $color={trendAssets?.color}>{value}</TrendValueText>
      {showTrend && trend && (
        <TrendBadge variant={isWarningTrend ? "warning" : "success"} size="sm">
          {trendAssets?.icon}
          <RateText
            color={isWarningTrend ? "statusWarning" : "statusSuccess"}
            size="xs"
          >
            {formatRate(trend.rate, trend.field)}
          </RateText>
        </TrendBadge>
      )}
    </TrendValueBox>
  )

  return (
    <ConfigItem $fullWidth={fullWidth}>
      <Box gap="0.5rem" align="center">
        <Text color="contentSecondary" size="sm">
          {label}
        </Text>
        {helperText && (
          <Tooltip content={helperText}>
            <InfoIcon size={12} color={theme.color.contentPrimary} />
          </Tooltip>
        )}
        {issue && <WarningIcon size={12} weight="fill" color={iconColor} />}
      </Box>
      {showTrend ? (
        trend && trend.message ? (
          <Tooltip placement="left" content={trend.message}>
            {trendValue}
          </Tooltip>
        ) : (
          trendValue
        )
      ) : boxedValue ? (
        <TrendValueBox data-hook={dataHook}>
          <TrendValueText $color={theme.color.contentPrimary}>
            {value}
          </TrendValueText>
        </TrendValueBox>
      ) : (
        <Box>
          <Text color="contentPrimary">{value}</Text>
        </Box>
      )}
    </ConfigItem>
  )
}

export const MonitoringTab = ({
  tableData,
  kindData,
  isLiveViewLoadFailure,
  healthStatus,
  criticalIssues,
  performanceWarnings,
  isIngestionActive,
  isIngestionDisabled,
  baseTableName,
  baseTableStatus,
  walExpanded,
  onWalExpandedChange,
  onOpenSuspensionDialog,
  onAskAI,
}: MonitoringTabProps) => {
  const theme = useTheme()
  const matView = kindData.kind === "matview" ? kindData.matView : null
  const liveView = kindData.kind === "liveview" ? kindData.liveView : null
  const lastWriteTimestamp = (() => {
    if (!tableData.table_last_write_timestamp) return null
    const date = new Date(tableData.table_last_write_timestamp)
    if (isNaN(date.getTime()) || date.getTime() === 0) return null
    return date.toISOString()
  })()
  const hasStatusSection = matView !== null || liveView !== null
  const hasLiveViewDroppedRows =
    liveView !== null &&
    ((liveView.below_lower_bound_count ?? BIGINT_ZERO) > BIGINT_ZERO ||
      (liveView.o3_rejected_count ?? BIGINT_ZERO) > BIGINT_ZERO)
  return (
    <>
      {/* Critical Error Banners */}
      {criticalIssues.length > 0 && (
        <Section>
          <Box flexDirection="column" gap="1rem" align="stretch">
            {criticalIssues.map((issue) => (
              <ErrorBanner
                key={issue.id}
                title={issue.message}
                description={
                  getLiveViewIssueGuidance(issue.id) ??
                  (issue.field === "viewStatus" && matView?.invalidation_reason
                    ? matView.invalidation_reason
                    : undefined)
                }
                showResumeButton={issue.field === "walStatus"}
                onResume={
                  issue.field === "walStatus"
                    ? () => onOpenSuspensionDialog()
                    : undefined
                }
                onAskAI={() => onAskAI(issue)}
                docsUrl={ISSUE_DOCS_URLS[issue.id]}
              />
            ))}
          </Box>
        </Section>
      )}

      {/* Row Count Indicator */}
      <Section $squishBottom>
        <RowCountIndicatorInner
          $attachedToStatus={hasStatusSection}
          data-hook="table-details-row-count"
        >
          <RowCountBold data-hook="table-details-row-count-value">
            {formatRowCount(tableData.table_row_count)}
          </RowCountBold>
          rows
          {lastWriteTimestamp && (
            <Box gap="0.5rem" color="contentSecondary">
              <Text color="contentSecondary">{"(updated "}</Text>
              <Tooltip
                content={
                  <Box gap="1rem" align="center">
                    {lastWriteTimestamp}
                    <CopyButton text={lastWriteTimestamp} iconOnly size="sm" />
                  </Box>
                }
                placement="bottom"
              >
                <TimestampUnderline>
                  {formatRelativeTimestamp(
                    tableData.table_last_write_timestamp,
                  ) + ")"}
                </TimestampUnderline>
              </Tooltip>
            </Box>
          )}
        </RowCountIndicatorInner>
      </Section>

      {/* View Status Section (matview and live view) */}
      {hasStatusSection && (
        <Section $squishTop>
          <MetricsGrid $attachedToRowCount>
            <MetricCard data-hook="table-details-view-status">
              <MetricLabel>View Status</MetricLabel>
              <Box gap="0.5rem" align="center">
                {matView ? (
                  matView.view_status === "valid" ? (
                    <>
                      <CheckCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusSuccess}
                      />
                      <Text color="statusSuccess">Valid</Text>
                    </>
                  ) : matView.view_status === "refreshing" ? (
                    <MetricValue>Refreshing</MetricValue>
                  ) : (
                    <>
                      <XSquareIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusDanger}
                      />
                      <Text color="statusDanger">Invalid</Text>
                    </>
                  )
                ) : liveView ? (
                  liveView.view_status === "active" ? (
                    <>
                      <CheckCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusSuccess}
                      />
                      <Text color="statusSuccess">Active</Text>
                    </>
                  ) : liveView.view_status === "invalid" ||
                    liveView.view_status === "version_unsupported" ||
                    liveView.view_status === "state_unreadable" ? (
                    <>
                      <XSquareIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusDanger}
                      />
                      <Text color="statusDanger">
                        {LIVE_VIEW_FAILURE_STATUS_LABELS[liveView.view_status]}
                      </Text>
                    </>
                  ) : (
                    <MetricValue>
                      {liveView.view_status.charAt(0).toUpperCase() +
                        liveView.view_status.slice(1)}
                    </MetricValue>
                  )
                ) : null}
              </Box>
            </MetricCard>

            <MetricCard data-hook="table-details-base-table-status">
              <MetricLabel>Base Table Status</MetricLabel>
              <MetricValue>
                <Box gap="0.5rem" align="center">
                  {!baseTableName || baseTableStatus === null ? (
                    <Text color="contentSecondary">Unknown</Text>
                  ) : baseTableStatus === "Valid" ? (
                    <>
                      <CheckCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusSuccess}
                      />
                      <Text color="statusSuccess">Valid</Text>
                    </>
                  ) : (
                    <>
                      <XSquareIcon
                        size={16}
                        weight="fill"
                        color={theme.color.statusDanger}
                      />
                      <Text color="statusDanger">{baseTableStatus}</Text>
                    </>
                  )}
                </Box>
              </MetricValue>
            </MetricCard>
          </MetricsGrid>
        </Section>
      )}

      {liveView && !isLiveViewLoadFailure && (
        <>
          <Section data-hook="table-details-live-view-freshness">
            <SectionTitleContainer>
              <TimerIcon size="16px" />
              <SectionTitle>Freshness</SectionTitle>
            </SectionTitleContainer>
            <ConfigGrid $columns={3}>
              <ConfigItemWithHealth
                label="Unflushed Transactions"
                helperText={HELPER_TEXT.liveViewLag}
                value={formatTxnCount(liveView.lag_seqtxn)}
                boxedValue
              />
              <ConfigItemWithHealth
                label="Since Last Flush"
                helperText={HELPER_TEXT.liveViewSinceLastFlush}
                value={
                  liveView.lag_micros == null
                    ? "Never"
                    : formatMicrosDuration(liveView.lag_micros)
                }
                boxedValue
              />
              <ConfigItemWithHealth
                label="Writer Stall"
                value={
                  liveView.writer_stall_micros == null
                    ? "Unknown"
                    : formatMicrosDuration(liveView.writer_stall_micros)
                }
                issue={healthStatus?.fieldIssues.get("writerStall")}
                boxedValue
              />
            </ConfigGrid>
          </Section>

          <Section data-hook="table-details-live-view-memory">
            <SectionTitleContainer>
              <MemoryIcon size="16px" />
              <SectionTitle>In-Memory Tier</SectionTitle>
            </SectionTitleContainer>
            <ConfigGrid $columns={2}>
              <ConfigItemWithHealth
                label="Rows in Memory"
                helperText={HELPER_TEXT.liveViewInMemory}
                value={formatRowCount(liveView.in_mem_rows)}
              />
              <ConfigItemWithHealth
                label="Memory Footprint (peak)"
                value={formatBytes(liveView.in_mem_bytes)}
              />
              {hasLiveViewDroppedRows && (
                <ConfigItemWithHealth
                  label="Dropped Below Start From"
                  helperText={HELPER_TEXT.liveViewDroppedRows}
                  value={`${formatRowCount(liveView.below_lower_bound_count)} in-order · ${formatRowCount(liveView.o3_rejected_count)} out-of-order`}
                  fullWidth
                />
              )}
            </ConfigGrid>
          </Section>
        </>
      )}

      <Section>
        {tableData.walEnabled && (
          <>
            <SectionTitleClickable
              onClick={() => onWalExpandedChange(!walExpanded)}
              data-hook="table-details-ingestion-toggle"
            >
              <SectionTitleContainer>
                <CaretIcon size={14} weight="bold" $expanded={walExpanded} />
                <RowsPlusBottomIcon size="16px" />
                <SectionTitle>Ingestion</SectionTitle>
                {isIngestionActive && (
                  <IngestionIndicator data-hook="table-details-ingestion-active">
                    <PulsingSquare />
                    <Text color="contentSecondary" size="sm" weight={400}>
                      Ingesting...
                    </Text>
                  </IngestionIndicator>
                )}
              </SectionTitleContainer>
            </SectionTitleClickable>
            {walExpanded && (
              <DisabledOverlay $disabled={isIngestionDisabled}>
                <ConfigGrid
                  $columns={2}
                  data-hook="table-details-ingestion-content"
                >
                  <ConfigItemWithHealth
                    label="Pending Rows"
                    helperText={HELPER_TEXT.pendingRows}
                    value={formatRowCount(tableData.wal_pending_row_count)}
                    issue={healthStatus?.fieldIssues.get("pendingRows")}
                    showTrend
                    trend={healthStatus?.trendIndicators.get("pendingRows")}
                    dataHook="table-details-pending-rows-trend"
                  />
                  <ConfigItemWithHealth
                    label="Transaction Lag"
                    helperText={HELPER_TEXT.transactionLag}
                    value={(() => {
                      if (
                        tableData.wal_txn == null &&
                        tableData.table_txn == null
                      )
                        return "N/A"
                      const rawLag =
                        (tableData.wal_txn ?? BIGINT_ZERO) -
                        (tableData.table_txn ?? BIGINT_ZERO)
                      const lag = rawLag > BIGINT_ZERO ? rawLag : BIGINT_ZERO
                      return formatTxnCount(lag)
                    })()}
                    issue={healthStatus?.fieldIssues.get("transactionLag")}
                    showTrend
                    trend={healthStatus?.trendIndicators.get("transactionLag")}
                    dataHook="table-details-transaction-lag-trend"
                  />
                  <ConfigItem>
                    <Text color="contentSecondary" size="sm">
                      WAL Transaction Number
                    </Text>
                    <Text color="contentPrimary" weight={500}>
                      {tableData.wal_txn != null
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
                    <Text color="contentSecondary" size="sm">
                      Deduped Rows
                    </Text>
                    <Text color="contentPrimary" weight={500}>
                      {formatRowCount(
                        tableData.wal_dedup_row_count_since_start,
                      )}
                    </Text>
                  </ConfigItem>
                  <ConfigItemWithHealth
                    label="Transaction Size (p90)"
                    value={
                      tableData.wal_tx_size_p90 != null
                        ? `${tableData.wal_tx_size_p90.toLocaleString()} rows`
                        : "N/A"
                    }
                    issue={healthStatus?.fieldIssues.get("txSizeP90")}
                  />
                  <ConfigItemWithHealth
                    label="Write Amplification (p50)"
                    value={
                      tableData.table_write_amp_p50 != null
                        ? `${tableData.table_write_amp_p50.toFixed(2)}x`
                        : "N/A"
                    }
                    issue={healthStatus?.fieldIssues.get("writeAmp")}
                  />
                  <ConfigItemWithHealth
                    label="Merge Rate (p99)"
                    value={
                      tableData.table_merge_rate_p99 != null
                        ? `${tableData.table_merge_rate_p99.toLocaleString()} rows/s`
                        : "N/A"
                    }
                    issue={healthStatus?.fieldIssues.get("mergeRate")}
                  />
                </ConfigGrid>
              </DisabledOverlay>
            )}
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
                  <PulsingSquare />
                  <Text color="contentSecondary" size="sm" weight={400}>
                    Ingesting...
                  </Text>
                </IngestionIndicator>
              )}
            </SectionTitleContainer>
            <IngestionStatusContainer data-hook="table-details-wal-disabled">
              <Box gap="0.5rem" align="center">
                <XCircleIcon
                  size={16}
                  weight="fill"
                  color={theme.color.contentSecondary}
                />
                <Text color="contentSecondary">
                  Write-Ahead Log is disabled
                </Text>
              </Box>
            </IngestionStatusContainer>
          </>
        )}
      </Section>

      {performanceWarnings.length > 0 && (
        <Section>
          <PerformanceAlerts
            warnings={performanceWarnings}
            onAskAI={(warning) => onAskAI(warning)}
          />
        </Section>
      )}
    </>
  )
}
