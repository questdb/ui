import React, { useEffect, useRef, useState } from "react"
import { clamp } from "../../utils/clamp"

const DRAG_THRESHOLD_PX = 4
const EDGE_ZONE_PX = 40
const MAX_SCROLL_SPEED_PX = 8

export type RowDragState = {
  id: number
  fromIndex: number
  toIndex: number
  offsetY: number
  rowHeight: number
}

type Options = {
  listRef: React.RefObject<HTMLElement>
  // Changes when the rows change. A drag in progress is cancelled then: its
  // indices no longer match the rows.
  rowsKey: string
  rowCount: number
  onReorder: (id: number, fromIndex: number, toIndex: number) => void
}

type PendingDrag = {
  id: number
  index: number
  startY: number
  pointerId: number
  rowHeight: number
  grabOffset: number
}

const scrollParentOf = (element: HTMLElement): HTMLElement | null => {
  let node = element.parentElement
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
    node = node.parentElement
  }
  return null
}

export const useRowDrag = ({
  listRef,
  rowsKey,
  rowCount,
  onReorder,
}: Options) => {
  const [drag, setDrag] = useState<RowDragState | null>(null)
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<RowDragState | null>(null)
  const droppedRef = useRef(false)
  const pointerYRef = useRef(0)
  const scrollFrameRef = useRef<number | null>(null)
  const optionsRef = useRef({ rowCount, onReorder })

  const stopAutoScroll = () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
  }

  useEffect(() => {
    optionsRef.current = { rowCount, onReorder }
  }, [rowCount, onReorder])

  useEffect(() => {
    if (!pendingRef.current) return
    stopAutoScroll()
    pendingRef.current = null
    dragRef.current = null
    setDrag(null)
  }, [rowsKey])

  useEffect(() => {
    const positionRow = () => {
      const pending = pendingRef.current
      const list = listRef.current
      if (!pending || !list) return
      const { rowCount } = optionsRef.current
      const { rowHeight, index, grabOffset } = pending
      const listTop = list.getBoundingClientRect().top
      const rowTop = pointerYRef.current - grabOffset - listTop
      const toIndex = clamp(Math.round(rowTop / rowHeight), 0, rowCount - 1)
      const offsetY = clamp(
        rowTop - index * rowHeight,
        -index * rowHeight,
        (rowCount - 1 - index) * rowHeight,
      )
      const next: RowDragState = {
        id: pending.id,
        fromIndex: index,
        toIndex,
        offsetY,
        rowHeight,
      }
      dragRef.current = next
      setDrag(next)
    }

    const autoScrollTick = () => {
      const list = listRef.current
      const scroller = list ? scrollParentOf(list) : null
      if (!scroller || !dragRef.current) return
      const rect = scroller.getBoundingClientRect()
      const fromTop = pointerYRef.current - rect.top
      const fromBottom = rect.bottom - pointerYRef.current
      let speed = 0
      if (fromTop < EDGE_ZONE_PX && scroller.scrollTop > 0) {
        speed = -MAX_SCROLL_SPEED_PX * (1 - Math.max(fromTop, 0) / EDGE_ZONE_PX)
      } else if (
        fromBottom < EDGE_ZONE_PX &&
        scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight
      ) {
        speed =
          MAX_SCROLL_SPEED_PX * (1 - Math.max(fromBottom, 0) / EDGE_ZONE_PX)
      }
      if (speed !== 0) {
        scroller.scrollTop += speed
        positionRow()
      }
      scrollFrameRef.current = window.requestAnimationFrame(autoScrollTick)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      pointerYRef.current = event.clientY
      if (
        !dragRef.current &&
        Math.abs(event.clientY - pending.startY) < DRAG_THRESHOLD_PX
      ) {
        return
      }
      if (!dragRef.current) {
        scrollFrameRef.current = window.requestAnimationFrame(autoScrollTick)
      }
      positionRow()
    }

    const end = (event: PointerEvent, commit: boolean) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      stopAutoScroll()
      const finished = dragRef.current
      pendingRef.current = null
      dragRef.current = null
      droppedRef.current = finished !== null
      setDrag(null)
      if (commit && finished && finished.fromIndex !== finished.toIndex) {
        optionsRef.current.onReorder(
          finished.id,
          finished.fromIndex,
          finished.toIndex,
        )
      }
    }
    const handlePointerUp = (event: PointerEvent) => end(event, true)
    const handlePointerCancel = (event: PointerEvent) => end(event, false)

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      stopAutoScroll()
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
      document.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [listRef])

  const startDrag = (
    id: number,
    index: number,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    const row = listRef.current?.children.item(index)
    if (event.button !== 0 || pendingRef.current || !row) return
    event.preventDefault()
    const rect = row.getBoundingClientRect()
    pointerYRef.current = event.clientY
    pendingRef.current = {
      id,
      index,
      startY: event.clientY,
      pointerId: event.pointerId,
      rowHeight: rect.height,
      grabOffset: event.clientY - rect.top,
    }
  }

  const consumeDrop = () => {
    const dropped = droppedRef.current
    droppedRef.current = false
    return dropped
  }

  return { drag, startDrag, consumeDrop }
}
