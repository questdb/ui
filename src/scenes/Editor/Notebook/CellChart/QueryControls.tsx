import React from "react"
import styled from "styled-components"
import {
  Button,
  Checkbox,
  CopyButton,
  Input,
  SearchableSelect,
  Text,
} from "../../../../components"
import { HighlightedSql } from "../../../../components/HighlightedSql"
import {
  PIE_SHAPES,
  ROLE_COLUMNS,
  ROLE_FIELD,
  isRoleChartType,
  type ChartType,
  type PieShape,
  type QueryChart,
  type RoleChartType,
  type SeriesAxis,
} from "./chartTypes"
import type { ChartSettingsTelemetry } from "./chartSettingsTelemetry"
import {
  availableChartTypes,
  findOhlc,
  groupColumns,
  guessRoleColumns,
} from "./inferChartConfig"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import {
  CheckboxRow,
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
  SettingsSelect,
  SettingsMultiSelect,
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
  band: "Band (area between two columns)",
  rangeBar: "Range bars (start to end)",
  boxplot: "Box plot",
  events: "Events (markers on the time axis)",
}

// Types drawn as one series, whose legend name the user can set (the others
// name their series after their columns).
const NAMED_TYPES: ChartType[] = ["candlestick", "band", "rangeBar", "boxplot"]

const PIE_SHAPE_LABELS: Record<PieShape, string> = {
  pie: "Pie",
  donut: "Donut",
  halfDonut: "Half donut",
}

// What each role type draws, under its pickers.
const ROLE_HINTS: Record<RoleChartType, string> = {
  heatmap:
    "One cell per x and y, coloured by the value. Shows as a chart of its own.",
  band: "A shaded area between the two columns; the series below draw as lines inside it.",
  rangeBar:
    "A bar from start to end per x. With times for start and end, one lane per x along a time axis (a Gantt), as a chart of its own.",
  boxplot:
    "The query computes the five numbers per x, e.g. with approx_percentile. Shows as a chart of its own.",
}

const withoutColumns = (columns: string[], drop: string[]) =>
  columns.filter((c) => !drop.includes(c))

