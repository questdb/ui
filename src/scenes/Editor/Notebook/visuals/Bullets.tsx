import React, { useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import styled, { keyframes, useTheme } from "styled-components"
import {
  formatValue,
  toneColor,
  toneOf,
  type ColumnFormats,
  type Tone,
} from "../../../../utils/formats/columnFormat"
import { withAlpha } from "../../../../theme"
import {
  columnIndex,
  firstColumnOf,
  toLabel,
  toNumber,
  type StatementRows,
} from "./statementRows"
import type { VisualConfig } from "../CellChart/chartTypes"
import { PaneEmptyState } from "../PaneEmptyState"

// Each row's value against its target (a limit, a budget) on a shared scale:
// a bar coloured by the value format's thresholds, a marker for the target,
// and the use of the target in words, so the colour never has to be decoded.

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  height: 100%;
  padding: 1rem 1.2rem;
  overflow: auto;
  font-variant-numeric: tabular-nums;
`

const Item = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem 0.8rem 1rem;
  border-radius: 0.6rem;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }

  &:hover > [data-card] {
    display: block;
  }
`

// The card's figures for assistive technology, which cannot hover a row.
const Details = styled.dl`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`

// Opens a row's card on the side of the row with more room in the list.
const placeCard = (event: React.MouseEvent<HTMLDivElement>) => {
  const item = event.currentTarget
  const list = item.closest('[data-hook="bullets"]')
  if (!list) return
  const row = item.getBoundingClientRect()
  const view = list.getBoundingClientRect()
  item.toggleAttribute(
    "data-card-above",
    view.bottom - row.bottom < row.top - view.top,
  )
}

const Top = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  font-size: 1.3rem;
`

const Name = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Status = styled.span<{ $color: string; $textColor: string }>`
  padding: 0.1rem 0.6rem;
  border-radius: 1rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: ${({ $textColor }) => $textColor};
  background: ${({ $color }) => withAlpha($color, 0.12)};
`

const Figures = styled.span`
  margin-left: auto;
  color: ${({ theme }) => theme.color.contentPrimary};
  white-space: nowrap;

  small {
    font-size: 1.15rem;
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const Track = styled.div`
  position: relative;
  height: 0.8rem;
  border-radius: 0.4rem;
  background: ${({ theme }) => theme.color.dataGrid};
`

const Fill = styled.i`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 0.4rem;
  transition: width 300ms ease-out;
`

const Notch = styled.i`
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 1px;
  background: ${({ theme }) => theme.color.contentMuted};
  opacity: 0.6;
`

const Target = styled.i`
  position: absolute;
  top: -0.5rem;
  bottom: -0.5rem;
  width: 0.3rem;
  margin-left: -0.15rem;
  border-radius: 0.2rem;
  background: ${({ theme }) => theme.color.contentPrimary};
`

const cardIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-0.4rem);
  }
