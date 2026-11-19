import React, { useEffect, useMemo, useRef } from "react"
import styled, { css, keyframes } from "styled-components"
import {
  formatValue,
  type ColumnFormat,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import { columnIndex, toNumber, type StatementRows } from "./statementRows"
import type { VisualColumns } from "../CellChart/chartTypes"

// An order book ladder: asks above, bids below, the spread between them. The
// query does the work: statement 1 returns the asks and statement 2 the bids,
// each best level first, with price and size as the first two columns (or the
// columns named in the visual). A third column, when present, shows as is
// (cumulative size, order count, …).

type Level = { price: number; size: number; extra: unknown }

type Side = {
  levels: Level[]
  extraName?: string
}

const readSide = (
  rows: StatementRows | null,
  columns: VisualColumns | undefined,
): Side => {
  if (!rows) return { levels: [] }
  const priceIdx = columnIndex(rows, columns?.price, 0)
  const sizeIdx = columnIndex(rows, columns?.size, 1)
  const extraIdx = rows.columns.findIndex(
    (_, i) => i !== priceIdx && i !== sizeIdx,
  )
  if (priceIdx < 0 || sizeIdx < 0) return { levels: [] }
  return {
    levels: rows.rows.flatMap((row) => {
      const price = toNumber(row[priceIdx])
      const size = toNumber(row[sizeIdx])
      return price === null || size === null
        ? []
        : [{ price, size, extra: extraIdx >= 0 ? row[extraIdx] : undefined }]
    }),
    extraName: extraIdx >= 0 ? rows.columns[extraIdx].name : undefined,
  }
}

const flashUp = keyframes`
  from { background-color: var(--flash-up); }
  to { background-color: transparent; }
`

const flashDown = keyframes`
  from { background-color: var(--flash-down); }
  to { background-color: transparent; }
`

const Root = styled.div`
  --flash-up: ${({ theme }) => theme.color.dataPositive}40;
  --flash-down: ${({ theme }) => theme.color.dataNegative}40;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0.4rem 0.8rem 0.8rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
`

const Head = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: ${({ $cols }) =>
    $cols === 3 ? "1fr 1fr 1fr" : "1fr 1fr"};
  padding: 0.4rem 0.8rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-family: ${({ theme }) => theme.font};
  font-size: 1.1rem;

  > span:not(:first-child) {
    text-align: right;
  }
`

const Half = styled.div<{ $side: "ask" | "bid" }>`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: ${({ $side }) =>
    $side === "ask" ? "column-reverse" : "column"};
  justify-content: flex-start;
  overflow: hidden;
`

const Row = styled.div<{
  $side: "ask" | "bid"
  $cols: number
  $flash: "up" | "down" | null
  $best: boolean
  $clickable: boolean
}>`
  position: relative;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: ${({ $cols }) =>
    $cols === 3 ? "1fr 1fr 1fr" : "1fr 1fr"};
  align-items: center;
  height: 2.2rem;
  padding: 0 0.8rem;
  border-radius: 0.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};
  ${({ $flash }) =>
    $flash &&
    css`
      animation: ${$flash === "up" ? flashUp : flashDown} 700ms ease-out;
    `}

  > span {
    position: relative;
    z-index: 1;
  }

  > span:not(:first-of-type) {
    text-align: right;
  }

  > span:first-of-type {
    color: ${({ $side, theme }) =>
      $side === "ask" ? theme.color.dataNegative : theme.color.dataPositive};
    font-weight: ${({ $best }) => ($best ? 700 : 400)};
  }

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Depth = styled.i<{ $side: "ask" | "bid" }>`
  position: absolute;
  top: 0.2rem;
  bottom: 0.2rem;
  right: 0;
  border-radius: 0.2rem;
  background: ${({ $side, theme }) =>
    $side === "ask" ? theme.color.dataNegative : theme.color.dataPositive};
  opacity: 0.16;
  transition: width 260ms cubic-bezier(0.2, 0.8, 0.2, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Spread = styled.div`
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0.4rem 0;
  padding: 0.6rem 0.8rem;
  border-block: 1px solid ${({ theme }) => theme.color.borderSubtle};
  font-family: ${({ theme }) => theme.font};
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.15rem;

  b {
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.6rem;
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const Empty = styled.div`
  padding: 0.8rem;
  color: ${({ theme }) => theme.color.contentMuted};
  font-family: ${({ theme }) => theme.font};
`

/** Size changes since the last result, by side and price. */
const useFlashes = (side: Side, key: string) => {
  const previous = useRef(new Map<number, number>())
  const flashes = useMemo(() => {
    const out = new Map<number, "up" | "down">()
    for (const level of side.levels) {
      const before = previous.current.get(level.price)
      if (before !== undefined && before !== level.size)
        out.set(level.price, level.size > before ? "up" : "down")
    }
    return out
  }, [side])
  useEffect(() => {
    previous.current = new Map(side.levels.map((l) => [l.price, l.size]))
  }, [side, key])
  return flashes
}

type Props = {
  statements: (StatementRows | null)[]
  columns?: VisualColumns
  formats: ColumnFormats
  // A click on a level reports its price.
  onSelect?: (price: number) => void
}

export const OrderBook = ({
  statements,
  columns,
  formats,
  onSelect,
}: Props) => {
  const asks = useMemo(
    () => readSide(statements[0], columns),
    [statements, columns],
  )
  const bids = useMemo(
    () => readSide(statements[1], columns),
    [statements, columns],
  )
  const askFlashes = useFlashes(asks, "ask")
  const bidFlashes = useFlashes(bids, "bid")
  // Each refresh replays the flash on rows whose size changed.
  const tick = useRef(0)
  tick.current++

  const priceName =
    statements[0]?.columns[columnIndex(statements[0], columns?.price, 0)]?.name
  const sizeName =
    statements[0]?.columns[columnIndex(statements[0], columns?.size, 1)]?.name
  const priceFormat: ColumnFormat = (priceName && formats[priceName]) || {
    kind: "number",
  }
  const sizeFormat: ColumnFormat = (sizeName && formats[sizeName]) || {
    compact: true,
  }
  const extraName = asks.extraName ?? bids.extraName
  const extraFormat = extraName
    ? (formats[extraName] ?? { compact: true })
    : undefined
  const cols = extraName ? 3 : 2
  const maxSize = Math.max(
    ...asks.levels.map((l) => l.size),
    ...bids.levels.map((l) => l.size),
    1e-12,
  )
  const bestAsk = asks.levels[0]?.price
  const bestBid = bids.levels[0]?.price
  const spread =
    bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : null
  const mid =
    bestAsk !== undefined && bestBid !== undefined
      ? (bestAsk + bestBid) / 2
      : null

  const row = (
    level: Level,
    side: "ask" | "bid",
    best: boolean,
    flash: "up" | "down" | undefined,
  ) => (
    <Row
      key={`${side}:${level.price}:${flash ? tick.current : 0}`}
      $side={side}
      $cols={cols}
      $flash={flash ?? null}
      $best={best}
      $clickable={onSelect !== undefined}
      onClick={onSelect ? () => onSelect(level.price) : undefined}
      data-hook={`order-book-${side}`}
    >
      <Depth
        $side={side}
        style={{ width: `${(level.size / maxSize) * 100}%` }}
      />
      <span>{formatValue(level.price, priceFormat)}</span>
      <span>{formatValue(level.size, sizeFormat)}</span>
      {cols === 3 && <span>{formatValue(level.extra, extraFormat)}</span>}
    </Row>
  )

  return (
    <Root data-hook="order-book">
      <Head $cols={cols}>
        <span>Price</span>
        <span>Size</span>
        {extraName && <span>{extraName}</span>}
      </Head>
      <Half $side="ask">
        {asks.levels.length === 0 ? (
          <Empty>No asks</Empty>
        ) : (
          asks.levels.map((l, i) =>
            row(l, "ask", i === 0, askFlashes.get(l.price)),
          )
        )}
      </Half>
      <Spread>
        <span>
          Spread{" "}
          <b>{spread === null ? "—" : formatValue(spread, priceFormat)}</b>
          {spread !== null && mid
            ? ` · ${((spread / mid) * 10_000).toFixed(1)} bps`
            : ""}
        </span>
        <span>
          Mid <b>{mid === null ? "—" : formatValue(mid, priceFormat)}</b>
        </span>
      </Spread>
      <Half $side="bid">
        {bids.levels.length === 0 ? (
          <Empty>No bids</Empty>
        ) : (
          bids.levels.map((l, i) =>
            row(l, "bid", i === 0, bidFlashes.get(l.price)),
          )
        )}
      </Half>
    </Root>
  )
}

export const orderBookDrawn = (
  statements: (StatementRows | null)[],
  columns?: VisualColumns,
) => {
  const asks = readSide(statements[0], columns)
  const bids = readSide(statements[1], columns)
  return {
    drawn: { asks: asks.levels.length, bids: bids.levels.length },
    problems: [
      ...(statements.length < 2
        ? [
            {
              message:
                "An order book needs two statements: asks first, then bids.",
              severity: "error" as const,
            },
          ]
        : []),
      ...(statements[0] &&
      asks.levels.length === 0 &&
      statements[0].rows.length > 0
        ? [
            {
              message: `Asks: no price and size columns found (columns: ${statements[0].columns.map((c) => c.name).join(", ")}).`,
              severity: "error" as const,
            },
          ]
        : []),
      ...(asks.levels.length > 1 && asks.levels[0].price > asks.levels[1].price
        ? [
            {
              message:
                "Asks should come best (lowest price) first: add ORDER BY price.",
              severity: "warning" as const,
            },
          ]
        : []),
      ...(bids.levels.length > 1 && bids.levels[0].price < bids.levels[1].price
        ? [
            {
              message:
                "Bids should come best (highest price) first: add ORDER BY price DESC.",
              severity: "warning" as const,
            },
          ]
        : []),
    ],
  }
}
