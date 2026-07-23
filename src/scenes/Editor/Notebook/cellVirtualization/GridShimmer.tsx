import React, { useMemo } from "react"
import styled from "styled-components"
import { color } from "../../../../utils"
import type {
  CellResult,
  DqlQueryResult,
  SingleQueryResult,
} from "../../../../store/notebook"
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from "../../../../components/ResultGrid/dimensions"
import {
  COLUMN_ID_PREFIX,
  columnId,
  formatColumnType,
  isLeftAligned,
  sampleColumnWidths,
  WIDTH_SAMPLE_ROWS,
} from "../../../../components/ResultGrid/inlineGridUtils"
import type { ResultGridRow } from "../../../../components/ResultGrid/types"
import {
  columnLayoutQueryKey,
  loadNotebookColumnLayout,
} from "../notebookColumnLayoutStore"
import { MAX_RESERVED_ROWS } from "../notebookUtils"
import { ShimmerBar, ShimmerSweep } from "./ShimmerBar"

// Mirrors the InlineResultTable chrome stack in result-table/styles.ts.
const TAB_BAR_PX = 40
const NOTIFICATION_PX = 44
const ACTIONS_BAR_PX = 36
const MAX_SHIMMER_ROWS = 20

const Wrapper = styled.div`
  content-visibility: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: ${color("backgroundLighter")};
`

const TabStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: ${TAB_BAR_PX}px;
  padding: 0 8px;
  border-bottom: 1px solid ${color("selection")};
`

const TabShimmer = styled(ShimmerBar)`
  width: 96px;
  height: 14px;
`

const StatusStrip = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: ${NOTIFICATION_PX}px;
  padding: 0 12px;
`

const StatusBar = styled(ShimmerBar)`
  width: 180px;
  height: 12px;
`

const ActionsStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: ${ACTIONS_BAR_PX}px;
  padding: 0 12px;
`

const ActionButtons = styled.div`
  display: flex;
  gap: 6px;
`

const ActionButton = styled(ShimmerBar)`
  width: 20px;
  height: 14px;
`

const QueryBar = styled(ShimmerBar)`
  width: 220px;
  height: 12px;
`

const HeaderRow = styled.div`
  display: flex;
  flex-shrink: 0;
  height: ${HEADER_HEIGHT}px;
  background: ${color("backgroundDarker")};
  border-bottom: 1px solid ${color("selection")};
`

const HeaderCell = styled.div<{ $width: number; $align: "left" | "right" }>`
  flex-shrink: 0;
  width: ${({ $width }) => $width}px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-right: 1px solid ${color("selection")};
  overflow: hidden;
  text-align: ${({ $align }) => $align};
`

const HeaderName = styled.span`
  color: ${color("cyan")};
  font-size: ${({ theme }) => theme.fontSize.md};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const HeaderType = styled.span`
  color: ${color("gray2")};
  font-size: ${({ theme }) => theme.fontSize.ms};
  text-transform: lowercase;
  white-space: nowrap;
`

const BodyRow = styled.div`
  display: flex;
  flex-shrink: 0;
  height: ${ROW_HEIGHT}px;
`

const BodyCell = styled.div<{ $width: number; $align: "left" | "right" }>`
  flex-shrink: 0;
  width: ${({ $width }) => $width}px;
  display: flex;
  align-items: center;
  justify-content: ${({ $align }) =>
    $align === "right" ? "flex-end" : "flex-start"};
  height: ${ROW_HEIGHT}px;
  padding: 0 0.6rem;
  border-right: 1px solid ${color("selection")};
  border-bottom: 1px solid ${color("selection")};
  box-sizing: border-box;
  overflow: hidden;
`

const ValueBar = styled(ShimmerBar)<{ $widthPct: number }>`
  height: 10px;
  width: ${({ $widthPct }) => $widthPct}%;
`

type DisplayColumn = {
  key: string
  name: string
  typeLabel: string
  width: number
  align: "left" | "right"
}

// Deterministic per-cell variation so rows read as data, not stripes.
const valueWidthPct = (
  row: number,
  col: number,
  align: "left" | "right",
): number => {
  const jitter = ((row * 31 + col * 17) % 5) * 6
  if (align === "right") return 30 + jitter
  return 45 + jitter
}

const activeResultOf = (result: CellResult): SingleQueryResult | undefined =>
  result.results[result.activeResultIndex] ?? result.results[0]

const tabKeysFor = (results: SingleQueryResult[]): string[] => {
  const seen = new Map<string, number>()
  return results.map((r) => {
    const count = seen.get(r.query) ?? 0
    seen.set(r.query, count + 1)
    return `tab-${r.query}-${count}`
  })
}

// Cached per dataset reference so repeated placeholder mounts of the same
// result never re-sample.
const sampledWidths = new WeakMap<object, number[]>()

const sampledWidthsFor = (active: DqlQueryResult): number[] => {
  const cached = sampledWidths.get(active.dataset)
  if (cached) return cached
  const widths = sampleColumnWidths(
    active.columns,
    active.dataset.slice(0, WIDTH_SAMPLE_ROWS) as ResultGridRow[],
  )
  sampledWidths.set(active.dataset, widths)
  return widths
}

