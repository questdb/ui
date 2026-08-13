import React, { useMemo } from "react"
import styled from "styled-components"
import { color } from "../../../../utils"
import type { SingleQueryResult } from "../../../../store/notebook"
import {
  CELL_BORDER_PX,
  CELL_PADDING_PX,
  HEADER_BORDER_PX,
  HEADER_COPY_BUTTON_PX,
  HEADER_GAP_PX,
  HEADER_HEIGHT,
  HEADER_NAME_FONT_SIZE_PX,
  HEADER_PADDING_PX,
  HEADER_TYPE_FONT_SIZE_PX,
  ROW_HEIGHT,
} from "../../../../components/ResultGrid/dimensions"
import {
  applyMaxColumnWidth,
  COLUMN_ID_PREFIX,
  columnId,
  formatColumnType,
  isLeftAligned,
  sampleColumnWidths,
} from "../../../../components/ResultGrid/inlineGridUtils"
import { useFontsReady } from "../../../../components/ResultGrid/useFontsReady"
import type { MaxColumnWidth } from "../../../../components/ResultGrid/types"
import { useLocalStorage } from "../../../../providers/LocalStorageProvider"
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
  padding: 0.5rem ${HEADER_PADDING_PX / 2}px;
  border-right: ${HEADER_BORDER_PX}px solid ${color("selection")};
  overflow: hidden;
  text-align: ${({ $align }) => $align};
`

// Mirrors the live header's name row, whose copy button is always laid out
// (visibility: hidden) — the same space sampleColumnWidths reserves via
// HEADER_CHROME_PX. Without it a name that fits here truncates on the swap.
const HeaderNameRow = styled.div<{ $align: "left" | "right" }>`
  display: flex;
  align-items: center;
  flex-direction: ${({ $align }) =>
    $align === "right" ? "row-reverse" : "row"};
  justify-content: flex-start;
  gap: ${HEADER_GAP_PX}px;
`

const HeaderCopyButtonSpacer = styled.div`
  flex-shrink: 0;
  width: ${HEADER_COPY_BUTTON_PX}px;
`

const HeaderName = styled.span`
  color: ${color("cyan")};
  font-size: ${HEADER_NAME_FONT_SIZE_PX}px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`

const HeaderType = styled.span`
  color: ${color("gray2")};
  font-size: ${HEADER_TYPE_FONT_SIZE_PX}px;
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
  padding: 0 ${CELL_PADDING_PX / 2}px;
  border-right: ${CELL_BORDER_PX}px solid ${color("selection")};
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

// The live grid's width/order/pinning pipeline, so the swap shifts nothing.
// Frozen columns follow the pin list, not columnOrder — ResultGrid's
// moveColumnToFront reorders the pin list alone.
export const displayColumnsFor = (
  active: SingleQueryResult | undefined,
  bufferId: number,
  cellId: string,
  maxColumnWidth: MaxColumnWidth,
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
  const sampled = needsSampling
    ? applyMaxColumnWidth(
        sampleColumnWidths(active.columns, active.dataset),
        maxColumnWidth,
      )
    : []
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
  padding: 0 ${CELL_PADDING_PX / 2}px;
  border-right: ${CELL_BORDER_PX}px solid ${color("selection")};
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

// Geometry follows the DERIVED frame: the tab strip counts statements (a
// "Not run" slot still owns a tab), and the silhouette samples whatever the
// active slot currently shows.
export const GridShimmer = ({
  statementCount,
  activeResult,
  bufferId,
  cellId,
}: {
  statementCount: number
  activeResult?: SingleQueryResult
  bufferId: number
  cellId: string
}) => {
  const { maxColumnWidth } = useLocalStorage()
  const fontsReady = useFontsReady()
  // fontsReady is a cache buster: the webfont landing invalidates every
  // measured width, so a placeholder sampled against the fallback re-samples
  // rather than holding stale widths for the life of the dataset.
  const columns = useMemo(
    () => displayColumnsFor(activeResult, bufferId, cellId, maxColumnWidth),
    [activeResult, bufferId, cellId, maxColumnWidth, fontsReady],
  )
  const rowCount =
    activeResult?.type === "dql"
      ? Math.min(activeResult.dataset.length, MAX_SHIMMER_ROWS)
      : 0
  return (
    <Wrapper data-hook="cell-grid-shimmer" aria-hidden="true">
      {statementCount > 1 && (
        <TabStrip>
          {Array.from({ length: statementCount }, (_, i) => (
            <TabShimmer key={`tab-${i}`} />
          ))}
        </TabStrip>
      )}
      <StatusStrip>
        <StatusBar />
      </StatusStrip>
      {statementCount === 0 && (
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
                <HeaderNameRow $align={c.align}>
                  <HeaderName>{c.name}</HeaderName>
                  <HeaderCopyButtonSpacer />
                </HeaderNameRow>
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
