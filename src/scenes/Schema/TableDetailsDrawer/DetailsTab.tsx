import React from "react"
import styled, { useTheme } from "styled-components"
import {
  CodeIcon,
  TextColumnsIcon,
  ArrowSquareInIcon,
  InfoIcon,
  DatabaseIcon,
  XCircleIcon,
} from "@phosphor-icons/react"
import { Box, Text, CopyButton, TextButton } from "../../../components"
import { LiteEditor } from "../../../components/LiteEditor"
import type { Table, Column, StoragePolicy } from "../../../utils/questdb/types"
import type { BaseTableStatus, SourceState, TableKindData } from "./types"
import {
  formatTTL,
  formatInterval,
  formatUtcTimestamp,
  formatStoragePolicyClauses,
} from "./utils"
import { ColumnIcon } from "../Row"
import {
  Section,
  HorizontalSection,
  SectionTitle,
  SectionTitleClickable,
  SectionTitleContainer,
  CaretIcon,
  UnavailableValue,
} from "./shared-styles"
import { SchemaAIButton } from "./SchemaAIButton"
import { ErrorBanner } from "./ErrorBanner"
import { ISSUE_DOCS_URLS, isLiveViewLoadFailure } from "./healthCheck"
import { useEditor } from "../../../providers"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

export interface DetailsTabProps {
  tableData: Table
  kindData: TableKindData
  columnsState: SourceState<Column[]>
  ddlState: SourceState<string>
  storagePolicyState: SourceState<StoragePolicy | null>
  isEnterprise: boolean
  truncatedDDL: { text: string; grayedOutLines: [number, number] | null }
  baseTableName: string | undefined
  baseTableStatus: BaseTableStatus
  columnsExpanded: boolean
  onColumnsExpandedChange: (expanded: boolean) => void
  onNavigateToBaseTable: () => void
  onExplainWithAI: () => void
  onAskAIForViewIssue: () => void
}

const ColumnNameBox = styled(Box)`
  min-width: 0;
  flex: 1;
`