const roleCandidates = (
  type: RoleChartType,
  role: string,
  groups: ReturnType<typeof groupColumns>,
) => {
  if (type === "heatmap" && role === "y")
    return [...groups.categorical, ...groups.temporal, ...groups.numeric]
  if (type === "rangeBar") return [...groups.temporal, ...groups.numeric]
  return groups.numeric
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

const RoleControls: React.FC<{
  type: RoleChartType
  query: QueryChart
  groups: ReturnType<typeof groupColumns>
  idx: number
  onUpdateQuery: (patch: Partial<QueryChart>) => void
}> = ({ type, query, groups, idx, onUpdateQuery }) => {
  const field = ROLE_FIELD[type]
  const current = (query[field] ?? {}) as Record<string, string>
  return (
    <FieldGroup>
      <OhlcGrid>
        {ROLE_COLUMNS[type].map(([role, label]) => (
          <MiniField key={role}>
            <Text color="contentSecondary" size="xs">
              {label}
            </Text>
            <SettingsSelect
              name={`${type}-${role}-${idx}`}
              ariaLabel={`${label} column`}
              value={current[role] ?? ""}
              onValueChange={(value) => {
                if (!value) return
                const roles = { ...current, [role]: value }
                onUpdateQuery({
                  [field]: roles,
                  ...(type === "band"
                    ? {
                        yColumns: withoutColumns(
                          query.yColumns,
                          Object.values(roles),
                        ),
                      }
                    : {}),
                })
              }}
              options={[
                // Only while nothing is picked: no column cannot be saved.
                ...(current[role]
                  ? []
                  : [{ label: "Select column", value: "" }]),
                ...roleCandidates(type, role, groups).map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              ]}
            />
          </MiniField>
        ))}
      </OhlcGrid>
      <Text color="contentSecondary" size="xs" lineHeight="1.3">
        {ROLE_HINTS[type]}
      </Text>
    </FieldGroup>
  )
}

export type QueryControlsProps = {
  activeTab: QueryTab
  query: QueryChart
  xColumn: string | null
  anchorLabel: string
  isAnchorTab: boolean
  ohlcError: boolean
  onUpdateQuery: (patch: Partial<QueryChart>) => void
  onSetQuery: (next: QueryChart) => void
  telemetry?: ChartSettingsTelemetry
  // Offer "Events" for statements after the first that have a timestamp:
  // their rows mark the chart's time axis (notebook charts).
  offerEvents?: boolean
}

type ColumnOption = { label: string; value: string }

const summarizeSeries = (value: string[], options: ColumnOption[]): string => {
  if (value.length === 0) return "None selected"
  if (value.length === options.length && options.length > 0)
    return `All (${options.length})`
  if (value.length <= 2) return value.join(", ")
  return `${value.length} of ${options.length}`
}

// Toggles a series and keeps the columns' query order, so persisted
// selections stay stable across toggles.
const toggleSeries = (
  value: string[],
  name: string,
  options: ColumnOption[],
): string[] => {
  if (value.includes(name)) return value.filter((v) => v !== name)
  const next = new Set([...value, name])
  return options.filter((o) => next.has(o.value)).map((o) => o.value)
}

export const QueryControls: React.FC<QueryControlsProps> = ({
  activeTab,
  query,
  xColumn,
  anchorLabel,
  isAnchorTab,
  ohlcError,
  onUpdateQuery,
  onSetQuery,
  telemetry,
  offerEvents = false,
}) => {
  const groups = groupColumns(activeTab.columns)
  const hasOhlc = !!findOhlc(groups.numeric)
  const baseTypes: ChartType[] = [
    ...availableChartTypes(groups, hasOhlc),
    ...(offerEvents && !isAnchorTab && groups.temporal.length > 0
      ? (["events"] as const)
      : []),
  ]
  const types = baseTypes.includes(query.type)
    ? baseTypes
    : [query.type, ...baseTypes]
  const numericOptions = groups.numeric.map((c) => ({
    label: c.name,
    value: c.name,
  }))
  const partitionCandidates = groups.categorical.filter(
    (c) => c.name !== xColumn,
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
        <SettingsSelect
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
            if (isRoleChartType(type)) {
              const roles =
                (query[ROLE_FIELD[type]] as
                  | Record<string, string>
                  | undefined) ??
                guessRoleColumns(type, activeTab.columns, xColumn)
              if (roles) Object.assign(patch, { [ROLE_FIELD[type]]: roles })
              // These read their own columns; a partition would split them.
              patch.partitionByColumn = undefined
              // The band's edges are not also lines inside it.
              if (type === "band" && roles)
                patch.yColumns = withoutColumns(
                  query.yColumns,
                  Object.values(roles),
                )
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
                <SettingsSelect
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

      {query.type === "events" && (
        <FieldGroup>
          <OhlcGrid>
            {(
              [
                ["time", "Time", groups.temporal, "Default: column 1"],
                [
                  "end",
                  "End (ranges)",
                  groups.temporal,
                  "None: single moments",
                ],
                [
                  "label",
                  "Label",
                  [...groups.categorical, ...groups.other],
                  "Default: column 2",
                ],
                [
                  "tone",
                  "Tone column",
                  [...groups.categorical, ...groups.other],
                  "None: neutral",
                ],
              ] as const
            ).map(([k, label, candidates, fallback]) => (
              <MiniField key={k}>
                <Text color="contentSecondary" size="xs">
                  {label}
                </Text>
                <SettingsSelect
                  name={`events-${k}-${idx}`}
                  ariaLabel={`Events ${label.toLowerCase()} column`}
                  value={query.events?.[k] ?? ""}
                  onValueChange={(value) => {
                    const events = { ...query.events, [k]: value || undefined }
                    if (!value) delete events[k]
                    onUpdateQuery({
                      events:
                        Object.keys(events).length > 0 ? events : undefined,
                    })
                  }}
                  options={[
                    { label: fallback, value: "" },
                    ...candidates.map((c) => ({
                      label: c.name,
                      value: c.name,
                    })),
                  ]}
                />
              </MiniField>
            ))}
          </OhlcGrid>
          <Text color="contentSecondary" size="xs" lineHeight="1.3">
            Each row marks the time axis of the chart. A tone column holds
            positive, negative, warning, info or neutral.
          </Text>
        </FieldGroup>
      )}

      {isRoleChartType(query.type) && (
        <RoleControls
          type={query.type}
          query={query}
          groups={groups}
          idx={idx}
          onUpdateQuery={onUpdateQuery}
        />
      )}

      {query.type === "pie" && (
        <Field>
          <FieldLabel>Value</FieldLabel>
          <SettingsSelect
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

      {query.type === "pie" && (
        <Field>
          <FieldLabel>Shape</FieldLabel>
          <SettingsSelect
            name={`pie-shape-${idx}`}
            ariaLabel="Pie shape"
            value={query.pieShape ?? "donut"}
            onValueChange={(value) =>
              onUpdateQuery({ pieShape: value as PieShape })
            }
            options={PIE_SHAPES.map((shape) => ({
              label: PIE_SHAPE_LABELS[shape],
              value: shape,
            }))}
          />
        </Field>
      )}

      {(query.type === "line" ||
        query.type === "area" ||
        query.type === "stepLine" ||
        query.type === "stepArea" ||
        query.type === "bar" ||
        query.type === "stackedBar" ||
        query.type === "scatter" ||
        query.type === "band") && (
        <Field>
          <FieldLabel>
            {query.type === "band" ? "Lines inside the band" : "Series"}
          </FieldLabel>
          <SearchableSelect
            ariaLabel="Series"
            options={numericOptions}
            value={summarizeSeries(query.yColumns, numericOptions)}
            selectedValues={query.yColumns}
            allowCreate={false}
            onSelect={(name) =>
              onUpdateQuery({
                yColumns: toggleSeries(query.yColumns, name, numericOptions),
              })
            }
            onReset={() => onUpdateQuery({ yColumns: [] })}
            placeholder="None selected"
            searchPlaceholder="Column name"
            emptyLabel="No numeric columns"
            noMatchLabel="No columns matched"
            dataHookBase="chart-series"
          />
        </Field>
      )}

      {query.type === "scatter" && (
        <FieldGroup>
          <OhlcGrid>
            {(
              [
                ["size", "Point size"],
                ["color", "Point colour"],
              ] as const
            ).map(([role, label]) => (
              <MiniField key={role}>
                <Text color="contentSecondary" size="xs">
                  {label}
                </Text>
                <SettingsSelect
                  name={`scatter-${role}-${idx}`}
                  ariaLabel={`${label} column`}
                  value={query.scatter?.[role] ?? ""}
                  onValueChange={(value) => {
                    const scatter = {
                      ...query.scatter,
                      [role]: value || undefined,
                    }
                    onUpdateQuery({
                      scatter:
                        scatter.size || scatter.color ? scatter : undefined,
                    })
                  }}
                  options={[{ label: "None", value: "" }, ...numericOptions]}
                />
              </MiniField>
            ))}
          </OhlcGrid>
          <Text color="contentSecondary" size="xs" lineHeight="1.3">
            Bigger points for bigger values; colour runs light to strong.
          </Text>
        </FieldGroup>
      )}

      {PARTITION_TYPES.includes(query.type) &&
        partitionCandidates.length > 0 && (
          <Field>
            <FieldLabel>Partition by</FieldLabel>
            <SettingsSelect
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

      {(query.type === "area" ||
        query.type === "stepArea" ||
        query.type === "stackedBar") && (
        <CheckboxRow>
          <Checkbox
            checked={query.percentStack === true}
            onChange={(e) =>
              onUpdateQuery({ percentStack: e.target.checked || undefined })
            }
          />
          Stack to 100% (each x shows shares)
        </CheckboxRow>
      )}

      {NAMED_TYPES.includes(query.type) && (
        <Field>
          <FieldLabel>Series name</FieldLabel>
          <Input
            name={`series-name-${idx}`}
            placeholder="From the columns"
            value={query.name ?? ""}
            onChange={(e) =>
              onUpdateQuery({ name: e.target.value || undefined })
            }
          />
        </Field>
      )}

      {!isAnchorTab && query.type !== "events" && (
        <Field>
          <FieldLabel>Y-axis</FieldLabel>
          <SettingsSelect
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
