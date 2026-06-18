import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import type { ColumnPinningState, Header } from "@tanstack/react-table"
import type { ResultGridRow } from "./types"

type GridHeader = Header<ResultGridRow, unknown>

// Drives the freeze-handle drag: it snaps to the nearest column boundary and,
// on release, pins every column up to that boundary.
export const useFreezeDrag = (
  gridRef: React.RefObject<HTMLDivElement>,
  scrollRef: React.RefObject<HTMLDivElement>,
  headers: GridHeader[],
  frozenCount: number,
  visualLeafIds: string[],
  setColumnPinning: Dispatch<SetStateAction<ColumnPinningState>>,
  onPinnedColumnsCommit?: (pinnedLeft: string[]) => void,
) => {
  const [freezeDragX, setFreezeDragX] = useState<number | null>(null)
  const freezeTargetRef = useRef(0)

  const applyFreeze = useCallback(
    (count: number) => {
      const pinned = visualLeafIds.slice(0, count)
      setColumnPinning({ left: pinned, right: [] })
      onPinnedColumnsCommit?.(pinned)
    },
    [visualLeafIds, setColumnPinning, onPinnedColumnsCommit],
  )

  const onFreezeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const gridEl = gridRef.current
      const scrollEl = scrollRef.current
      if (!gridEl || !scrollEl) return
      const gridLeft = gridEl.getBoundingClientRect().left
      const viewportWidth = scrollEl.clientWidth
      const scrollLeft = scrollEl.scrollLeft

      // Hold the resize cursor for the whole drag — it inherits to the cells,
      // which would otherwise reset it to default as the pointer leaves the
      // handle.
      document.body.style.cursor = "col-resize"

      // Candidate k = "freeze k columns"; its boundary is fixed in the frozen
      // region but scrolls with content past it. Keep one column scrollable.
      let cumulativeWidth = 0
      const candidates: { k: number; x: number }[] = [{ k: 0, x: 0 }]
      for (let i = 0; i < headers.length - 1; i++) {
        cumulativeWidth += headers[i].getSize()
        const k = i + 1
        const x =
          k <= frozenCount ? cumulativeWidth : cumulativeWidth - scrollLeft
        if (x >= 0 && x <= viewportWidth) candidates.push({ k, x })
      }

      freezeTargetRef.current = frozenCount

      const onMove = (ev: MouseEvent) => {
        const cursorX = ev.clientX - gridLeft
        let best = candidates[0]
        for (const c of candidates) {
          if (Math.abs(c.x - cursorX) < Math.abs(best.x - cursorX)) best = c
        }
        setFreezeDragX(best.x)
        freezeTargetRef.current = best.k
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        setFreezeDragX(null)
        applyFreeze(freezeTargetRef.current)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [gridRef, scrollRef, headers, frozenCount, applyFreeze],
  )

  return { freezeDragX, onFreezeMouseDown }
}