// The live grid's width/order/pinning pipeline, so the swap shifts nothing.
// Frozen columns follow the pin list, not columnOrder — ResultGrid's
// moveColumnToFront reorders the pin list alone.
export const displayColumnsFor = (
  active: SingleQueryResult | undefined,
  bufferId: number,
  cellId: string,
): DisplayColumn[] => {
  if (active?.type !== "dql" || active.columns.length === 0) return []
  const layout = loadNotebookColumnLayout(
    bufferId,
    cellId,
    columnLayoutQueryKey(active.query),
  )
  const naturalIds = active.columns.map((_, i) => columnId(i))
  const known = new Set(naturalIds)
  const ordered = (layout?.columnOrder ?? naturalIds).filter((id) =>
    known.has(id),
  )
  const orderedSet = new Set(ordered)
  for (const id of naturalIds) {
    if (!orderedSet.has(id)) ordered.push(id)
  }
  const pinned = (layout?.pinnedColumns ?? []).filter((id) => known.has(id))
  const pinnedSet = new Set(pinned)
  const displayIds = [...pinned, ...ordered.filter((id) => !pinnedSet.has(id))]
  const sizing = layout?.columnSizing
  const needsSampling = naturalIds.some((id) => sizing?.[id] === undefined)
  const sampled = needsSampling ? sampledWidthsFor(active) : []
  return displayIds.map((id) => {
    const index = parseInt(id.slice(COLUMN_ID_PREFIX.length), 10)
    const col = active.columns[index]
    return {
      key: id,
      name: col.name,
      typeLabel: formatColumnType(col),
      width: sizing?.[id] ?? sampled[index],
      align: isLeftAligned(col.type) ? ("left" as const) : ("right" as const),
    }
  })
}

const GENERIC_COLUMN_COUNT = 4
// Fill the full reserved bottom slot (RESERVED_RESULT_BOTTOM_HEIGHT) so no
// blank strip shows under the silhouette.
const GENERIC_ROW_COUNT = MAX_RESERVED_ROWS

const GenericCell = styled.div<{ $align: "left" | "right" }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: ${({ $align }) =>
    $align === "right" ? "flex-end" : "flex-start"};
  height: ${ROW_HEIGHT}px;
  padding: 0 0.6rem;
  border-right: 1px solid ${color("selection")};
  border-bottom: 1px solid ${color("selection")};
  box-sizing: border-box;
  overflow: hidden;
`

const GenericHeaderCell = styled(GenericCell)`
  height: ${HEADER_HEIGHT}px;
  background: ${color("backgroundDarker")};
  border-bottom: none;
`

const genericAlign = (col: number): "left" | "right" =>
  col === 0 ? "left" : "right"

// The result is not in memory yet (snapshot loading, or released after a far
// scroll) — real column names/widths are unknown, so a generic silhouette
// holds the reserved space until the data lands.
const GenericGridShimmer = () => (
  <>
    <HeaderRow>
      {Array.from({ length: GENERIC_COLUMN_COUNT }, (_, col) => (
        <GenericHeaderCell key={`g${col}`} $align={genericAlign(col)}>
          <ValueBar $widthPct={valueWidthPct(0, col, genericAlign(col))} />
        </GenericHeaderCell>
      ))}
    </HeaderRow>
    {Array.from({ length: GENERIC_ROW_COUNT }, (_, row) => (
      <BodyRow key={`r${row}`}>
        {Array.from({ length: GENERIC_COLUMN_COUNT }, (_, col) => (
          <GenericCell key={`g${col}`} $align={genericAlign(col)}>
            <ValueBar
              $widthPct={valueWidthPct(row + 1, col, genericAlign(col))}
            />
          </GenericCell>
        ))}
      </BodyRow>
    ))}
  </>
)

export const GridShimmer = ({
  result,
  bufferId,
  cellId,
}: {
  result?: CellResult
  bufferId: number
  cellId: string
}) => {
  const active = result ? activeResultOf(result) : undefined
  const columns = useMemo(
    () => displayColumnsFor(active, bufferId, cellId),
    [active, bufferId, cellId],
  )
  const rowCount =
    active?.type === "dql"
      ? Math.min(active.dataset.length, MAX_SHIMMER_ROWS)
      : 0
  return (
    <Wrapper data-hook="cell-grid-shimmer" aria-hidden="true">
      {result && result.results.length > 1 && (
        <TabStrip>
          {tabKeysFor(result.results).map((key) => (
            <TabShimmer key={key} />
          ))}
        </TabStrip>
      )}
      <StatusStrip>
        <StatusBar />
      </StatusStrip>
      {!result && (
        <>
          <ActionsStrip>
            <QueryBar />
            <ActionButtons>
              <ActionButton />
              <ActionButton />
              <ActionButton />
            </ActionButtons>
          </ActionsStrip>
          <GenericGridShimmer />
        </>
      )}
      {columns.length > 0 && (
        <>
          <ActionsStrip>
            <QueryBar />
            <ActionButtons>
              <ActionButton />
              <ActionButton />
              <ActionButton />
            </ActionButtons>
          </ActionsStrip>
          <HeaderRow>
            {columns.map((c) => (
              <HeaderCell key={c.key} $width={c.width} $align={c.align}>
                <HeaderName>{c.name}</HeaderName>
                <HeaderType>{c.typeLabel}</HeaderType>
              </HeaderCell>
            ))}
          </HeaderRow>
          {Array.from({ length: rowCount }, (_, row) => (
            <BodyRow key={`r${row}`}>
              {columns.map((c, col) => (
                <BodyCell key={c.key} $width={c.width} $align={c.align}>
                  <ValueBar $widthPct={valueWidthPct(row, col, c.align)} />
                </BodyCell>
              ))}
            </BodyRow>
          ))}
        </>
      )}
      <ShimmerSweep />
    </Wrapper>
  )
}
