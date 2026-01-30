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
} from "@phosphor-icons/react"
import { SquareWithShadow } from "./HealthStatusLabel"
import { Box, CopyButton, Text, Tooltip } from "../../../components"
import type { Table, MaterializedView } from "../../../utils/questdb/types"
import {
  formatRelativeTimestamp,
  formatMemoryPressure,
  formatRowCount,
} from "./utils"
import {
  ISSUE_DOCS_URLS,
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

export interface MonitoringTabProps {
  tableData: Table
  matViewData: MaterializedView | null
  isMatView: boolean
  healthStatus: HealthStatus | null
  criticalIssues: HealthIssue[]
  performanceWarnings: HealthIssue[]
  isIngestionActive: boolean
  isIngestionDisabled: boolean
  baseTableStatus: "Valid" | "Suspended" | "Dropped" | null
  walExpanded: boolean
  onWalExpandedChange: (expanded: boolean) => void
  onOpenSuspensionDialog: () => void
  onAskAI: (issue: HealthIssue) => void
}

const RowCountIndicatorInner = styled.div<{ $isMatView?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: ${({ theme }) => theme.color.backgroundLighter};
  padding: 1rem 1.5rem;
  border-radius: 0.4rem;
  width: 100%;
  font-size: ${({ theme }) => theme.fontSize.md};
  color: ${({ theme }) => theme.color.foreground};
  ${({ $isMatView }) =>
    $isMatView &&
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
  text-underline-offset: 0.1875rem;
  color: ${({ theme }) => theme.color.gray2};
`

const MetricsGrid = styled.div<{ $isMatView?: boolean }>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
  ${({ $isMatView }) =>
    $isMatView &&
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
  background: ${({ $background, theme }) =>
    $background ?? theme.color.backgroundLighter};
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

const ConfigItem = styled(Box).attrs<{ $background?: string }>({
  flexDirection: "column",
  gap: "0.5rem",
  align: "flex-start",
})<{ $background?: string }>`
  background: ${({ $background }) => $background};
  min-width: 0;
  overflow: hidden;
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
  color: ${({ theme }) => theme.color.green};
`

const TrendValueBox = styled(Box).attrs<{ $background?: string }>({
  gap: "0.4rem",
  align: "center",
  justifyContent: "flex-start",
})<{ $background?: string }>`
  align: center;
  align-self: stretch;
  justify-content: flex-start;
  border-radius: 0.4rem;
  background: ${({ $background }) => $background};
  padding: 0.8rem 0.6rem;
`

const TrendBadge = styled.span<{ $direction: "increasing" | "decreasing" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
`

const TrendValueText = styled(Text)<{ $color?: string }>`
  color: ${({ $color, theme }) => $color ?? theme.color.gray2};
`

const DisabledOverlay = styled.div<{ $disabled: boolean }>`
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
  transition: opacity 150ms ease;
`

const StyledCopyButton = styled(CopyButton).attrs({
  iconOnly: true,
  size: "sm",
})`
  margin-left: auto;
  background: transparent;
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

const getTrendAssets = (
  theme: { color: Record<string, string> },
  direction?: TrendDirection,
): { color: string; background: string; icon: React.ReactNode | null } => {
  if (direction === "increasing") {
    return {
      color: theme.color.orange,
      background: `${theme.color.orange}20`,
      icon: <TrendUpIcon size={16} color={theme.color.orange} />,
    }
  }
  if (direction === "decreasing") {
    return {
      color: theme.color.green,
      background: `${theme.color.green}20`,
      icon: <TrendDownIcon size={16} color={theme.color.green} />,
    }
  }
  return {
    color: theme.color.foreground,
    background: theme.color.background,
    icon: null,
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
  showTrend,
  trend,
}: {
  label: string
  value: React.ReactNode
  issue?: HealthIssue
  showTrend?: boolean
  trend?: TrendIndicator
}) => {
  const theme = useTheme()
  const trendAssets = showTrend
    ? getTrendAssets(theme, trend?.direction ?? "stable")
    : undefined

  const iconColor = issue ? getSeverityColor(theme, issue.severity) : undefined

  const trendValue = (
    <TrendValueBox
      $background={showTrend ? trendAssets?.background : undefined}
    >
      <TrendValueText $color={trendAssets?.color}>{value}</TrendValueText>
      {showTrend && trend && (
        <TrendBadge $direction={trend.direction as "increasing" | "decreasing"}>
          {trendAssets?.icon}
          <RateText
            color={trend.direction === "increasing" ? "orange" : "green"}
            size="xs"
          >
            {trend.rate > 0 ? "+" : "-"}
            {formatRate(trend.rate, trend.field)}
          </RateText>
        </TrendBadge>
      )}
    </TrendValueBox>
  )

  return (
    <ConfigItem>
      <Box gap="0.5rem" align="center">
        <Text color="gray2" size="sm">
          {label}
        </Text>
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
      ) : (
        <Box>
          <Text color="foreground">{value}</Text>
        </Box>
      )}
    </ConfigItem>
  )
}

export const MonitoringTab = ({
  tableData,
  matViewData,
  isMatView,
  healthStatus,
  criticalIssues,
  performanceWarnings,
  isIngestionActive,
  isIngestionDisabled,
  baseTableStatus,
  walExpanded,
  onWalExpandedChange,
  onOpenSuspensionDialog,
  onAskAI,
}: MonitoringTabProps) => {
  const theme = useTheme()
  const lastWriteTimestamp = tableData.table_last_write_timestamp
    ? new Date(tableData.table_last_write_timestamp).toISOString()
    : null

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
                  issue.field === "viewStatus" &&
                  matViewData?.invalidation_reason
                    ? matViewData.invalidation_reason
                    : undefined
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
        <RowCountIndicatorInner $isMatView={isMatView}>
          <RowCountBold>
            {formatRowCount(tableData.table_row_count)}
          </RowCountBold>
          rows
          {lastWriteTimestamp && (
            <Box gap="0.5rem" color="gray2">
              <Text color="gray2">{"(updated "}</Text>
              <Tooltip
                content={
                  <Box gap="1rem" align="center">
                    {lastWriteTimestamp}
                    <StyledCopyButton text={lastWriteTimestamp} />
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

      {/* Matview Status Section */}
      {isMatView && matViewData && (
        <Section $squishTop>
          <MetricsGrid $isMatView={isMatView}>
            <MetricCard>
              <MetricLabel>View Status</MetricLabel>
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
                ) : (
                  <>
                    <XSquareIcon
                      size={16}
                      weight="fill"
                      color={theme.color.red}
                    />
                    <Text color="red">Invalid</Text>
                  </>
                )}
              </Box>
            </MetricCard>

            <MetricCard>
              <MetricLabel>Base Table Status</MetricLabel>
              <MetricValue>
                <Box gap="0.5rem" align="center">
                  {baseTableStatus === "Valid" && (
                    <>
                      <CheckCircleIcon
                        size={16}
                        weight="fill"
                        color={theme.color.green}
                      />
                      <Text color="green">Valid</Text>
                    </>
                  )}
                  {baseTableStatus === "Suspended" ||
                    (baseTableStatus === "Dropped" && (
                      <>
                        <XSquareIcon
                          size={16}
                          weight="fill"
                          color={theme.color.red}
                        />
                        <Text color="red">{baseTableStatus}</Text>
                      </>
                    ))}
                </Box>
              </MetricValue>
            </MetricCard>
          </MetricsGrid>
        </Section>
      )}

      <Section>
        {tableData.walEnabled && (
          <>
            <SectionTitleClickable
              onClick={() => onWalExpandedChange(!walExpanded)}
            >
              <SectionTitleContainer>
                <CaretIcon size={14} weight="bold" $expanded={walExpanded} />
                <RowsPlusBottomIcon size="16px" />
                <SectionTitle>Ingestion</SectionTitle>
                {isIngestionActive && (
                  <IngestionIndicator>
                    <PulsingSquare />
                    <Text color="gray2" size="sm" weight={400}>
                      Ingesting...
                    </Text>
                  </IngestionIndicator>
                )}
              </SectionTitleContainer>
            </SectionTitleClickable>
            {walExpanded && (
              <DisabledOverlay $disabled={isIngestionDisabled}>
                <TwoColumnGrid>
                  <ConfigItemWithHealth
                    label="Pending Rows"
                    value={formatRowCount(tableData.wal_pending_row_count)}
                    issue={healthStatus?.fieldIssues.get("pendingRows")}
                    showTrend
                    trend={healthStatus?.trendIndicators.get("pendingRows")}
                  />
                  <ConfigItemWithHealth
                    label="Transaction Lag"
                    value={
                      tableData.wal_txn !== null || tableData.table_txn !== null
                        ? `${(tableData.wal_txn ?? 0) - (tableData.table_txn ?? 0)} txn${(tableData.wal_txn ?? 0) - (tableData.table_txn ?? 0) === 1 ? "" : "s"}`
                        : "N/A"
                    }
                    issue={healthStatus?.fieldIssues.get("transactionLag")}
                    showTrend
                    trend={healthStatus?.trendIndicators.get("transactionLag")}
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
                        tableData.wal_dedup_row_count_since_start,
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
