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

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  cursor: pointer;
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
  anchorLabel: string
  isAnchorTab: boolean
  ohlcError: boolean
  onUpdateQuery: (patch: Partial<QueryChart>) => void
  onSetQuery: (next: QueryChart) => void
  telemetry?: ChartSettingsTelemetry
}

export const QueryControls: React.FC<QueryControlsProps> = ({
  activeTab,
  query,
  anchorLabel,
  isAnchorTab,
  ohlcError,
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

      {!activeTab.compatible && (
        <IncompatibleNote>
          <IncompatibleIcon size={14} weight="fill" />
          <Text color="statusWarning" size="xs" lineHeight="1.2">
            {`This query has a different x-axis kind from ${anchorLabel}. It cannot combine and is hidden from the chart.`}
          </Text>
        </IncompatibleNote>
      )}

      {!isAnchorTab && (
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

      {query.type === "pie" && (
        <Field>
          <FieldLabel>Value</FieldLabel>
          <SelectMenuControl
            name={`value-${idx}`}
            ariaLabel="Value column"
            value={query.yColumns[0] ?? ""}
            onValueChange={(value) =>
              onUpdateQuery({
                yColumns: value ? [value] : [],
              })
            }
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
        groups.categorical.length > 0 && (
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
                ...groups.categorical.map((c) => ({
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
