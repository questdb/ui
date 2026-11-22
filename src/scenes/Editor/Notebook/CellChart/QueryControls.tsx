import React from "react"
import styled from "styled-components"
import {
  Button,
  Checkbox,
  CopyButton,
  MultiSelect,
  SelectMenuControl,
  Text,
} from "../../../../components"
import { HighlightedSql } from "../../../../components/HighlightedSql"
import type { ChartType, QueryChart, SeriesAxis } from "./chartTypes"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import { availableChartTypes, findOhlc, groupColumns } from "./inferChartConfig"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import {
  CheckboxRow,
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
} from "./chartSettingsStyles"

const TYPE_LABELS: Record<ChartType, string> = {
  line: "Line",
  area: "Area",
  stepLine: "Step line",
  stepArea: "Step area",
  bar: "Bar",
  stackedBar: "Stacked bar",
  scatter: "Scatter",
  pie: "Pie",
  candlestick: "Candlestick",
  heatmap: "Heatmap",
}

const PARTITION_TYPES: ChartType[] = [
  "line",
  "area",
  "stepLine",
  "stepArea",
  "bar",
  "stackedBar",
  "scatter",
]

const QueryCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`

const QueryLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const SqlPre = styled(HighlightedSql)`
  margin: 0;
  padding: 0.7rem;
  max-height: 9rem;
  overflow: auto;
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.1rem;
`

const OhlcGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
`

const MiniField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
`

const IncompatibleNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
`

export type QueryControlsProps = {
  activeTab: QueryTab
  query: QueryChart
  xColumn: string | null
  anchorLabel: string
  compatible: boolean
  canToggleIncluded: boolean
  isAnchorTab: boolean
  ohlcError: boolean
  heatmapError: boolean
  heatmapValue: string | undefined
  onHeatmapValueChange: (value: string) => void
  onUpdateQuery: (patch: Partial<QueryChart>) => void
  onSetQuery: (next: QueryChart) => void
  telemetry?: ChartSettingsTelemetry
}

