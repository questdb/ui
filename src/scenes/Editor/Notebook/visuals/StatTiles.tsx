import React, { useMemo } from "react"
import styled, { useTheme } from "styled-components"
import { RollingNumber } from "./RollingNumber"
import { PaneEmptyState } from "../PaneEmptyState"
import { Check } from "@phosphor-icons/react"
import { ButtonBase } from "../../../../components/Button"
import { columnTypeOf, sqlLiteral } from "../interactions/chartInteractions"
import {
  formatValue,
  toneColor,
  toneTextColor,
  toneOf,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import {
  columnIndex,
  firstColumnOf,
  toLabel,
  toNumber,
  toTime,
  type StatementRows,
} from "./statementRows"
import type { VisualConfig } from "../CellChart/chartTypes"

// Key numbers: one tile per row of the first statement, each with its label,
// value, change and a sparkline. The value takes its column's format and
// threshold colour; the change is a fraction (0.012 = +1.2%) coloured by sign.
// The sparkline comes from another statement (time, value[, label]): rows whose
// label matches the tile's, or all rows when there is no label column.

type Tile = {
  label: string
  selection: unknown
  caption: string | null
  value: unknown
  change: number | null
  spark: number[]
}

const Grid = styled.div<{ $count: number; $compact: boolean }>`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(${({ $count }) => ($count > 4 ? "15rem" : "18rem")}, 1fr)
  );
  grid-auto-rows: ${({ $compact }) =>
    $compact ? "minmax(9rem, auto)" : "minmax(9rem, 1fr)"};
  align-content: ${({ $compact }) => ($compact ? "center" : "stretch")};
  height: 100%;
  overflow: auto;
`

const TileRoot = styled(ButtonBase)<{
  $centred: boolean
  $interactive: boolean
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: ${({ $centred }) => ($centred ? "center" : "flex-start")};
  align-items: flex-start;
  gap: 0.2rem;
  padding: 1.2rem 1.6rem;
  min-width: 0;
  border: 0;
  text-align: left;
  cursor: ${({ $interactive }) => ($interactive ? "pointer" : "default")};
  background: ${({ theme }) => theme.color.surfaceInset};
  box-shadow:
    inset -1px 0 ${({ theme }) => theme.color.borderSubtle},
    inset 0 -1px ${({ theme }) => theme.color.borderSubtle};
  overflow: hidden;

  &&:focus-visible {
    outline-offset: -3px;
  }
`

const Label = styled.span`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};

  > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  > svg {
    flex-shrink: 0;
  }

  [aria-pressed="true"] & {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

const Value = styled.span<{ $color?: string }>`
  position: relative;
  z-index: 1;
  font-size: clamp(2.2rem, 3.2vw, 3.6rem);
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: ${({ $color, theme }) => $color ?? theme.color.contentPrimary};
`

const Caption = styled.span`
  position: relative;
  z-index: 1;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Change = styled.span<{ $color: string }>`
  position: relative;
  z-index: 1;
  align-self: flex-start;
  font-size: 1.2rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $color }) => $color};
`

const Spark = styled.svg`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 38%;
  opacity: 0.75;
  pointer-events: none;
`

const SPARKLINE_BUCKETS = 100
const sparklineGeometryCache = new WeakMap<number[], string>()

export const sparklineGeometry = (values: number[]): string => {
  const cached = sparklineGeometryCache.get(values)
  if (cached !== undefined) return cached
  if (values.length < 2) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Keep each bucket's extrema in time order, plus the endpoints.
  const indexes: number[] = [0]
  const step = Math.ceil((values.length - 2) / SPARKLINE_BUCKETS) || 1
  for (let start = 1; start < values.length - 1; start += step) {
    let low = start
    let high = start
    for (
      let i = start + 1;
      i < Math.min(start + step, values.length - 1);
      i++
    ) {
      if (values[i] < values[low]) low = i
      if (values[i] > values[high]) high = i
    }
    indexes.push(Math.min(low, high))
    if (low !== high) indexes.push(Math.max(low, high))
  }
  indexes.push(values.length - 1)
  const scale = Number.isFinite(max - min) ? 1 : 2
  const span = max / scale - min / scale || 1
  const points = indexes
    .map(
      (i) =>
        `${(i / (values.length - 1)) * 100},${28 - ((values[i] / scale - min / scale) / span) * 26}`,
    )
    .join(" ")
  sparklineGeometryCache.set(values, points)
  return points
}

const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2)}`, [])
  const points = sparklineGeometry(values)
  if (!points) return null
  return (
    <Spark viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${points} 100,30`} fill={`url(#${id})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </Spark>
  )
}

