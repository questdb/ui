import React, { useCallback, useEffect, useRef, useState } from "react"

import type { ColumnDefinition } from "../../utils/questdb/types"
import type { CellValue } from "./types"
import { formatCellValueForCopy } from "./inlineGridUtils"
import { Box } from "../Box"
import { Tooltip } from "../Tooltip"
import {
  CellTooltipAnchor,
  CellTooltipCopyButton,
  CellTooltipNote,
  CellTooltipTextColumn,
  CellTooltipValue,
} from "./styles"

const SHOW_DELAY_MS = 700
// A preview cap: short enough that the value fits the tooltip's max-height, so
// the "+N more" note is accurate and nothing is clipped without indication.
const MAX_TOOLTIP_CHARS = 400
const TOOLTIP_MAX_WIDTH = "min(800px, 90vw)"
const CELL_ID_PATTERN = /^cell-(\d+)-(\d+)$/
const TARGET_SELECTOR =
  '[data-hook="grid-cell"], [data-hook="grid-header-name"]'

// Keeps the tooltip within the grid so it never opens into the dead zone
// outside the scroll container, where the pointer can't travel to it.
const COLLISION_PADDING_PX = 4

type Rect = { top: number; bottom: number; left: number; right: number }

type HoveredTarget = {
  fullText: string
  visibleText: string
  hiddenCharCount: number
  triggerRect: Rect
  viewport: Element
}

const toRect = (r: DOMRect): Rect => ({
  top: r.top,
  bottom: r.bottom,
  left: r.left,
  right: r.right,
})

// Radix also renders a visually-hidden aria copy of the content, so the
// popper-mounted instance is the wrapper that contains the value node.
const findTooltipContent = (): Element | null =>
  Array.from(
    document.querySelectorAll("[data-radix-popper-content-wrapper]"),
  ).find((wrapper) =>
    wrapper.querySelector('[data-hook="grid-cell-tooltip-value"]'),
  ) ?? null

// The tooltip opens a few pixels away from the trigger, so the pointer crosses
// neighbouring cells on its way into the content. Events inside the band
// between trigger and tooltip must not re-anchor or close it.
const isPointerInTransit = (
  x: number,
  y: number,
  triggerRect: Rect,
): boolean => {
  const content = findTooltipContent()
  if (!content) return false
  const contentRect = content.getBoundingClientRect()
  const bandTop = Math.min(triggerRect.bottom, contentRect.bottom)
  const bandBottom = Math.max(triggerRect.top, contentRect.top)
  const bandLeft = Math.min(triggerRect.left, contentRect.left)
  const bandRight = Math.max(triggerRect.right, contentRect.right)
  return y >= bandTop && y <= bandBottom && x >= bandLeft && x <= bandRight
}

// The full value of a cell, or the column name of a header — whichever the
// hovered element is — but only when its text is actually truncated.
const resolveTruncatedText = (
  target: HTMLElement,
  getData: (row: number, col: number) => CellValue | undefined,
  getColumn: (col: number) => ColumnDefinition | undefined,
): string | null => {
  if (target.matches('[data-hook="grid-header-name"]')) {
    if (target.scrollWidth <= target.clientWidth) return null
    return target.textContent ?? ""
  }
  const cellText = target.firstElementChild
  const match = CELL_ID_PATTERN.exec(target.id)
  if (!match || !(cellText instanceof HTMLElement)) return null
  const [, row, col] = match
  const value = getData(Number(row), Number(col))
  if (value === undefined) return null
  const fullText = formatCellValueForCopy(value, getColumn(Number(col)))
  // Most types render full text clipped by CSS; arrays are cut at format
  // time to fit the column, so the ellipsis check alone would miss them.
  const isTruncated =
    cellText.scrollWidth > cellText.clientWidth ||
    cellText.textContent !== fullText
  return isTruncated ? fullText : null
}

