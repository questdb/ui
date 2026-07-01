import { useState, type RefObject } from "react"
import { useWidthObserver } from "../../../../components/ResultGrid/useContainerWidth"
import { cellToolbarTier, type CellToolbarTier } from "../notebookUtils"

// Resolves the cell header's width to its toolbar tier, re-rendering only when
// the tier changes — not on every pixel of an intra-tier resize. A maximized
// cell is always expanded, regardless of width.
export const useCellToolbarTier = (
  ref: RefObject<HTMLElement>,
  isMaximized: boolean,
): CellToolbarTier => {
  const [widthTier, setWidthTier] = useState<CellToolbarTier>("expanded")
  useWidthObserver(ref, (width) =>
    setWidthTier((prev) => {
      const next = cellToolbarTier(width, false)
      return prev === next ? prev : next
    }),
  )
  return isMaximized ? "expanded" : widthTier
}
