import React from "react"
import styled, { useTheme } from "styled-components"
import {
  CodeIcon,
  TextColumnsIcon,
  ArrowSquareInIcon,
  InfoIcon,
} from "@phosphor-icons/react"
import { Box, Text, CopyButton } from "../../../components"
import { LiteEditor } from "../../../components/LiteEditor"
import type {
  Table,
  MaterializedView,
  View,
  Column,
} from "../../../utils/questdb/types"
import { formatTTL } from "./utils"
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

export interface DetailsTabProps {
  tableData: Table
  matViewData: MaterializedView | null
  viewData: View | null
  columns: Column[]
  ddl: string
  isMatView: boolean
  isView: boolean
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

const DetailsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.2rem;
  border-radius: 0.5rem;
  overflow: hidden;
`

const MetricsGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  truncatedDDL,
  baseTableStatus,
  columnsExpanded,
  onColumnsExpandedChange,
  onNavigateToBaseTable,
  onExplainWithAI,
  onAskAIForViewIssue,
}: DetailsTabProps) => {
  const { showPreviewBuffer } = useEditor()
  const theme = useTheme()
  const baseTableExists =
    baseTableStatus === "Valid" || baseTableStatus === "Suspended"

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
            />
          </ButtonsContainer>
        </SectionTitleContainer>
        {ddl && (
          <LiteEditor
            value={truncatedDDL.text}
            compactToolbar
            onOpenInEditor={async () => {
              await showPreviewBuffer({
                type: "code",
                value: ddl,
              })
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
            /* Matview: 2 rows × 2 columns */
            <MetricsGrid>
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>TTL</MetricLabel>
                <MetricValue>
                  {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                </MetricValue>
              </MetricCard>
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
            /* Table: 3 items in single row */
            <DetailsGrid>
              <MetricCard $background={theme.color.backgroundDarker}>
                <MetricLabel>TTL</MetricLabel>
                <MetricValue>
                  {formatTTL(tableData.ttlValue, tableData.ttlUnit)}
                </MetricValue>
              </MetricCard>
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
            </DetailsGrid>
          )}
        </Section>
      )}
    </>
  )
}
