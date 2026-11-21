import React, { useLayoutEffect, useMemo, useRef } from "react"
import styled, { css } from "styled-components"
import {
  formatValue,
  type ColumnFormat,
  type ColumnFormats,
} from "../../../../utils/formats/columnFormat"
import {
  asNumeric,
  comparableText,
  compareValues,
  differenceOf,
  midpointOf,
  type Numeric,
} from "../../../../components/ResultGrid/highlight/comparable"
import { withAlpha } from "../../../../theme"
import { columnIndex, toNumber, type StatementRows } from "./statementRows"
import type { VisualColumns } from "../CellChart/chartTypes"
import { RollingNumber } from "./RollingNumber"

// An order book ladder: asks above, bids below, the mid price between them.
// The query does the work: statement 1 returns the asks and statement 2 the
// bids, each best level first, with price and size as the first two columns
// (or the columns named in the visual). A third column, when present, is the
// running total and also sizes the depth bars.

type Level = {
  price: Numeric
  rawPrice: string | number
  size: number
  total: number | null
  selection: unknown
}

type Side = { levels: Level[]; totalName?: string; problem?: string }

const readSide = (
  rows: StatementRows | null,
  columns: VisualColumns | undefined,
  clickColumn?: string,
): Side => {
  if (!rows) return { levels: [] }
  const priceIdx = columnIndex(rows, columns?.price, 0)
  const sizeIdx = columnIndex(rows, columns?.size, 1)
  const totalIdx = rows.columns.findIndex(
    (_, i) => i !== priceIdx && i !== sizeIdx,
  )
  if (priceIdx < 0 || sizeIdx < 0) {
    const roles = [priceIdx < 0 && "price", sizeIdx < 0 && "size"]
      .filter(Boolean)
      .join(" and ")
    return { levels: [], problem: `missing ${roles} column binding.` }
  }
  const clickIdx = columnIndex(rows, clickColumn)
  let running = 0
  const levels = rows.rows.flatMap((row) => {
    const rawPrice = row[priceIdx]
    if (typeof rawPrice !== "string" && typeof rawPrice !== "number") return []
    const price = asNumeric(rawPrice)
    const size = toNumber(row[sizeIdx])
    if (price === null || size === null) return []
    running += size
    return [
      {
        price,
        rawPrice,
        size,
        selection: clickColumn === undefined ? rawPrice : row[clickIdx],
        total: totalIdx >= 0 ? (toNumber(row[totalIdx]) ?? running) : null,
      },
    ]
  })
  return {
    levels,
    totalName: totalIdx >= 0 ? rows.columns[totalIdx].name : undefined,
    ...(levels.length === 0 && rows.rows.length > 0
      ? { problem: "no rows with valid price and size." }
      : {}),
  }
}

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
  $clickable: boolean
}>`
  ${Grid}
  position: relative;
  height: 2.2rem;
  cursor: ${({ $clickable }) => ($clickable ? "pointer" : "default")};
  width: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.contentAccent};
    outline-offset: -1px;
  }

  > span {
    position: relative;
    z-index: 1;
  }

  > span:first-of-type {
    color: ${({ $side, theme }) =>
      theme.mode === "light"
        ? $side === "ask"
          ? theme.color.dataNegative
          : theme.color.dataPositive
        : $side === "ask"
          ? theme.color.chartDown
          : theme.color.chartUp};
  }

  > span:nth-of-type(3) {
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
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

const MidPrice = styled.span`
  font-size: 1.7rem;
  font-weight: 600;
  white-space: nowrap;

  [data-direction="up"] {
    color: ${({ theme }) => theme.color.chartUp};
  }

  [data-direction="down"] {
    color: ${({ theme }) => theme.color.chartDown};
  }
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

type Props = {
  statements: (StatementRows | null)[]
  statementErrors?: (string | null)[]
  columns?: VisualColumns
  formats: ColumnFormats
  animateDigits?: boolean
  queriesKey?: string
  // Unbound clicks report price; a bound click reads from its own side.
  clickColumn?: string
  onSelect?: (value: unknown) => void
}

