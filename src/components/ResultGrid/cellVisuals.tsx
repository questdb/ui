import React from "react"
import styled from "styled-components"
import type { ColumnDefinition } from "../../utils/questdb/types"
import type {
  CellVisual,
  ColumnFormats,
} from "../../utils/formats/columnFormat"
import type { ResultGridRow } from "./types"

// In-cell visuals a column format can ask for: a bar scaled to the column's
// range, a meter showing the value's share of the column total, or a
// sparkline drawn from an array value.

export type ColumnScale = { min: number; max: number; total: number }

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Scales for the columns whose format draws a bar or meter, by data index. */
export const columnScalesOf = (
  columns: ColumnDefinition[],
  rows: ResultGridRow[],
  formats: ColumnFormats | undefined,
): (ColumnScale | undefined)[] =>
  columns.map((column, i) => {
    const visual = formats?.[column.name]?.visual
    if (visual !== "bar" && visual !== "meter") return undefined
    let min = 0
    let max = 0
    let total = 0
    for (const row of rows) {
      const n = toNumber(row[i])
      if (n === null) continue
      min = Math.min(min, n)
      max = Math.max(max, n)
      total += Math.abs(n)
    }
    return { min, max, total }
  })

const Layer = styled.i`
  position: absolute;
  inset: 0.3rem 0.4rem;
  pointer-events: none;
`

const Fill = styled.i`
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 0.2rem;
  opacity: 0.22;
  transition: width 240ms ease-out;
`

const Spark = styled.svg`
  position: absolute;
  inset: 0.3rem 0.6rem;
  width: calc(100% - 1.2rem);
  height: calc(100% - 0.6rem);
`

export const sparklinePointsOf = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined
  const values: number[] = []
  let min = Infinity
  let max = -Infinity
  for (const sample of value) {
    const n = toNumber(sample)
    if (n === null) continue
    values.push(n)
    min = Math.min(min, n)
    max = Math.max(max, n)
  }
  if (values.length < 2) return undefined
  const span = max - min || 1
  if (!Number.isFinite(span)) return undefined
  return values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * 100},${20 - ((v - min) / span) * 18 - 1}`,
    )
    .join(" ")
}

export const CellVisualLayer = ({
  visual,
  value,
  scale,
  color,
  sparklinePoints,
}: {
  visual: CellVisual
  value: unknown
  scale: ColumnScale | undefined
  color: string
  sparklinePoints?: string
}) => {
  if (visual === "sparkline") {
    if (sparklinePoints === undefined) return null
    return (
      <Spark viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
        <polyline
          points={sparklinePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
        />
      </Spark>
    )
  }
  const n = toNumber(value)
  if (n === null || !scale) return null
  if (visual === "meter") {
    const share = scale.total > 0 ? Math.abs(n) / scale.total : 0
    return (
      <Layer aria-hidden>
        <Fill
          style={{ left: 0, width: `${share * 100}%`, background: color }}
        />
      </Layer>
    )
  }
  // A bar grows from zero: rightwards for positive values, leftwards for
  // negative ones when the column has both.
  const span = scale.max - scale.min || 1
  const zero = (0 - scale.min) / span
  const at = (n - scale.min) / span
  const left = Math.min(zero, at)
  const width = Math.abs(at - zero)
  return (
    <Layer aria-hidden>
      <Fill
        style={{
          left: `${left * 100}%`,
          width: `${width * 100}%`,
          background: color,
        }}
      />
    </Layer>
  )
}
