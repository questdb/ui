// @vitest-environment jsdom
import React from "react"
import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ResponsiveGridLayout, verticalCompactor } from "react-grid-layout"
import { absoluteStrategy } from "react-grid-layout/core"
import { renderComponent } from "../../../../test/component"
import { renderEdgeHandle } from "./EdgeHandle"

// react-grid-layout hands handleComponent to react-resizable, which wraps the
// returned element in react-draggable's DraggableCore. Mirrors the notebook's
// grid configuration (Notebook/index.tsx).
describe("renderEdgeHandle", () => {
  it.each(["se", "sw", "s", "e", "w"] as const)(
    "starts and stops a mouse resize on the %s handle",
    (axis) => {
      const onResizeStart = vi.fn()
      const onResizeStop = vi.fn()
      const { container } = renderComponent(
        <ResponsiveGridLayout
          width={1200}
          layouts={{ lg: [{ i: "cell", x: 2, y: 0, w: 6, h: 10 }] }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: 12 }}
          rowHeight={10}
          dragConfig={{ enabled: true, handle: ".cell-drag-handle" }}
          resizeConfig={{
            enabled: true,
            handles: [axis],
            handleComponent: renderEdgeHandle,
          }}
          compactor={verticalCompactor}
          positionStrategy={absoluteStrategy}
          onResizeStart={onResizeStart}
          onResizeStop={onResizeStop}
        >
          <div key="cell" />
        </ResponsiveGridLayout>,
      )
      const handle = container.querySelector<HTMLElement>(
        `.edge-handle[data-axis="${axis}"]`,
      )
      expect(handle).not.toBeNull()

      fireEvent.mouseDown(handle!, { button: 0, clientX: 10, clientY: 10 })
      fireEvent.mouseMove(document, { clientX: 40, clientY: 40 })
      fireEvent.mouseUp(document, { clientX: 40, clientY: 40 })

      expect(onResizeStart).toHaveBeenCalledTimes(1)
      expect(onResizeStop).toHaveBeenCalledTimes(1)
    },
  )
})
