import React from "react"
import styled from "styled-components"
import { CELL_EDITOR_LINE_HEIGHT, CELL_EDITOR_PADDING } from "../notebookUtils"
import { ShimmerBar, ShimmerSweep } from "./ShimmerBar"

// Approximate advance width of the editor's 14px monospace font.
const CHAR_WIDTH_PX = 8.4
const BAR_HEIGHT_PX = 12
const GUTTER_WIDTH_PX = 66
const GUTTER_WIDTH_COMPACT_PX = 16
const MAX_SHIMMER_LINES = 200

const Wrapper = styled.div`
  content-visibility: auto;
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding-top: ${CELL_EDITOR_PADDING.top}px;
`

const Gutter = styled.div<{ $compact: boolean }>`
  flex: 0 0
    ${({ $compact }) =>
      $compact ? GUTTER_WIDTH_COMPACT_PX : GUTTER_WIDTH_PX}px;
`

const Lines = styled.div`
  flex: 1;
  min-width: 0;
`

const LineRow = styled.div`
  display: flex;
  align-items: center;
  height: ${CELL_EDITOR_LINE_HEIGHT}px;
`

const LineBar = styled(ShimmerBar)<{ $chars: number }>`
  height: ${BAR_HEIGHT_PX}px;
  width: ${({ $chars }) => Math.round($chars * CHAR_WIDTH_PX)}px;
  max-width: 100%;
`

export const EditorShimmer = ({
  value,
  compact,
}: {
  value: string
  compact: boolean
}) => {
  const rows = value
    .split("\n")
    .slice(0, MAX_SHIMMER_LINES)
    .map((line, index) => ({
      key: `${index}:${line.length}`,
      chars: line.length,
    }))
  return (
    <Wrapper data-hook="cell-editor-shimmer" aria-hidden="true">
      <Gutter $compact={compact} />
      <Lines>
        {rows.map((row) => (
          <LineRow key={row.key}>
            {row.chars > 0 && <LineBar $chars={row.chars} />}
          </LineRow>
        ))}
      </Lines>
      <ShimmerSweep />
    </Wrapper>
  )
}
