import React, { useEffect, useMemo, useRef } from "react"
import styled, { css, keyframes, useTheme } from "styled-components"
import {
  formatValue,
  toneColor,
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
  caption: string | null
  value: unknown
  change: number | null
  spark: number[]
}

const pulse = keyframes`
  from { opacity: 0.45; }
  to { opacity: 1; }
`

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

const TileRoot = styled.div<{ $centred: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: ${({ $centred }) => ($centred ? "center" : "flex-start")};
  gap: 0.2rem;
  padding: 1.2rem 1.6rem;
  background: ${({ theme }) => theme.color.surfaceInset};
  box-shadow:
    inset -1px 0 ${({ theme }) => theme.color.borderSubtle},
    inset 0 -1px ${({ theme }) => theme.color.borderSubtle};
  overflow: hidden;
`

const Label = styled.span`
  position: relative;
  z-index: 1;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Value = styled.span<{ $color?: string; $flash: number }>`
  position: relative;
  z-index: 1;
  font-size: clamp(2.2rem, 3.2vw, 3.6rem);
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: ${({ $color, theme }) => $color ?? theme.color.contentPrimary};
  ${({ $flash }) =>
    $flash > 0 &&
    css`
      animation: ${pulse} 600ms ease-out;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
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

const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2)}`, [])
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map(
    (v, i) =>
      `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 26 - 2}`,
  )
  return (
    <Spark viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,30 ${points.join(" ")} 100,30`}
        fill={`url(#${id})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </Spark>
  )
}

export const statTiles = (
  visual: VisualConfig,
  statements: (StatementRows | null)[],
): { tiles: Tile[]; valueName: string | null; problems: string[] } => {
  const rows = statements[0]
  if (!rows)
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
  if (sparkRows && sparkRows.rows.length > 0) {
    const t = firstColumnOf(sparkRows, "temporal")
    const v =
      columnIndex(sparkRows, rows.columns[valueIdx].name) >= 0
        ? columnIndex(sparkRows, rows.columns[valueIdx].name)
        : firstColumnOf(sparkRows, "numeric")
    const k = firstColumnOf(sparkRows, "categorical")
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
        if (n !== null) sparks.set(key, [...(sparks.get(key) ?? []), n])
      }
    }
  }

  const tiles = rows.rows.slice(0, 24).map((row) => {
    const label =
      labelIdx >= 0 ? toLabel(row[labelIdx]) : rows.columns[valueIdx].name
    return {
      label,
      caption: captionIdx >= 0 ? toLabel(row[captionIdx]) : null,
      value: row[valueIdx],
      change: changeIdx >= 0 ? toNumber(row[changeIdx]) : null,
      spark: sparks.get(labelIdx >= 0 ? label : "") ?? sparks.get("") ?? [],
    }
  })
  return { tiles, valueName: rows.columns[valueIdx].name, problems }
}

type Props = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  formats: ColumnFormats
  onSelect?: (label: string) => void
}

export const StatTiles = ({ visual, statements, formats, onSelect }: Props) => {
  const theme = useTheme()
  const { tiles, valueName } = useMemo(
    () => statTiles(visual, statements),
    [visual, statements],
  )
  const format = valueName ? formats[valueName] : undefined
  const changeFormat = visual.columns?.change
    ? formats[visual.columns.change]
    : undefined
  const previous = useRef(new Map<string, unknown>())
  const flashes = useRef(new Map<string, number>())
  for (const tile of tiles) {
    const before = previous.current.get(tile.label)
    if (before !== undefined && before !== tile.value)
      flashes.current.set(
        tile.label,
        (flashes.current.get(tile.label) ?? 0) + 1,
      )
  }
  useEffect(() => {
    previous.current = new Map(tiles.map((t) => [t.label, t.value]))
  }, [tiles])

  return (
    <Grid
      $count={tiles.length}
      $compact={tiles.every((t) => t.spark.length < 2)}
      data-hook="stat-tiles"
    >
      {tiles.map((tile) => {
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
        const flash = flashes.current.get(tile.label) ?? 0
        return (
          <TileRoot
            key={tile.label}
            $centred={tile.spark.length < 2}
            onClick={onSelect ? () => onSelect(tile.label) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
            data-hook="stat-tile"
          >
            <Sparkline values={tile.spark} color={sparkColor} />
            <Label title={tile.label}>{tile.label}</Label>
            <Value
              key={flash}
              $flash={flash}
              $color={tone ? toneColor(tone, theme.color) : undefined}
            >
              {formatValue(tile.value, format ?? { kind: "number" })}
            </Value>
            {tile.caption && <Caption>{tile.caption}</Caption>}
            {tile.change !== null && changeTone && (
              <Change $color={toneColor(changeTone, theme.color)}>
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
