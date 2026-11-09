import React from "react"
import styled from "styled-components"

const LINE_HEIGHT_PX = 16

const Root = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: default;
`

const SCROLLABLE_OVERFLOW = /auto|scroll|overlay/

const canScrollBy = (element: HTMLElement, dx: number, dy: number) => {
  const { overflowX, overflowY } = getComputedStyle(element)
  const maxTop = element.scrollHeight - element.clientHeight
  const maxLeft = element.scrollWidth - element.clientWidth
  const scrollsY =
    SCROLLABLE_OVERFLOW.test(overflowY) &&
    ((dy > 0 && element.scrollTop < maxTop) ||
      (dy < 0 && element.scrollTop > 0))
  const scrollsX =
    SCROLLABLE_OVERFLOW.test(overflowX) &&
    ((dx > 0 && element.scrollLeft < maxLeft) ||
      (dx < 0 && element.scrollLeft > 0))
  return scrollsY || scrollsX
}

const scrollContainerOf = (from: Element, dx: number, dy: number) => {
  let node: Element | null = from
  while (node) {
    if (node instanceof HTMLElement && canScrollBy(node, dx, dy)) return node
    node = node.parentElement
  }
  return null
}

const LEGACY_WHEEL_FIELDS = ["wheelDelta", "wheelDeltaX", "wheelDeltaY"]

const copyLegacyWheelFields = (from: WheelEvent, to: WheelEvent) => {
  for (const field of LEGACY_WHEEL_FIELDS) {
    const value = (from as unknown as Record<string, unknown>)[field]
    if (typeof value === "number") {
      Object.defineProperty(to, field, { value })
    }
  }
}

const toPixels = (delta: number, mode: number, pageSize: number) => {
  if (mode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_HEIGHT_PX
  if (mode === WheelEvent.DOM_DELTA_PAGE) return delta * pageSize
  return delta
}

const forwardWheel = (event: React.WheelEvent<HTMLDivElement>) => {
  const overlay = event.currentTarget
  const target = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element !== overlay)
  if (!target) return

  const forwarded = new WheelEvent("wheel", {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    shiftKey: event.shiftKey,
    bubbles: true,
    cancelable: true,
  })
  copyLegacyWheelFields(event.nativeEvent, forwarded)
  const handled = !target.dispatchEvent(forwarded)
  if (handled) return

  const dx = toPixels(event.deltaX, event.deltaMode, overlay.clientWidth)
  const dy = toPixels(event.deltaY, event.deltaMode, overlay.clientHeight)
  scrollContainerOf(target, dx, dy)?.scrollBy({ left: dx, top: dy })
}

export const ReadOnlyOverlay = () => (
  <Root
    aria-hidden="true"
    data-hook="read-only-overlay"
    onWheel={forwardWheel}
  />
)
