import React, { useMemo } from "react"
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
import type { Table, Column } from "../../../utils/questdb/types"
import type { TableKindData } from "./types"
import {
  formatTTL,
  formatInterval,
  formatUtcTimestamp,
  extractStoragePolicyClauses,
} from "./utils"
import { ColumnIcon } from "../Row"
import {
  Section,
  HorizontalSection,
  SectionTitle,
  SectionTitleClickable,
  SectionTitleContainer,
  CaretIcon,
} from "./shared-styles"
import { SchemaAIButton } from "./SchemaAIButton"
import { ErrorBanner } from "./ErrorBanner"
import { ISSUE_DOCS_URLS } from "./healthCheck"
import { useEditor } from "../../../providers"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

export interface DetailsTabProps {
  tableData: Table
  kindData: TableKindData
  columns: Column[]
  ddl: string
  isLiveViewLoadFailure: boolean
  isEnterprise: boolean
  truncatedDDL: { text: string; grayedOutLines: [number, number] | null }
  baseTableName: string | undefined
  baseTableStatus: "Valid" | "Suspended" | "Dropped" | null
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
  columns,
  ddl,
  isLiveViewLoadFailure,
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
  const view = kindData.kind === "view" ? kindData.view : null
  const matView = kindData.kind === "matview" ? kindData.matView : null
  const liveView = kindData.kind === "liveview" ? kindData.liveView : null
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"
  const storagePolicyClauses = useMemo(
    () => extractStoragePolicyClauses(ddl),
    [ddl],
  )
  const hasStoragePolicy = storagePolicyClauses.length > 0
  const hasTtl = (tableData.ttlValue ?? 0) !== 0
  const showStoragePolicySection =
    (kindData.kind === "table" || kindData.kind === "matview") &&
    (isEnterprise || hasStoragePolicy)
  const showDetailsSection =
    !isLiveViewLoadFailure &&
    (kindData.kind === "table" ||
      kindData.kind === "matview" ||
      liveView !== null)

  return (
    <>
      {baseTableName && (
        <HorizontalSection data-hook="table-details-base-table-section">
          <Text color="contentSecondary" size="sm" lineHeight="1.7">
            Base Table
          </Text>
          <BaseTableLinkButton
            disabled={baseTableExists === false}
            onClick={onNavigateToBaseTable}
            data-hook="table-details-base-table-link"
          >
            <Text
              color={baseTableExists ? "contentPrimary" : "contentSecondary"}
            >
              {baseTableName}
            </Text>
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
              data-hook="table-details-explain-ai"
            >
              Explain with AI
            </SchemaAIButton>
            <CopyButton
              text={ddl}
              iconOnly
              size="sm"
              data-hook="table-details-copy-ddl"
              onCopy={() =>
                void trackEvent(ConsoleEvent.TABLE_DETAILS_COPY_DDL)
              }
            />
          </ButtonsContainer>
        </SectionTitleContainer>
        {ddl && (
          <LiteEditor
            value={truncatedDDL.text}
            compactToolbar
            onOpenInEditor={async () => {
              await addBuffer({ value: ddl })
            }}
            grayedOutLines={truncatedDDL.grayedOutLines}
          />
        )}
      </Section>

      {/* Columns Section */}
      {columns.length === 0 ? (
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

      {/* Details Section - layout differs by type, hidden for views. Hidden
          for load-failure live views too: their definition is unreadable, so
          every card value would be a fabricated NULL-as-zero. Live views with
          no payload are also hidden; matviews fall back to table-backed cards. */}
      {showDetailsSection && (
        <Section data-hook="table-details-details-section">
          <SectionTitleContainer>
            <InfoIcon size="16px" weight="bold" />
            <SectionTitle>Details</SectionTitle>
          </SectionTitleContainer>

          {liveView ? (
            /* Live view: 4 cards (2×2). TTL, dedup and refresh type do not apply. */
            <MetricsGrid $columns={2}>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-flush-every-card"
              >
                <MetricLabel>Flush Every</MetricLabel>
                <MetricValue>
                  {formatInterval(
                    liveView.flush_every_interval,
                    liveView.flush_every_interval_unit,
                  )}
                </MetricValue>
              </MetricCard>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-in-memory-card"
              >
                <MetricLabel>In Memory</MetricLabel>
                <MetricValue>
                  {formatInterval(
                    liveView.in_memory_interval,
                    liveView.in_memory_interval_unit,
                  )}
                </MetricValue>
              </MetricCard>
              <MetricCard
                $background={theme.color.surfaceInset}
                data-hook="table-details-start-from-card"
              >
                <MetricLabel>Start From</MetricLabel>
                <MetricValue>
                  {liveView.view_lower_bound_timestamp
                    ? formatUtcTimestamp(liveView.view_lower_bound_timestamp)
                    : "Beginning"}
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
          ) : matView ? (
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
                  {matView.refresh_type.charAt(0).toUpperCase() +
                    matView.refresh_type.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          ) : kindData.kind === "table" || kindData.kind === "matview" ? (
            /* Table and matview fallback: 3 cards when TTL is configured, 2 when not. */
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
          {hasStoragePolicy ? (
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