`

const Card = styled.div`
  position: absolute;
  z-index: 3;
  right: 0.8rem;
  top: calc(100% - 0.4rem);
  min-width: 18rem;
  padding: 0.8rem 1rem;
  border-radius: 0.6rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${({ theme }) => theme.color.surfaceRaised};
  box-shadow: 0 6px 20px ${({ theme }) => theme.color.shadowMedium};
  font-size: 1.2rem;
  pointer-events: none;
  /* Hidden cards take no room, so they add no scroll range to the list. */
  display: none;
  animation: ${cardIn} 120ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  /* Near the bottom of the list the card opens upwards, so it is not cut off
     at the pane's edge. */
  [data-card-above] > & {
    top: auto;
    bottom: calc(100% - 0.4rem);
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.3rem 1.6rem;
    margin: 0;
  }

  dt {
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  dd {
    margin: 0;
    text-align: right;
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const STATUS: Record<"positive" | "warning" | "negative", string> = {
  positive: "OK",
  warning: "Near limit",
  negative: "Breach",
}

const statusOf = (tone: Tone | undefined) =>
  tone === "positive" || tone === "warning" || tone === "negative"
    ? STATUS[tone]
    : undefined

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
  const listRef = useRef<HTMLDivElement>(null)
  const read = useMemo(
    () => bulletRows(visual, statements[0]),
    [visual, statements],
  )
  const count = "error" in read ? 0 : read.rows.rows.length
  const windowed = count > 50
  const window = useVirtualizer({
    count,
    enabled: windowed,
    getScrollElement: () => listRef.current,
    estimateSize: () => 54,
    overscan: 4,
    paddingStart: 10,
    paddingEnd: 10,
    gap: 4,
  })
  const extent = useMemo(() => {
    if ("error" in read || visual.max !== undefined) return visual.max ?? 1
    let max = 1e-12
    const { rows, valueIdx, targetIdx } = read
    for (const row of rows.rows) {
      const value = toNumber(row[valueIdx]) ?? 0
      const target = targetIdx >= 0 ? (toNumber(row[targetIdx]) ?? 0) * 1.1 : 0
      max = Math.max(max, value, target)
    }
    return max
  }, [read, visual.max])
  if ("error" in read) return <PaneEmptyState>{read.error}</PaneEmptyState>
  const { rows, valueIdx, targetIdx, labelIdx } = read
  const valueName = rows.columns[valueIdx].name
  const format = formats[valueName]
  const min = visual.min ?? 0
  const max = extent
  const span = max - min || 1
  const pct = (v: number) =>
    `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`
  const notches = (format?.thresholds ?? []).filter(
    (t) => t.value > min && t.value < max,
  )

  const positions = windowed
    ? window.getVirtualItems().map(({ index, start }) => ({ index, start }))
    : rows.rows.map((_, index) => ({ index, start: undefined }))
  const items = positions.map(({ index, start }) => {
    const row = rows.rows[index]
    const value = toNumber(row[valueIdx])
    const target = targetIdx >= 0 ? toNumber(row[targetIdx]) : null
    const tone = toneOf(value, format)
    const color = tone ? toneColor(tone, theme.color) : theme.color.chartSeries1
    const status = statusOf(tone)
    const statusTextColor =
      tone === "positive"
        ? theme.color.dataPositive
        : tone === "negative"
          ? theme.color.dataNegative
          : theme.color.contentPrimary
    const use = target && value !== null ? value / target : null
    const name = labelIdx >= 0 ? toLabel(row[labelIdx]) : valueName
    const details = (
      <>
        <dt>{valueName}</dt>
        <dd>{formatValue(value, format)}</dd>
        {target !== null && (
          <>
            <dt>Limit</dt>
            <dd>{formatValue(target, format)}</dd>
            <dt>Used</dt>
            <dd>{formatValue(use, { kind: "percent", decimals: 1 })}</dd>
            <dt>Headroom</dt>
            <dd>
              {formatValue(value === null ? null : target - value, format)}
            </dd>
          </>
        )}
        {notches.map((n) => (
          <React.Fragment key={n.value}>
            <dt>{statusOf(n.tone) ?? n.tone} from</dt>
            <dd>{formatValue(n.value, format)}</dd>
          </React.Fragment>
        ))}
      </>
    )
    return (
      <Item
        key={index}
        data-index={index}
        onMouseEnter={placeCard}
        ref={windowed ? window.measureElement : undefined}
        style={
          start === undefined
            ? undefined
            : {
                position: "absolute",
                left: "1.2rem",
                right: "1.2rem",
                top: start,
              }
        }
      >
        <Top>
          <Name>{name}</Name>
          {status && (
            <Status $color={color} $textColor={statusTextColor}>
              {status}
            </Status>
          )}
          <Figures>
            {value === null ? "No measurement" : formatValue(value, format)}
            {value !== null && target !== null && (
              <small> of {formatValue(target, format)}</small>
            )}
            {use !== null && (
              <small>
                {" "}
                · {formatValue(use, { kind: "percent", decimals: 0 })}
              </small>
            )}
          </Figures>
        </Top>
        <Track>
          {notches.map((n) => (
            <Notch key={n.value} style={{ left: pct(n.value) }} />
          ))}
          {value !== null && (
            <Fill style={{ width: pct(value), background: color }} />
          )}
          {target !== null && <Target style={{ left: pct(target) }} />}
        </Track>
        <Details>{details}</Details>
        <Card data-card aria-hidden>
          <dl>{details}</dl>
        </Card>
      </Item>
    )
  })
  return (
    <List
      ref={listRef}
      data-hook="bullets"
      style={windowed ? { padding: 0 } : undefined}
    >
      {windowed ? (
        <div
          style={{
            height: window.getTotalSize(),
            position: "relative",
            flexShrink: 0,
          }}
        >
          {items}
        </div>
      ) : (
        items
      )}
    </List>
  )
}