export const useCellHoverTooltip = (
  getData: (row: number, col: number) => CellValue | undefined,
  getColumn: (col: number) => ColumnDefinition | undefined,
) => {
  const [hovered, setHovered] = useState<HoveredTarget | null>(null)

  const hoveredTargetRef = useRef<Element | null>(null)
  const showTimeoutRef = useRef<number>()

  const hideTooltip = useCallback(() => {
    window.clearTimeout(showTimeoutRef.current)
    hoveredTargetRef.current = null
    setHovered(null)
  }, [])

  const showTooltipForTarget = useCallback(
    (target: HTMLElement) => {
      const viewport = target.closest('[data-hook="grid-viewport"]')
      if (!target.isConnected || !viewport) return
      const fullText = resolveTruncatedText(target, getData, getColumn)
      if (fullText === null) return
      // Leading/trailing whitespace (e.g. newlines wrapping a view's SQL) would
      // render as blank lines under pre-wrap; trim it for display while copy
      // still yields the raw value.
      const displayText = fullText.trim()
      if (!displayText) return
      setHovered({
        fullText,
        visibleText: displayText.slice(0, MAX_TOOLTIP_CHARS),
        hiddenCharCount: Math.max(0, displayText.length - MAX_TOOLTIP_CHARS),
        triggerRect: toRect(target.getBoundingClientRect()),
        viewport,
      })
    },
    [getData, getColumn],
  )

  const onMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element
      // Content events bubble here through the React portal.
      if (target.closest("[data-radix-popper-content-wrapper]")) return
      const next = target.closest(TARGET_SELECTOR)
      if (next === hoveredTargetRef.current) return
      if (
        hovered &&
        isPointerInTransit(e.clientX, e.clientY, hovered.triggerRect)
      )
        return
      hideTooltip()
      if (!(next instanceof HTMLElement)) return
      hoveredTargetRef.current = next
      showTimeoutRef.current = window.setTimeout(
        () => showTooltipForTarget(next),
        SHOW_DELAY_MS,
      )
    },
    [hovered, hideTooltip, showTooltipForTarget],
  )

  // Leaving the viewport toward the tooltip must keep it open; the content's
  // own pointer tracking closes it once the pointer leaves the content too.
  const onMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      if (hovered) {
        const contentRect = findTooltipContent()?.getBoundingClientRect()
        const insideContent =
          contentRect &&
          e.clientX >= contentRect.left &&
          e.clientX <= contentRect.right &&
          e.clientY >= contentRect.top &&
          e.clientY <= contentRect.bottom
        if (
          insideContent ||
          isPointerInTransit(e.clientX, e.clientY, hovered.triggerRect)
        ) {
          return
        }
      }
      hideTooltip()
    },
    [hovered, hideTooltip],
  )

  useEffect(() => {
    hideTooltip()
  }, [getData, getColumn, hideTooltip])

  useEffect(() => () => window.clearTimeout(showTimeoutRef.current), [])

  const overlay = hovered ? (
    <Tooltip
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) hideTooltip()
      }}
      maxWidth={TOOLTIP_MAX_WIDTH}
      placement="bottom"
      collisionBoundary={hovered.viewport}
      collisionPadding={COLLISION_PADDING_PX}
      hoverBridge
      content={
        <Box gap="1rem" align="center">
          <CellTooltipTextColumn>
            <CellTooltipValue data-hook="grid-cell-tooltip-value">
              {hovered.visibleText}
            </CellTooltipValue>
            {hovered.hiddenCharCount > 0 && (
              <CellTooltipNote>
                +{hovered.hiddenCharCount.toLocaleString()} more characters
              </CellTooltipNote>
            )}
          </CellTooltipTextColumn>
          <CellTooltipCopyButton text={hovered.fullText} />
        </Box>
      }
    >
      <CellTooltipAnchor
        data-hook="grid-cell-tooltip-anchor"
        style={{
          left: hovered.triggerRect.left,
          top: hovered.triggerRect.top,
          width: hovered.triggerRect.right - hovered.triggerRect.left,
          height: hovered.triggerRect.bottom - hovered.triggerRect.top,
        }}
      />
    </Tooltip>
  ) : null

  return { overlay, onMouseOver, onMouseLeave, hideTooltip }
}