const ColumnType = styled(Text).attrs({
  color: "contentSecondary",
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
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

const BaseTableLinkButton = styled(TextButton)`
  display: flex;
  align-items: center;
  gap: 0.4rem;
`

const MetricsGrid = styled.div<{ $columns: number }>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
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

const ColumnCopyButtonSlot = styled.span`
  display: inline-flex;
  visibility: hidden;
  margin-right: 0.5rem;

  ${SchemaRow}:hover & {
    visibility: visible;
  }
`

const ButtonsContainer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  margin-left: auto;
`

export const DetailsTab = ({
  tableData,
  kindData,
  columnsState,
  ddlState,
  storagePolicyState,
  isEnterprise,
  truncatedDDL,
  baseTableName,
  baseTableStatus,
  columnsExpanded,
  onColumnsExpandedChange,
  onNavigateToBaseTable,
  onExplainWithAI,
  onAskAIForViewIssue,
}: DetailsTabProps) => {
  const { addBuffer } = useEditor()
  const theme = useTheme()
  const viewState = kindData.kind === "view" ? kindData.view : null
  const matViewState = kindData.kind === "matview" ? kindData.matView : null
  const liveViewState = kindData.kind === "liveview" ? kindData.liveView : null
  const view = viewState?.status === "ready" ? viewState.data : null
  const matView = matViewState?.status === "ready" ? matViewState.data : null
  const liveView = liveViewState?.status === "ready" ? liveViewState.data : null
  const kindSourceUnavailable =
    viewState?.status === "unavailable" ||
    matViewState?.status === "unavailable" ||
    liveViewState?.status === "unavailable"
  const liveViewUnavailable = liveViewState?.status === "unavailable"
  const liveViewDiagnosticsUnavailable =
    liveViewUnavailable || isLiveViewLoadFailure(liveView)
  const matViewUnavailable = matViewState?.status === "unavailable"
  const columns = columnsState.status === "ready" ? columnsState.data : []
  const ddl = ddlState.status === "ready" ? ddlState.data : ""
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"
  const storagePolicy =
    storagePolicyState.status === "ready" ? storagePolicyState.data : null
  const storagePolicyClauses = formatStoragePolicyClauses(storagePolicy)
  const storagePolicyDisabled = storagePolicy?.status === "D"
  const hasStoragePolicy = storagePolicyClauses.length > 0
  const hasTtl = (tableData.ttlValue ?? 0) !== 0
  const showStoragePolicySection = kindData.kind === "table" && isEnterprise
  const showDetailsSection =
    kindData.kind === "table" ||
    kindData.kind === "matview" ||
    liveView !== null ||
    liveViewUnavailable

  return (
    <>
      {(baseTableName ||
        ((kindData.kind === "matview" || kindData.kind === "liveview") &&
          kindSourceUnavailable)) && (
        <HorizontalSection data-hook="table-details-base-table-section">
          <Text color="contentSecondary" size="sm" lineHeight="1.7">
            Base Table
          </Text>
          <BaseTableLinkButton
            disabled={!baseTableName || !baseTableExists}
            onClick={onNavigateToBaseTable}
            data-hook="table-details-base-table-link"
          >
            {kindSourceUnavailable ? (
              <UnavailableValue />
            ) : (
              <Text
                color={baseTableExists ? "contentPrimary" : "contentSecondary"}
              >
                {baseTableName}
              </Text>
            )}
            {baseTableExists && (
              <ArrowSquareInIcon
                weight="bold"
                size={18}
                style={{ transform: "translateY(2px)" }}
              />
            )}
          </BaseTableLinkButton>
        </HorizontalSection>
      )}

      {view?.view_status === "invalid" && (
        <Section>
          <ErrorBanner
            title="View is invalid"
            description={view.invalidation_reason || undefined}
            onAskAI={onAskAIForViewIssue}
            docsUrl={ISSUE_DOCS_URLS["R4"]}
          />
        </Section>
      )}

      {/* DDL Section */}
      <Section data-hook="table-details-ddl-section">
        <SectionTitleContainer>
          <CodeIcon size="16px" weight="bold" />
          <SectionTitle>DDL</SectionTitle>
          <ButtonsContainer>
            <SchemaAIButton
              onClick={onExplainWithAI}
              disabled={ddlState.status !== "ready"}
              disabledTooltip={
                ddlState.status === "loading"
                  ? "DDL is loading"
                  : "DDL is unavailable"
              }
              data-hook="table-details-explain-ai"
            >
              Explain with AI
            </SchemaAIButton>
            <CopyButton
              text={ddl}
              disabled={ddlState.status !== "ready"}
              iconOnly
              size="sm"
              data-hook="table-details-copy-ddl"
              onCopy={() =>
                void trackEvent(ConsoleEvent.TABLE_DETAILS_COPY_DDL)
              }
            />
          </ButtonsContainer>
        </SectionTitleContainer>
        {ddlState.status === "unavailable" ? (
          <UnavailableValue data-hook="table-details-ddl-unavailable" />
        ) : ddl ? (
          <LiteEditor
            value={truncatedDDL.text}
            compactToolbar
            onOpenInEditor={async () => {
              await addBuffer({ value: ddl })
            }}
            grayedOutLines={truncatedDDL.grayedOutLines}
          />
        ) : null}
      </Section>

      {/* Columns Section */}
      {columnsState.status === "unavailable" ? (
        <Section data-hook="table-details-columns-unavailable">
          <SectionTitleContainer>
            <TextColumnsIcon
              size="16px"
              weight="bold"
              style={{ transform: "translateY(1px)" }}
            />
            <SectionTitle>Columns</SectionTitle>
          </SectionTitleContainer>
          <UnavailableValue />
        </Section>
      ) : columnsState.status === "loading" ? (
        <Section>
          <SectionTitleContainer>
            <TextColumnsIcon
              size="16px"
              weight="bold"
              style={{ transform: "translateY(1px)" }}
            />
            <SectionTitle>Columns</SectionTitle>
          </SectionTitleContainer>
          <Text color="contentSecondary">Loading…</Text>
        </Section>
      ) : columns.length === 0 ? (
        <Section style={{ opacity: 0.5 }}>
          <SectionTitleContainer>
            <TextColumnsIcon
              size="16px"
              weight="bold"
              style={{ transform: "translateY(1px)" }}
            />
            <SectionTitle>Columns (0)</SectionTitle>
          </SectionTitleContainer>
        </Section>
      ) : (
        <Section>
          <SectionTitleClickable
            onClick={() => onColumnsExpandedChange(!columnsExpanded)}
            data-hook="table-details-columns-toggle"
          >
            <SectionTitleContainer>
              <CaretIcon size={14} weight="bold" $expanded={columnsExpanded} />
              <TextColumnsIcon
                size="16px"
                weight="bold"
                style={{ transform: "translateY(1px)" }}
              />
              <SectionTitle>Columns ({columns.length})</SectionTitle>
            </SectionTitleContainer>
          </SectionTitleClickable>
          {columnsExpanded && (
            <Box
              gap="0"
              flexDirection="column"
              align="stretch"
              data-hook="table-details-columns-content"
            >
              {columns.map((col) => (
                <SchemaRow
                  key={col.column}
                  data-hook="table-details-column-row"
                >
                  <ColumnNameBox gap="0.5rem" align="center">
                    <ColumnIcon
                      isDesignatedTimestamp={col.designated}
                      type={col.type}
                    />
                    <Text color="contentPrimary" ellipsis>
                      {col.column}
                    </Text>
                    <ColumnCopyButtonSlot>
                      <CopyButton
                        size="sm"
                        text={col.column}
                        iconOnly
                        data-hook="table-details-copy-column-name"
                      />
                    </ColumnCopyButtonSlot>
                  </ColumnNameBox>
                  <ColumnType>{col.type}</ColumnType>
                </SchemaRow>
              ))}
            </Box>
          )}
        </Section>
      )}

      {/* Details Section - layout differs by type and stays hidden for views. */}
      {showDetailsSection && (
        <Section data-hook="table-details-details-section">
          <SectionTitleContainer>
            <InfoIcon size="16px" weight="bold" />
            <SectionTitle>Details</SectionTitle>
          </SectionTitleContainer>

          {liveView || liveViewUnavailable ? (
            /* Live view: 4 cards (2×2). TTL, dedup and refresh type do not apply. */
            <MetricsGrid $columns={2}>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-flush-every-card"
              >
                <MetricLabel>Flush Every</MetricLabel>
                <MetricValue>
                  {liveViewDiagnosticsUnavailable ? (
                    <UnavailableValue />
                  ) : (
                    formatInterval(
                      liveView?.flush_every_interval ?? null,
                      liveView?.flush_every_interval_unit ?? null,
                    )
                  )}
                </MetricValue>
              </MetricCard>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-in-memory-card"
              >
                <MetricLabel>In Memory</MetricLabel>
                <MetricValue>
                  {liveViewDiagnosticsUnavailable ? (
                    <UnavailableValue />
                  ) : (
                    formatInterval(
                      liveView?.in_memory_interval ?? null,
                      liveView?.in_memory_interval_unit ?? null,
                    )
                  )}
                </MetricValue>
              </MetricCard>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-start-from-card"
              >
                <MetricLabel>Start From</MetricLabel>
                <MetricValue>
                  {liveViewDiagnosticsUnavailable ? (
                    <UnavailableValue />
                  ) : liveView?.view_lower_bound_timestamp ? (
                    formatUtcTimestamp(liveView.view_lower_bound_timestamp)
                  ) : (
                    "Beginning"
                  )}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Partitioning</MetricLabel>
                <MetricValue>
                  {tableData.partitionBy === "NONE"
                    ? "None"
                    : tableData.partitionBy.charAt(0).toUpperCase() +
                      tableData.partitionBy.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          ) : kindData.kind === "matview" ? (
            /* Matview: 4 cards (2×2) when TTL is configured, 3 cards (1 row) when not. */
            <MetricsGrid $columns={hasTtl ? 2 : 3}>
              {hasTtl && (
                <MetricCard $background={theme.color.surfaceInset}>
                  <MetricLabel>TTL</MetricLabel>
                  <MetricValue>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </MetricValue>
                </MetricCard>
              )}
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Deduplication</MetricLabel>
                <MetricValue>
                  {tableData.dedup ? "Enabled" : "Disabled"}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Partitioning</MetricLabel>
                <MetricValue>
                  {tableData.partitionBy === "NONE"
                    ? "None"
                    : tableData.partitionBy.charAt(0).toUpperCase() +
                      tableData.partitionBy.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Refresh Type</MetricLabel>
                <MetricValue>
                  {matViewUnavailable ? (
                    <UnavailableValue />
                  ) : matView ? (
                    matView.refresh_type.charAt(0).toUpperCase() +
                    matView.refresh_type.slice(1).toLowerCase()
                  ) : (
                    <Text color="contentSecondary">Loading…</Text>
                  )}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          ) : kindData.kind === "table" ? (
            /* Table: 3 cards when TTL is configured, 2 when not. */
            <MetricsGrid $columns={hasTtl ? 3 : 2}>
              {hasTtl && (
                <MetricCard $background={theme.color.surfaceInset}>
                  <MetricLabel>TTL</MetricLabel>
                  <MetricValue>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </MetricValue>
                </MetricCard>
              )}
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Deduplication</MetricLabel>
                <MetricValue>
                  {tableData.dedup ? "Enabled" : "Disabled"}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.surfaceInset}>
                <MetricLabel>Partitioning</MetricLabel>
                <MetricValue>
                  {tableData.partitionBy === "NONE"
                    ? "None"
                    : tableData.partitionBy.charAt(0).toUpperCase() +
                      tableData.partitionBy.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          ) : null}
        </Section>
      )}

      {showStoragePolicySection && (
        <Section data-hook="table-details-storage-policy-section">
          <SectionTitleContainer>
            <DatabaseIcon size="16px" weight="bold" />
            <SectionTitle>Storage policy</SectionTitle>
          </SectionTitleContainer>
          {storagePolicyState.status === "unavailable" ? (
            <UnavailableValue data-hook="table-details-storage-unavailable" />
          ) : storagePolicyState.status === "loading" ? (
            <Text
              color="contentSecondary"
              data-hook="table-details-storage-loading"
            >
              Loading…
            </Text>
          ) : hasStoragePolicy ? (
            <Box gap="1rem" flexDirection="column" align="stretch">
              {storagePolicyDisabled && (
                <Box
                  gap="0.5rem"
                  align="center"
                  data-hook="table-details-storage-disabled"
                >
                  <XCircleIcon
                    size="16px"
                    weight="fill"
                    color={theme.color.contentSecondary}
                  />
                  <Text color="contentSecondary">Disabled</Text>
                </Box>
              )}
              <MetricsGrid $columns={storagePolicyClauses.length}>
                {storagePolicyClauses.map((clause) => (
                  <MetricCard
                    key={clause.action}
                    $background={theme.color.surfaceInset}
                  >
                    <MetricLabel>{clause.action}</MetricLabel>
                    <MetricValue>{clause.duration}</MetricValue>
                  </MetricCard>
                ))}
              </MetricsGrid>
            </Box>
          ) : (
            <Box gap="0.5rem" align="center">
              <XCircleIcon
                size="16px"
                weight="fill"
                color={theme.color.contentSecondary}
              />
              <Text color="contentSecondary">Not configured</Text>
            </Box>
          )}
        </Section>
      )}
    </>
  )
}
