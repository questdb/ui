import React, { useEffect, useRef, useState } from "react"
import { clamp } from "../../utils/clamp"
import { closestSlotIndex } from "./tabLayout"

const DRAG_THRESHOLD_PX = 4
const EDGE_ZONE_PX = 50
const MAX_SCROLL_SPEED_PX = 10

export type TabDragState = {
  id: string
  fromIndex: number
  toIndex: number
  x: number
}

type Layout = {
  positions: number[]
  widths: number[]
  totalWidth: number
  lastReorderableIndex: number
}

type Callbacks = {
  onReorder: (id: string, fromIndex: number, toIndex: number) => void
  onDragMove: () => void
}

type Options = Layout &
  Callbacks & {
    containerRef: React.RefObject<HTMLElement>
    // Changes when the reorderable tabs change. A drag in progress is
    // cancelled then: its indices no longer match the tabs.
    tabsKey: string
  }

type PendingDrag = {
  id: string
  index: number
  startX: number
  pointerId: number
}

class TabDragSession {
  private pending: PendingDrag | null = null
  private drag: TabDragState | null = null
  private pointerX = 0
  private scrollFrame: number | null = null

  constructor(
    private readonly containerRef: React.RefObject<HTMLElement>,
    private readonly getLayout: () => Layout,
    private readonly getCallbacks: () => Callbacks,
    private readonly publish: (drag: TabDragState | null) => void,
  ) {}

  start(id: string, index: number, event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || this.pending) return
    this.pending = {
      id,
      index,
      startX: event.clientX,
      pointerId: event.pointerId,
    }
    this.pointerX = event.clientX
    document.addEventListener("pointermove", this.handlePointerMove)
    document.addEventListener("pointerup", this.handlePointerUp)
    document.addEventListener("pointercancel", this.handlePointerCancel)
  }

  dispose() {
    this.stopAutoScroll()
    this.detach()
    this.pending = null
    this.drag = null
  }

  cancel() {
    if (!this.pending) return
    this.dispose()
    this.publish(null)
  }

  private detach() {
    document.removeEventListener("pointermove", this.handlePointerMove)
    document.removeEventListener("pointerup", this.handlePointerUp)
    document.removeEventListener("pointercancel", this.handlePointerCancel)
  }

  private handlePointerMove = (event: PointerEvent) => {
    const pending = this.pending
    if (!pending || event.pointerId !== pending.pointerId) return
    this.pointerX = event.clientX

    if (!this.drag) {
      if (Math.abs(event.clientX - pending.startX) < DRAG_THRESHOLD_PX) return
      this.drag = {
        id: pending.id,
        fromIndex: pending.index,
        toIndex: pending.index,
        x: 0,
      }
      this.scrollFrame = window.requestAnimationFrame(this.autoScrollTick)
    }
    this.positionDraggedTab()
  }

  private handlePointerCancel = (event: PointerEvent) => {
    this.end(event, false)
  }

  private handlePointerUp = (event: PointerEvent) => {
    this.end(event, true)
  }

  private end(event: PointerEvent, commit: boolean) {
    const pending = this.pending
    if (!pending || event.pointerId !== pending.pointerId) return
    this.detach()
    this.stopAutoScroll()
    const finished = this.drag
    this.pending = null
    this.drag = null
    this.publish(null)
    if (commit && finished && finished.fromIndex !== finished.toIndex) {
      this.getCallbacks().onReorder(
        finished.id,
        finished.fromIndex,
        finished.toIndex,
      )
    }
  }

  private positionDraggedTab() {
    const container = this.containerRef.current
    const current = this.drag
    if (!container || !current) return
    const { positions, widths, totalWidth, lastReorderableIndex } =
      this.getLayout()
    const rect = container.getBoundingClientRect()
    const tabWidth = widths[current.fromIndex] ?? 0
    const absoluteX = clamp(
      this.pointerX - rect.left + container.scrollLeft - tabWidth / 2,
      0,
      Math.max(0, totalWidth - tabWidth),
    )
    const toIndex = Math.min(
      closestSlotIndex(absoluteX, positions),
      lastReorderableIndex,
    )
    this.drag = { ...current, toIndex, x: absoluteX }
    this.publish(this.drag)
    this.getCallbacks().onDragMove()
  }

  private autoScrollTick = () => {
    const container = this.containerRef.current
    if (!container || !this.drag) return
    const rect = container.getBoundingClientRect()
    const distanceFromLeft = this.pointerX - rect.left
    const distanceFromRight = rect.right - this.pointerX
    const maxScrollLeft = this.getLayout().totalWidth - container.clientWidth
    let speed = 0
    if (distanceFromLeft < EDGE_ZONE_PX && container.scrollLeft > 0) {
      speed =
        -MAX_SCROLL_SPEED_PX *
        (1 - Math.max(distanceFromLeft, 0) / EDGE_ZONE_PX)
    } else if (
      distanceFromRight < EDGE_ZONE_PX &&
      container.scrollLeft < maxScrollLeft
    ) {
      speed =
        MAX_SCROLL_SPEED_PX *
        (1 - Math.max(distanceFromRight, 0) / EDGE_ZONE_PX)
    }
    if (speed !== 0) {
      container.scrollLeft += speed
      this.positionDraggedTab()
    }
    this.scrollFrame = window.requestAnimationFrame(this.autoScrollTick)
  }

  private stopAutoScroll() {
    if (this.scrollFrame !== null) {
      window.cancelAnimationFrame(this.scrollFrame)
      this.scrollFrame = null
    }
  }
}

export const useTabDrag = ({
  containerRef,
  tabsKey,
  positions,
  widths,
  totalWidth,
  lastReorderableIndex,
  onReorder,
  onDragMove,
}: Options) => {
  const [drag, setDrag] = useState<TabDragState | null>(null)
  const layoutRef = useRef<Layout>({
    positions,
    widths,
    totalWidth,
    lastReorderableIndex,
  })
  const callbacksRef = useRef<Callbacks>({ onReorder, onDragMove })
  const sessionRef = useRef<TabDragSession | null>(null)

  useEffect(() => {
    layoutRef.current = { positions, widths, totalWidth, lastReorderableIndex }
  }, [positions, widths, totalWidth, lastReorderableIndex])

  useEffect(() => {
    callbacksRef.current = { onReorder, onDragMove }
  }, [onReorder, onDragMove])

  useEffect(() => {
    const session = new TabDragSession(
      containerRef,
      () => layoutRef.current,
      () => callbacksRef.current,
      setDrag,
    )
    sessionRef.current = session
    return () => {
      session.dispose()
      sessionRef.current = null
    }
  }, [containerRef])

  useEffect(() => {
    sessionRef.current?.cancel()
  }, [tabsKey])

  const startDrag = (
    id: string,
    index: number,
    event: React.PointerEvent<HTMLElement>,
  ) => sessionRef.current?.start(id, index, event)

  return { drag, startDrag }
}
