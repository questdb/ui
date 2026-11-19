import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import styled, { css, keyframes } from "styled-components"
import {
  formatValue,
  type ColumnFormat,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import { withAlpha } from "../../../../theme"
import { columnIndex, toNumber, type StatementRows } from "./statementRows"
import type { VisualColumns } from "../CellChart/chartTypes"

// An order book ladder: asks above, bids below, the mid price between them.
// The query does the work: statement 1 returns the asks and statement 2 the
// bids, each best level first, with price and size as the first two columns
// (or the columns named in the visual). A third column, when present, is the
// running total and also sizes the depth bars.

type Level = { price: number; size: number; total: number | null }

type Side = { levels: Level[]; totalName?: string }

const readSide = (
  rows: StatementRows | null,
  columns: VisualColumns | undefined,
): Side => {
  if (!rows) return { levels: [] }
  const priceIdx = columnIndex(rows, columns?.price, 0)
  const sizeIdx = columnIndex(rows, columns?.size, 1)
  const totalIdx = rows.columns.findIndex(
    (_, i) => i !== priceIdx && i !== sizeIdx,
  )
  if (priceIdx < 0 || sizeIdx < 0) return { levels: [] }
  let running = 0
  return {
    levels: rows.rows.flatMap((row) => {
      const price = toNumber(row[priceIdx])
      const size = toNumber(row[sizeIdx])
      if (price === null || size === null) return []
      running += size
      return [
        {
          price,
          size,
          total: totalIdx >= 0 ? (toNumber(row[totalIdx]) ?? running) : null,
        },
      ]
    }),
    totalName: totalIdx >= 0 ? rows.columns[totalIdx].name : undefined,
  }
}

const flash = keyframes`
  from { background-color: var(--row-flash); }
  to { background-color: transparent; }
`

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: ${({ theme }) => theme.font};
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Grid = css<{ $cols: number }>`
  display: grid;
  grid-template-columns: ${({ $cols }) =>
    $cols === 3 ? "1.1fr 1fr 1fr" : "1.1fr 1fr"};
  align-items: center;
  column-gap: 1.2rem;
  padding: 0 1.2rem;

  > span:not(:first-of-type) {
    text-align: right;
  }
`

const Head = styled.div<{ $cols: number }>`
  ${Grid}
  flex: 0 0 auto;
  height: 2.6rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.1rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const Ladder = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
`

const Row = styled.div<{
  $cols: number
  $side: "ask" | "bid"
  $flashing: boolean
  $clickable: boolean
}>`
  ${Grid}
  --row-flash: ${({ $side, theme }) =>
    withAlpha(
      $side === "ask" ? theme.color.chartDown : theme.color.chartUp,
      0.22,
    )};
  position: relative;
  height: 2.2rem;
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};
  ${({ $flashing }) =>
    $flashing &&
    css`
      animation: ${flash} 650ms ease-out;
    `}

  > span {
    position: relative;
    z-index: 1;
  }

  > span:first-of-type {
    color: ${({ $side, theme }) =>
      $side === "ask" ? theme.color.chartDown : theme.color.chartUp};
  }

  > span:nth-of-type(3) {
    color: ${({ theme }) => theme.color.contentSecondary};
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
  top: 1px;
  bottom: 1px;
  left: 0;
  background: ${({ $side, theme }) =>
    withAlpha(
      $side === "ask" ? theme.color.chartDown : theme.color.chartUp,
      0.13,
    )};
  transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Mid = styled.div`
  position: sticky;
  top: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.2rem;
  height: 3.6rem;
  padding: 0 1.2rem;
  align-items: center;
  background: ${({ theme }) => theme.color.surfaceInset};
  border-block: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const MidPrice = styled.span<{ $dir: "up" | "down" | null }>`
  font-size: 1.7rem;
  font-weight: 600;
  color: ${({ $dir, theme }) =>
    $dir === "up"
      ? theme.color.chartUp
      : $dir === "down"
        ? theme.color.chartDown
        : theme.color.contentPrimary};
`

const SpreadText = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.15rem;

  b {
    font-weight: 600;
    color: ${({ theme }) => theme.color.contentPrimary};
  }
`

const Empty = styled.div`
  padding: 0.8rem 1.2rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

/** Prices whose size changed since the last result. */
const useChanged = (side: Side) => {
  const previous = useRef(new Map<number, number>())
  const changed = useMemo(() => {
    const out = new Set<number>()
    for (const level of side.levels) {
      const before = previous.current.get(level.price)
      if (before !== undefined && before !== level.size) out.add(level.price)
    }
    return out
  }, [side])
  useEffect(() => {
    previous.current = new Map(side.levels.map((l) => [l.price, l.size]))
  }, [side])
  return changed
}

/** Which way the mid price moved since the last result. */
const useDirection = (mid: number | null) => {
  const previous = useRef<number | null>(null)
  const direction = useRef<"up" | "down" | null>(null)
  if (mid !== null && previous.current !== null && mid !== previous.current)
    direction.current = mid > previous.current ? "up" : "down"
  useEffect(() => {
    previous.current = mid
  }, [mid])
  return direction.current
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
  const askChanged = useChanged(asks)
  const bidChanged = useChanged(bids)
  const ladderRef = useRef<HTMLDivElement | null>(null)
  const midRef = useRef<HTMLDivElement | null>(null)
  const centred = useRef(false)
  // Each result replays the flash on the rows whose size changed.
  const generation = useRef(0)
  generation.current++

  const name = (i: number, role: "price" | "size") => {
    const rows = statements[0] ?? statements[1]
    return rows?.columns[columnIndex(rows, columns?.[role], i)]?.name
  }
  const priceName = name(0, "price")
  const sizeName = name(1, "size")
  const priceFormat: ColumnFormat = (priceName && formats[priceName]) || {
    kind: "number",
  }
  const sizeFormat: ColumnFormat = (sizeName && formats[sizeName]) || {
    compact: true,
  }
  const totalName = asks.totalName ?? bids.totalName
  const totalFormat = (totalName && formats[totalName]) || sizeFormat
  const cols = totalName ? 3 : 2
  const depthOf = (l: Level) => l.total ?? l.size
  const maxDepth = Math.max(
    ...asks.levels.map(depthOf),
    ...bids.levels.map(depthOf),
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
  const direction = useDirection(mid)

  // Start with the mid price in the middle of the ladder.
  useLayoutEffect(() => {
    const ladder = ladderRef.current
    const midRow = midRef.current
    if (centred.current || !ladder || !midRow) return
    if (asks.levels.length === 0 && bids.levels.length === 0) return
    ladder.scrollTop =
      midRow.offsetTop - ladder.clientHeight / 2 + midRow.clientHeight / 2
    centred.current = true
  }, [asks, bids])

  const row = (level: Level, side: "ask" | "bid", changed: Set<number>) => {
    const flashing = changed.has(level.price)
    return (
      <Row
        key={`${side}:${level.price}:${flashing ? generation.current : 0}`}
        $cols={cols}
        $side={side}
        $flashing={flashing}
        $clickable={onSelect !== undefined}
        onClick={onSelect ? () => onSelect(level.price) : undefined}
        data-hook={`order-book-${side}`}
      >
        <Depth
          $side={side}
          style={{ width: `${(depthOf(level) / maxDepth) * 100}%` }}
        />
        <span>{formatValue(level.price, priceFormat)}</span>
        <span>{formatValue(level.size, sizeFormat)}</span>
        {cols === 3 && <span>{formatValue(level.total, totalFormat)}</span>}
      </Row>
    )
  }

  return (
    <Root data-hook="order-book">
      <Head $cols={cols}>
        <span>Price</span>
        <span>Size</span>
        {cols === 3 && <span>Total</span>}
      </Head>
      <Ladder ref={ladderRef}>
        {asks.levels.length === 0 ? (
          <Empty>No asks</Empty>
        ) : (
          [...asks.levels].reverse().map((l) => row(l, "ask", askChanged))
        )}
        <Mid ref={midRef}>
          <MidPrice $dir={direction}>
            {mid === null ? "—" : formatValue(mid, priceFormat)}
            {direction === "up" ? " ↑" : direction === "down" ? " ↓" : ""}
          </MidPrice>
          <SpreadText>
            Spread{" "}
            <b>{spread === null ? "—" : formatValue(spread, priceFormat)}</b>
            {spread !== null && mid
              ? ` · ${((spread / mid) * 10_000).toFixed(1)} bps`
              : ""}
          </SpreadText>
        </Mid>
        {bids.levels.length === 0 ? (
          <Empty>No bids</Empty>
        ) : (
          bids.levels.map((l) => row(l, "bid", bidChanged))
        )}
      </Ladder>
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