export const QueryControls: React.FC<QueryControlsProps> = ({
  activeTab,
  query,
  xColumn,
  anchorLabel,
  compatible,
  canToggleIncluded,
  isAnchorTab,
  ohlcError,
  heatmapError,
  heatmapValue,
  onHeatmapValueChange,
  onUpdateQuery,
  onSetQuery,
  telemetry,
}) => {
  const groups = groupColumns(activeTab.columns)
  const hasOhlc = !!findOhlc(groups.numeric)
  const baseTypes = availableChartTypes(groups, hasOhlc)
  const types = baseTypes.includes(query.type)
    ? baseTypes
    : [query.type, ...baseTypes]
  const numericOptions = groups.numeric.map((c) => ({
    label: c.name,
    value: c.name,
  }))
  const partitionCandidates = groups.categorical.filter(
    (c) =>
      c.name !== xColumn ||
      (query.type === "heatmap" &&
        query.enabled === false &&
        c.name === query.partitionByColumn),
  )
  const idx = activeTab.index

  return (
    <QueryCard>
      <FieldGroup>
        <QueryLabelRow>
          <FieldLabel>Query</FieldLabel>
          <CopyButton type="button" text={activeTab.query} size="sm" iconOnly />
        </QueryLabelRow>
        <SqlPre code={activeTab.query} />
      </FieldGroup>

      {!compatible && (
        <IncompatibleNote>
          <IncompatibleIcon size={14} weight="fill" />
          <Text color="statusWarning" size="xs" lineHeight="1.2">
            {`This query has a different x-axis kind from ${anchorLabel}. It cannot combine and is hidden from the chart.`}
          </Text>
        </IncompatibleNote>
      )}

      {canToggleIncluded && (
        <CheckboxRow>
          <Checkbox
            checked={query.enabled !== false}
            onChange={(e) =>
              onUpdateQuery({
                enabled: e.target.checked ? undefined : false,
              })
            }
          />
          Include in chart
        </CheckboxRow>
      )}

      <Field>
        <FieldLabel>Type</FieldLabel>
        <SelectMenuControl
          name={`type-${idx}`}
          ariaLabel="Chart type"
          value={query.type}
          onValueChange={(value) => {
            const type = value as ChartType
            telemetry?.onTypeChange?.(query.type, type)
            const patch: Partial<QueryChart> = { type }
            if (type === "candlestick" && !query.ohlc) {
              const oh = findOhlc(groups.numeric)
              if (oh) patch.ohlc = oh
            }
            if (
              type === "heatmap" &&
              !query.partitionByColumn &&
              partitionCandidates[0]
            ) {
              patch.partitionByColumn = partitionCandidates[0].name
            }
            onUpdateQuery(patch)
          }}
          options={types.map((t) => ({ label: TYPE_LABELS[t], value: t }))}
        />
      </Field>

      {query.type === "candlestick" && (
        <FieldGroup>
          <OhlcGrid>
            {(
              [
                ["open", "Open"],
                ["high", "High"],
                ["low", "Low"],
                ["close", "Close"],
              ] as const
            ).map(([k, label]) => (
              <MiniField key={k}>
                <Text color="contentSecondary" size="xs">
                  {label}
                </Text>
                <SelectMenuControl
                  name={`ohlc-${k}-${idx}`}
                  ariaLabel={`${label} column`}
                  value={query.ohlc?.[k] ?? ""}
                  onValueChange={(value) =>
                    onUpdateQuery({
                      ohlc: {
                        open: "",
                        high: "",
                        low: "",
                        close: "",
                        ...query.ohlc,
                        [k]: value,
                      },
                    })
                  }
                  options={[
                    { label: "Select column", value: "" },
                    ...numericOptions,
                  ]}
                />
              </MiniField>
            ))}
          </OhlcGrid>
          {ohlcError && (
            <IncompatibleNote>
              <IncompatibleIcon size={14} weight="fill" />
              <Text color="statusWarning" size="xs" lineHeight="1.2">
                Map all four OHLC fields to distinct numeric columns
              </Text>
            </IncompatibleNote>
          )}
        </FieldGroup>
      )}

      {query.type === "heatmap" && (
        <FieldGroup>
          <Field>
            <FieldLabel>Rows</FieldLabel>
            <SelectMenuControl
              name={`rows-${idx}`}
              ariaLabel="Rows column"
              value={query.partitionByColumn ?? ""}
              onValueChange={(value) =>
                onUpdateQuery({ partitionByColumn: value || undefined })
              }
              options={[
                { label: "Select column", value: "" },
                ...partitionCandidates.map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel>Color scale</FieldLabel>
            <SelectMenuControl
              name={`color-scale-${idx}`}
              ariaLabel="Color scale"
              value={query.colorScale ?? "chart"}
              onValueChange={(value) =>
                onUpdateQuery({
                  colorScale: value === "row" ? "row" : undefined,
                })
              }
              options={[
                {
                  label: "Whole chart",
                  value: "chart",
                  description: "One scale for every cell",
                },
                {
                  label: "Each row",
                  value: "row",
                  description: "Rows of any size show their contrast",
                },
              ]}
            />
          </Field>
          {heatmapError && (
            <IncompatibleNote>
              <IncompatibleIcon size={14} weight="fill" />
              <Text color="statusWarning" size="xs" lineHeight="1.2">
                Pick a separate rows column and a numeric value column
              </Text>
            </IncompatibleNote>
          )}
        </FieldGroup>
      )}

      {(query.type === "pie" || query.type === "heatmap") && (
        <Field>
          <FieldLabel>Value</FieldLabel>
          <SelectMenuControl
            name={`value-${idx}`}
            ariaLabel="Value column"
            value={
              (query.type === "heatmap" ? heatmapValue : query.yColumns[0]) ??
              ""
            }
            onValueChange={(value) => {
              if (query.type === "heatmap") onHeatmapValueChange(value)
              else onUpdateQuery({ yColumns: value ? [value] : [] })
            }}
            options={[{ label: "Select column", value: "" }, ...numericOptions]}
          />
        </Field>
      )}

      {(query.type === "line" ||
        query.type === "area" ||
        query.type === "stepLine" ||
        query.type === "stepArea" ||
        query.type === "bar" ||
        query.type === "stackedBar" ||
        query.type === "scatter") && (
        <Field>
          <FieldLabel>Series</FieldLabel>
          <MultiSelect
            name="Series"
            value={query.yColumns}
            onChange={(next) => onUpdateQuery({ yColumns: next })}
            options={numericOptions}
            placeholder="None selected"
          />
        </Field>
      )}

      {PARTITION_TYPES.includes(query.type) &&
        partitionCandidates.length > 0 && (
          <Field>
            <FieldLabel>Partition by</FieldLabel>
            <SelectMenuControl
              name={`partition-${idx}`}
              ariaLabel="Partition by"
              value={query.partitionByColumn ?? ""}
              onValueChange={(value) =>
                onUpdateQuery({
                  partitionByColumn: value || undefined,
                })
              }
              options={[
                { label: "None", value: "" },
                ...partitionCandidates.map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              ]}
            />
          </Field>
        )}

      {!isAnchorTab && (
        <Field>
          <FieldLabel>Y-axis</FieldLabel>
          <SelectMenuControl
            name={`axis-${idx}`}
            ariaLabel="Y-axis"
            value={query.axis ?? "left"}
            onValueChange={(value) =>
              onUpdateQuery({ axis: value as SeriesAxis })
            }
            options={[
              { label: "Left", value: "left" },
              { label: "Right", value: "right" },
            ]}
          />
        </Field>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          telemetry?.onResetAuto?.(query.type)
          onSetQuery(activeTab.inferredChart)
        }}
      >
        Reset to auto
      </Button>
    </QueryCard>
  )
}