export const OrderBook = ({
  statements,
  statementErrors,
  columns,
  formats,
  animateDigits = false,
  queriesKey,
  clickColumn,
  onSelect,
}: Props) => {
  const asks = useMemo(
    () => readSide(statements[0], columns, clickColumn),
    [statements, columns, clickColumn],
  )
  const bids = useMemo(
    () => readSide(statements[1], columns, clickColumn),
    [statements, columns, clickColumn],
  )
  const ladderRef = useRef<HTMLDivElement | null>(null)
  const midRef = useRef<HTMLDivElement | null>(null)
  const centred = useRef(false)

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
    bestAsk !== undefined && bestBid !== undefined
      ? comparableText(differenceOf(bestAsk, bestBid))
      : null
  const mid =
    bestAsk !== undefined && bestBid !== undefined
      ? midpointOf(bestAsk, bestBid)
      : null
  const midText = mid === null ? "—" : comparableText(mid)
  const midNumber = Number(midText)

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

  const row = (level: Level, side: "ask" | "bid") => {
    const activate =
      onSelect && level.selection !== undefined
        ? () => onSelect(level.selection)
        : undefined
    return (
      <Row
        as={activate ? "button" : "div"}
        type={activate ? "button" : undefined}
        key={`${side}:${level.rawPrice}`}
        $cols={cols}
        $side={side}
        $clickable={activate !== undefined}
        onClick={activate}
        data-hook={`order-book-${side}`}
      >
        <Depth
          $side={side}
          style={{ width: `${(depthOf(level) / maxDepth) * 100}%` }}
        />
        <span>{formatValue(level.rawPrice, priceFormat)}</span>
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
        {statementErrors?.[0] ? (
          <Empty role="alert">Ask query failed: {statementErrors[0]}</Empty>
        ) : asks.problem ? (
          <Empty role="alert">Asks: {asks.problem}</Empty>
        ) : asks.levels.length === 0 ? (
          <Empty>No asks</Empty>
        ) : (
          [...asks.levels].reverse().map((l) => row(l, "ask"))
        )}
        <Mid ref={midRef}>
          <MidPrice data-hook="order-book-mid-price">
            <RollingNumber
              key={`${queriesKey ?? ""}:${animateDigits}`}
              value={mid}
              text={mid === null ? midText : formatValue(midText, priceFormat)}
              enabled={animateDigits}
              showDirection
            />
          </MidPrice>
          <SpreadText>
            Spread{" "}
            <b>{spread === null ? "—" : formatValue(spread, priceFormat)}</b>
            {spread !== null && midNumber
              ? ` · ${((Number(spread) / midNumber) * 10_000).toFixed(1)} bps`
              : ""}
          </SpreadText>
        </Mid>
        {statementErrors?.[1] ? (
          <Empty role="alert">Bid query failed: {statementErrors[1]}</Empty>
        ) : bids.problem ? (
          <Empty role="alert">Bids: {bids.problem}</Empty>
        ) : bids.levels.length === 0 ? (
          <Empty>No bids</Empty>
        ) : (
          bids.levels.map((l) => row(l, "bid"))
        )}
      </Ladder>
    </Root>
  )
}

export const orderBookDrawn = (
  statements: (StatementRows | null)[],
  columns?: VisualColumns,
  statementErrors?: (string | null)[],
) => {
  const asks = readSide(statements[0], columns)
  const bids = readSide(statements[1], columns)
  return {
    drawn: { asks: asks.levels.length, bids: bids.levels.length },
    problems: [
      ...(["Ask", "Bid"] as const).flatMap((side, index) => {
        const error = statementErrors?.[index]
        return error
          ? [
              {
                message: `${side} query failed: ${error}`,
                severity: "error" as const,
              },
            ]
          : []
      }),
      ...(statements.length < 2
        ? [
            {
              message:
                "An order book needs two statements: asks first, then bids.",
              severity: "error" as const,
            },
          ]
        : []),
      ...([asks, bids] as const).flatMap(({ problem }, index) =>
        problem && !statementErrors?.[index]
          ? [
              {
                message: `${index === 0 ? "Asks" : "Bids"}: ${problem}`,
                severity: "error" as const,
              },
            ]
          : [],
      ),
      ...(asks.levels.length > 1 &&
      compareValues(asks.levels[0].price, asks.levels[1].price) > 0
        ? [
            {
              message:
                "Asks should come best (lowest price) first: add ORDER BY price.",
              severity: "warning" as const,
            },
          ]
        : []),
      ...(bids.levels.length > 1 &&
      compareValues(bids.levels[0].price, bids.levels[1].price) < 0
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
