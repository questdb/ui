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
import { Box, Text, CopyButton } from "../../../components"
import { LiteEditor } from "../../../components/LiteEditor"
import type {
  Table,
  MaterializedView,
  View,
  Column,
} from "../../../utils/questdb/types"
import { formatTTL, extractStoragePolicyClauses } from "./utils"
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
  matViewData: MaterializedView | null
  viewData: View | null
  columns: Column[]
  ddl: string
  isMatView: boolean
  isView: boolean
  isEnterprise: boolean
  truncatedDDL: { text: string; grayedOutLines: [number, number] | null }
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

const BaseTableLinkButton = styled.button<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: none;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  color: ${({ theme }) => theme.color.foreground};

  &:hover {
    text-decoration: ${({ $disabled }) => ($disabled ? "none" : "underline")};
  }
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
  background: ${({ $background, theme }) =>
    $background ?? theme.color.backgroundLighter};
`

const StoragePolicyClauses = styled.div<{ $columns: number }>`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
`

const MetricLabel = styled(Text).attrs({
  color: "gray2",
  size: "sm",
})``

const MetricValue = styled(Text).attrs({
  color: "foreground",
  size: "md",
})`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StyledCopyButton = styled(CopyButton)`
  margin-left: auto;
  background: transparent;
`

const ColumnCopyButton = styled(CopyButton)`
  visibility: hidden;
  background: transparent;
  padding: 0.3rem;

  ${SchemaRow}:hover & {
    visibility: visible;
  }

  margin-right: 0.5rem;
`

const ButtonsContainer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  margin-left: auto;
`

export const DetailsTab = ({
  tableData,
  matViewData,
  viewData,
  columns,
  ddl,
  isMatView,
  isView,
  isEnterprise,
  truncatedDDL,
  baseTableStatus,
  columnsExpanded,
  onColumnsExpandedChange,
  onNavigateToBaseTable,
  onExplainWithAI,
  onAskAIForViewIssue,
}: DetailsTabProps) => {
  const { addBuffer } = useEditor()
  const theme = useTheme()
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"
  const storagePolicyClauses = extractStoragePolicyClauses(ddl)
  const hasStoragePolicy = storagePolicyClauses.length > 0
  const hasTtl = tableData.ttlValue !== 0
  const showStoragePolicySection = isEnterprise || hasStoragePolicy

  return (
    <>
      {isMatView && matViewData && (
        <HorizontalSection data-hook="table-details-base-table-section">
          <Text color="gray2" size="sm" lineHeight="1.7">
            Base Table
          </Text>
          <BaseTableLinkButton
            $disabled={baseTableExists === false}
            onClick={onNavigateToBaseTable}
            data-hook="table-details-base-table-link"
            data-disabled={baseTableExists === false}
          >
            <Text color={baseTableExists ? "foreground" : "gray2"}>
              {matViewData.base_table_name}
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

      {isView && viewData?.view_status === "invalid" && (
        <Section>
          <ErrorBanner
            title="View is invalid"
            description={viewData.invalidation_reason || undefined}
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
            <StyledCopyButton
              text={ddl}
              iconOnly
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
                    <Text color="foreground" ellipsis>
                      {col.column}
                    </Text>
                    <ColumnCopyButton
                      size="sm"
                      text={col.column}
                      iconOnly
                      data-hook="table-details-copy-column-name"
                    />
                  </ColumnNameBox>
                  <ColumnType>{col.type}</ColumnType>
                </SchemaRow>
              ))}
            </Box>
          )}
        </Section>
      )}

      {/* Details Section - layout differs by type, hidden for views */}
      {!isView && (
        <Section data-hook="table-details-details-section">
          <SectionTitleContainer>
            <InfoIcon size="16px" weight="bold" />
            <SectionTitle>Details</SectionTitle>
          </SectionTitleContainer>

          {isMatView && matViewData ? (
            /* Matview: 4 cards (2×2) when TTL is configured, 3 cards (1 row) when not. */
            <MetricsGrid $columns={hasTtl ? 2 : 3}>
              {hasTtl && (
                <MetricCard $background={theme.color.backgroundDarker}>
                  <MetricLabel>TTL</MetricLabel>
                  <MetricValue>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </MetricValue>
                </MetricCard>
              )}
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>Deduplication</MetricLabel>
                <MetricValue>
                  {tableData.dedup ? "Enabled" : "Disabled"}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>Partitioning</MetricLabel>
                <MetricValue>
                  {tableData.partitionBy === "NONE"
                    ? "None"
                    : tableData.partitionBy.charAt(0).toUpperCase() +
                      tableData.partitionBy.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>Refresh Type</MetricLabel>
                <MetricValue>
                  {matViewData.refresh_type.charAt(0).toUpperCase() +
                    matViewData.refresh_type.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          ) : (
            /* Table: 3 cards (1 row) when TTL is configured, 2 cards (1 row) when not. */
            <MetricsGrid $columns={hasTtl ? 3 : 2}>
              {hasTtl && (
                <MetricCard $background={theme.color.backgroundDarker}>
                  <MetricLabel>TTL</MetricLabel>
                  <MetricValue>
                    {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                  </MetricValue>
                </MetricCard>
              )}
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>Deduplication</MetricLabel>
                <MetricValue>
                  {tableData.dedup ? "Enabled" : "Disabled"}
                </MetricValue>
              </MetricCard>
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>Partitioning</MetricLabel>
                <MetricValue>
                  {tableData.partitionBy === "NONE"
                    ? "None"
                    : tableData.partitionBy.charAt(0).toUpperCase() +
                      tableData.partitionBy.slice(1).toLowerCase()}
                </MetricValue>
              </MetricCard>
            </MetricsGrid>
          )}
        </Section>
      )}

      {!isView && showStoragePolicySection && (
        <Section data-hook="table-details-storage-policy-section">
          <SectionTitleContainer>
            <DatabaseIcon size="16px" weight="bold" />
            <SectionTitle>Storage policy</SectionTitle>
          </SectionTitleContainer>
          {hasStoragePolicy ? (
            <StoragePolicyClauses $columns={storagePolicyClauses.length}>
              {storagePolicyClauses.map((clause) => (
                <MetricCard
                  key={clause.action}
                  $background={theme.color.backgroundDarker}
                >
                  <MetricLabel>{clause.action}</MetricLabel>
                  <MetricValue>{clause.duration}</MetricValue>
                </MetricCard>
              ))}
            </StoragePolicyClauses>
          ) : (
            <Box gap="0.5rem" align="center">
              <XCircleIcon size={16} weight="fill" color={theme.color.gray2} />
              <Text color="gray2">Not configured</Text>
            </Box>
          )}
        </Section>
      )}
    </>
  )
}
