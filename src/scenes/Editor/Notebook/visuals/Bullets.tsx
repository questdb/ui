import React from "react"
import styled, { useTheme } from "styled-components"
import {
  formatValue,
  thresholdBands,
  toneColor,
  toneOf,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import {
  columnIndex,
  firstColumnOf,
  toLabel,
  toNumber,
  type StatementRows,
} from "./statementRows"
import type { VisualConfig } from "../CellChart/chartTypes"

// Bullet bars: each row's value against its target (a limit, a budget) on a
// shared scale, over the value format's threshold bands. For limit usage,
// VaR against limit, exposure against a line.

const List = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.2rem;
  height: 100%;
  padding: 1.2rem 1.6rem;
  overflow: auto;
`

const Item = styled.div`
  display: grid;
  grid-template-columns: minmax(8rem, 22%) 1fr minmax(7rem, auto);
  align-items: center;
  gap: 1.2rem;
  font-size: 1.25rem;
`

const Name = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Track = styled.div`
  position: relative;
  height: 1.8rem;
  border-radius: 0.3rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  overflow: hidden;
`

const Band = styled.i`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: 0.18;
`

const Bar = styled.i`
  position: absolute;
  left: 0;
  top: 30%;
  bottom: 30%;
  border-radius: 0.2rem;
  transition: width 300ms ease-out;
`

const Target = styled.i`
  position: absolute;
  top: 12%;
  bottom: 12%;
  width: 0.3rem;
  margin-left: -0.15rem;
  border-radius: 0.1rem;
  background: ${({ theme }) => theme.color.contentPrimary};
`

const Figure = styled.span`
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.contentPrimary};

  small {
    color: ${({ theme }) => theme.color.contentMuted};
  }
`

const TARGET_NAMES = ["target", "limit", "budget", "max"]

export const bulletRows = (
  visual: VisualConfig,
  rows: StatementRows | null,
) => {
  if (!rows || rows.rows.length === 0)
    return { error: "The query returned no rows." }
  const c = visual.columns ?? {}
  const valueIdx =
    c.value !== undefined
      ? columnIndex(rows, c.value)
      : firstColumnOf(rows, "numeric")
  const targetIdx =
    c.target !== undefined
      ? columnIndex(rows, c.target)
      : rows.columns.findIndex((x) =>
          TARGET_NAMES.includes(x.name.toLowerCase()),
        )
  const labelIdx =
    c.label !== undefined
      ? columnIndex(rows, c.label)
      : firstColumnOf(rows, "categorical")
  if (valueIdx < 0)
    return {
      error: `value: column not found. Columns: ${rows.columns.map((x) => x.name).join(", ")}.`,
    }
  return { rows, valueIdx, targetIdx, labelIdx }
}

type Props = {
  visual: VisualConfig
  statements: (StatementRows | null)[]
  formats: ColumnFormats
}

export const Bullets = ({ visual, statements, formats }: Props) => {
  const theme = useTheme()
  const read = bulletRows(visual, statements[0])
  if ("error" in read) return null
  const { rows, valueIdx, targetIdx, labelIdx } = read
  const valueName = rows.columns[valueIdx].name
  const format = formats[valueName]
  const values = rows.rows.map((r) => toNumber(r[valueIdx]) ?? 0)
  const targets = rows.rows.map((r) =>
    targetIdx >= 0 ? toNumber(r[targetIdx]) : null,
  )
  const min = visual.min ?? 0
  const max =
    visual.max ??
    Math.max(...values, ...targets.map((t) => (t ?? 0) * 1.15), 1e-12)
  const span = max - min || 1
  const pct = (v: number) =>
    `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`
  const bands = thresholdBands(format, min, max)

  return (
    <List data-hook="bullets">
      {rows.rows.map((row, i) => {
        const value = values[i]
        const target = targets[i]
        const tone = toneOf(value, format)
        const color = tone
          ? toneColor(tone, theme.color)
          : theme.color.chartSeries1
        return (
          <Item key={labelIdx >= 0 ? toLabel(row[labelIdx]) : i}>
            <Name>{labelIdx >= 0 ? toLabel(row[labelIdx]) : valueName}</Name>
            <Track>
              {bands.map((b) => (
                <Band
                  key={b.from}
                  style={{
                    left: pct(b.from),
                    width: `calc(${pct(b.to)} - ${pct(b.from)})`,
                    background: toneColor(b.tone, theme.color),
                  }}
                />
              ))}
              <Bar style={{ width: pct(value), background: color }} />
              {target !== null && <Target style={{ left: pct(target) }} />}
            </Track>
            <Figure>
              {formatValue(value, format)}
              {target !== null && (
                <small> / {formatValue(target, format)}</small>
              )}
            </Figure>
          </Item>
        )
      })}
    </List>
  )
}
