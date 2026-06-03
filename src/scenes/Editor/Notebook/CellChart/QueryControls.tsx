import React from "react"
import styled from "styled-components"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { Button, CopyButton, MultiSelect, Text } from "../../../../components"
import { Select } from "../../../../components/Select"
import { HighlightedSql } from "../../../../components/HighlightedSql"
import type { ChartType, QueryChart, SeriesAxis } from "./chartTypes"
import {
  availableChartTypes,
  findOhlc,
  groupColumns,
  MAX_DEFAULT_SERIES,
} from "./inferChartConfig"
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

const inferQueryFromColumns = (columns: ColumnDefinition[]): QueryChart => {
  const g = groupColumns(columns)
  const cap = (cols: ColumnDefinition[]) =>
    cols.slice(0, MAX_DEFAULT_SERIES).map((c) => c.name)
  const ohlc = findOhlc(g.numeric)
  if (g.temporal.length > 0 && ohlc) {
    return {
      type: "candlestick",
      yColumns: [ohlc.open, ohlc.high, ohlc.low, ohlc.close],
      ohlc,
    }
  }
  if (g.temporal.length > 0 && g.numeric.length > 0)
    return { type: "line", yColumns: cap(g.numeric) }
  if (g.categorical.length > 0 && g.numeric.length > 0)
    return { type: "bar", yColumns: cap(g.numeric) }
  if (g.numeric.length >= 2)
    return { type: "scatter", yColumns: cap(g.numeric.slice(1)) }
  return { type: "bar", yColumns: cap(g.numeric) }
}

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
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.4rem;
  color: ${({ theme }) => theme.color.foreground};
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.1rem;
`

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.foreground};
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
}

export const QueryControls: React.FC<QueryControlsProps> = ({
  activeTab,
  query,
  anchorLabel,
  isAnchorTab,
  ohlcError,
  onUpdateQuery,
  onSetQuery,
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
          <Text color="orange" size="xs" lineHeight="1.2">
            {`This query has a different x-axis kind from ${anchorLabel}. It cannot combine and is hidden from the chart.`}
          </Text>
        </IncompatibleNote>
      )}

      {!isAnchorTab && (
        <CheckboxRow>
          <input
            type="checkbox"
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
        <Select
          name={`type-${idx}`}
          value={query.type}
          onChange={(e) => {
            const type = e.target.value as ChartType
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
                <Text color="gray2" size="xs">
                  {label}
                </Text>
                <Select
                  name={`ohlc-${k}-${idx}`}
                  value={query.ohlc?.[k] ?? ""}
                  onChange={(e) =>
                    onUpdateQuery({
                      ohlc: {
                        open: "",
                        high: "",
                        low: "",
                        close: "",
                        ...query.ohlc,
                        [k]: e.target.value,
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
              <Text color="orange" size="xs" lineHeight="1.2">
                Map all four OHLC fields to distinct numeric columns
              </Text>
            </IncompatibleNote>
          )}
        </FieldGroup>
      )}

      {query.type === "pie" && (
        <Field>
          <FieldLabel>Value</FieldLabel>
          <Select
            name={`value-${idx}`}
            value={query.yColumns[0] ?? ""}
            onChange={(e) =>
              onUpdateQuery({
                yColumns: e.target.value ? [e.target.value] : [],
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
            name={`y-${idx}`}
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
            <Select
              name={`partition-${idx}`}
              value={query.partitionByColumn ?? ""}
              onChange={(e) =>
                onUpdateQuery({
                  partitionByColumn: e.target.value || undefined,
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
          <Select
            name={`axis-${idx}`}
            value={query.axis ?? "left"}
            onChange={(e) =>
              onUpdateQuery({ axis: e.target.value as SeriesAxis })
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
        skin="secondary"
        onClick={() => onSetQuery(inferQueryFromColumns(activeTab.columns))}
      >
        Reset to auto
      </Button>
    </QueryCard>
  )
}