const MAX_STAT_TILES = 24

export const statTileLimitNotice = (
  statements: (StatementRows | null)[],
): string | undefined => {
  const count = statements[0]?.rows.length ?? 0
  return count > MAX_STAT_TILES
    ? `Showing ${MAX_STAT_TILES} of ${count} tiles.`
    : undefined
}

const LimitNotice = styled.span`
  grid-column: 1 / -1;
  color: ${({ theme }) => theme.color.contentSecondary};
`

export const statTiles = (
  visual: VisualConfig,
  statements: (StatementRows | null)[],
  clickColumn?: string,
): {
  tiles: Tile[]
  valueName: string | null
  changeName?: string
  problems: string[]
} => {
  const rows = statements[0]
  if (!rows || rows.rows.length === 0)
    return {
      tiles: [],
      valueName: null,
      problems: ["The query returned no rows."],
    }
  const c = visual.columns ?? {}
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : firstColumnOf(rows, "numeric")
  const labelIdx =
    c.label !== undefined
      ? columnIndex(rows, c.label)
      : firstColumnOf(rows, "categorical")
  const captionIdx = columnIndex(rows, c.caption)
  const changeIdx = columnIndex(
    rows,
    c.change ??
      (rows.columns.some((x) => x.name === "change") ? "change" : undefined),
  )
  const problems: string[] = []
  if (valueIdx < 0)
    return {
      tiles: [],
      valueName: null,
      problems: [
        `value: column ${JSON.stringify(c.value ?? "(first numeric)")} not found. Columns: ${rows.columns.map((x) => x.name).join(", ")}.`,
      ],
    }

  const sparkRows = statements[visual.sparklineQuery ?? 1] ?? undefined
  const sparks = new Map<string, number[]>()
  const labelName = rows.columns[labelIdx]?.name
  const namedKey = sparkRows ? columnIndex(sparkRows, labelName) : -1
  const k =
    namedKey >= 0
      ? namedKey
      : sparkRows
        ? firstColumnOf(sparkRows, "categorical")
        : -1
  if (sparkRows && sparkRows.rows.length > 0) {
    const t = firstColumnOf(sparkRows, "temporal")
    const v =
      columnIndex(sparkRows, rows.columns[valueIdx].name) >= 0
        ? columnIndex(sparkRows, rows.columns[valueIdx].name)
        : firstColumnOf(sparkRows, "numeric")
    if (v < 0)
      problems.push("sparkline: the sparkline statement has no numeric column.")
    else {
      const sorted =
        t >= 0
          ? [...sparkRows.rows].sort(
              (a, b) => (toTime(a[t]) ?? 0) - (toTime(b[t]) ?? 0),
            )
          : sparkRows.rows
      for (const row of sorted) {
        const key = k >= 0 ? toLabel(row[k]) : ""
        const n = toNumber(row[v])
        if (n === null) continue
        const history = sparks.get(key)
        if (history) history.push(n)
        else sparks.set(key, [n])
      }
    }
  }

  const clickIdx = columnIndex(rows, clickColumn)
  if (clickColumn !== undefined && clickIdx < 0)
    problems.push(`Click column ${JSON.stringify(clickColumn)} not found.`)
  const tiles = rows.rows.slice(0, MAX_STAT_TILES).map((row) => {
    const label =
      labelIdx >= 0 ? toLabel(row[labelIdx]) : rows.columns[valueIdx].name
    // An unbound click selects the tile's name: NULL for a NULL label.
    const unbound =
      labelIdx >= 0 && (row[labelIdx] === null || row[labelIdx] === undefined)
        ? null
        : label
    return {
      label,
      selection: clickColumn === undefined ? unbound : row[clickIdx],
      caption: captionIdx >= 0 ? toLabel(row[captionIdx]) : null,
      value: row[valueIdx],
      change: changeIdx >= 0 ? toNumber(row[changeIdx]) : null,
      spark: sparks.get(k >= 0 && labelIdx >= 0 ? label : "") ?? [],
    }
  })
  return {
    tiles,
    valueName: rows.columns[valueIdx].name,
    changeName: rows.columns[changeIdx]?.name,
    problems,
  }
}

