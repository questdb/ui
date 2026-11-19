// @vitest-environment jsdom
import React, { useRef } from "react"
import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getHook, renderComponent } from "../../test/component"
import { useRowDrag } from "./useRowDrag"

const ROW_HEIGHT = 30
const ids = [1, 2, 3]

// jsdom has no PointerEvent; React's pointer handlers only need the fields.
class PointerEventPolyfill extends MouseEvent {
  pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
  }
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", PointerEventPolyfill)
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// The same wiring as OpenTabList: a row's click activates it unless that click
// ends a drag.
const Rows = ({ onActivate }: { onActivate: (id: number) => void }) => {
  const listRef = useRef<HTMLDivElement>(null)
  const { startDrag, consumeDrop } = useRowDrag({
    listRef,
    rowsKey: ids.join(","),
    rowCount: ids.length,
    onReorder: () => undefined,
  })
  return (
    <div ref={listRef} data-hook="list">
      {ids.map((id, index) => (
        // Like TabRow's main area: a div with the button role.
        <div
          role="button"
          tabIndex={0}
          key={id}
          data-hook={`row-${id}`}
          onPointerDown={(event) => startDrag(id, index, event)}
          onClick={() => {
            if (!consumeDrop()) onActivate(id)
          }}
          onKeyDown={() => undefined}
        />
      ))}
    </div>
  )
}

const renderRows = () => {
  const onActivate = vi.fn()
  renderComponent(<Rows onActivate={onActivate} />)
  const list = getHook("list")
  list.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  ids.forEach((id, index) => {
    getHook(`row-${id}`).getBoundingClientRect = () =>
      ({ top: index * ROW_HEIGHT, height: ROW_HEIGHT }) as DOMRect
  })
  return onActivate
}

const press = (id: number, clientY: number) =>
  fireEvent.pointerDown(getHook(`row-${id}`), {
    pointerId: 1,
    button: 0,
    clientY,
  })
const move = (clientY: number) =>
  fireEvent.pointerMove(document, { pointerId: 1, clientY })
const release = (clientY: number) =>
  fireEvent.pointerUp(document, { pointerId: 1, clientY })

describe("useRowDrag", () => {
  it("lets the next click through after a drop outside the dragged row", () => {
    // Given a row dragged past the end of the list and released there, so the
    // browser sends no click to the row
    const onActivate = renderRows()
    press(1, 5)
    move(200)
    release(200)

    // When the user then clicks another row
    press(3, 65)
    release(65)
    fireEvent.click(getHook("row-3"))

    // Then that row activates
    expect(onActivate).toHaveBeenCalledWith(3)
  })

  it("lets the next click through after a cancelled drag", () => {
    // Given a drag the browser cancels (touch scroll, lost pointer)
    const onActivate = renderRows()
    press(1, 5)
    move(50)
    fireEvent.pointerCancel(document, { pointerId: 1, clientY: 50 })

    // When the user then presses and clicks another row
    press(2, 35)
    release(35)
    fireEvent.click(getHook("row-2"))

    // Then that row activates
    expect(onActivate).toHaveBeenCalledWith(2)
  })

  it("swallows only the click that ends a drag on the row", () => {
    // Given a row dropped where it was released, so its click follows
    const onActivate = renderRows()
    press(1, 5)
    move(40)
    release(40)
    fireEvent.click(getHook("row-1"))
    expect(onActivate).not.toHaveBeenCalled()

    // When the user clicks a row next
    press(2, 35)
    release(35)
    fireEvent.click(getHook("row-2"))

    // Then it activates
    expect(onActivate).toHaveBeenCalledWith(2)
  })
})