type Props = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  formats: ColumnFormats
  queriesKey?: string
  selectedValue?: string
  clickColumn?: string
  onSelect?: (value: unknown) => void
}

export const StatTiles = ({
  visual,
  statements,
  formats,
  queriesKey,
  selectedValue,
  clickColumn,
  onSelect,
}: Props) => {
  const theme = useTheme()
  const { tiles, valueName, changeName, problems } = useMemo(
    () => statTiles(visual, statements, clickColumn),
    [visual, statements, clickColumn],
  )
  if (tiles.length === 0)
    return <PaneEmptyState>{problems[0] ?? "No data to plot."}</PaneEmptyState>
  // Tiles select from the first statement's rows.
  const clickType = columnTypeOf(statements.slice(0, 1), clickColumn)
  const limitNotice = statTileLimitNotice(statements)
  const format = valueName ? formats[valueName] : undefined
  const changeFormat = changeName ? formats[changeName] : undefined
  const labelOccurrences = new Map<string, number>()
  return (
    <Grid
      $count={tiles.length}
      $compact={tiles.every((t) => t.spark.length < 2)}
      data-hook="stat-tiles"
    >
      {limitNotice && <LimitNotice role="status">{limitNotice}</LimitNotice>}
      {tiles.map((tile) => {
        const occurrence = labelOccurrences.get(tile.label) ?? 0
        labelOccurrences.set(tile.label, occurrence + 1)
        const tone = toneOf(tile.value, format)
        const changeTone =
          tile.change === null
            ? undefined
            : tile.change > 0
              ? "positive"
              : tile.change < 0
                ? "negative"
                : "muted"
        const sparkColor =
          changeTone && changeTone !== "muted"
            ? toneColor(changeTone, theme.color)
            : theme.color.chartSeries1
        const text = formatValue(tile.value, format ?? { kind: "number" })
        const activate =
          onSelect && tile.selection !== undefined
            ? () => onSelect(tile.selection)
            : undefined
        const selected =
          activate && sqlLiteral(tile.selection, clickType) === selectedValue
        return (
          <TileRoot
            as={activate ? "button" : "div"}
            key={JSON.stringify([tile.label, occurrence])}
            $centred={tile.spark.length < 2}
            $interactive={Boolean(activate)}
            aria-pressed={selected}
            onClick={activate}
            data-hook="stat-tile"
          >
            <Sparkline values={tile.spark} color={sparkColor} />
            <Label title={tile.label}>
              <span>{tile.label}</span>
              {selected && <Check size={12} weight="bold" aria-hidden />}
            </Label>
            <Value $color={tone ? toneColor(tone, theme.color) : undefined}>
              {visual.animateDigits ? (
                <RollingNumber
                  key={queriesKey}
                  enabled
                  value={toNumber(tile.value)}
                  text={text}
                />
              ) : (
                text
              )}
            </Value>
            {tile.caption && <Caption>{tile.caption}</Caption>}
            {tile.change !== null && changeTone && (
              <Change
                $color={
                  toneTextColor(changeTone, theme.color) ??
                  theme.color.contentMuted
                }
              >
                {tile.change > 0 ? "▲ " : tile.change < 0 ? "▼ " : ""}
                {formatValue(
                  Math.abs(tile.change),
                  changeFormat ?? { kind: "percent" },
                )}
              </Change>
            )}
          </TileRoot>
        )
      })}
    </Grid>
  )
}
