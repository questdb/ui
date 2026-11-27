// @vitest-environment jsdom
import React, { createRef } from "react"
import { act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { NotebookCell } from "../../../../store/notebook"
import { useCellResizeOrchestration } from "./useCellResizeOrchestration"

const actions = vi.hoisted(() => ({
  updateCell: vi.fn(),
  arrange: vi.fn((_cellIds: string[], apply: () => void) => apply()),
}))

vi.mock("../NotebookProvider", () => ({
  useNotebookActions: () => actions,
  useNotebookBufferId: () => 1,
}))

const cell: NotebookCell = {
  id: "a",
  position: 0,
  value: "SELECT 1",
  topHeight: 72,
  paneView: "editor_result",
}

const probe: { orchestration?: ReturnType<typeof useCellResizeOrchestration> } =
  {}

const GridCell = () => {
  probe.orchestration = useCellResizeOrchestration({
    cell,
    layoutMode: "grid",
    isMaximized: false,
    isSplit: false,
    showBottomSlot: false,
    expectingResult: false,
    editorContainerRef: createRef(),
    resultRef: createRef(),
    getEditorContentHeight: () => null,
  })
  return null
}

describe("useCellResizeOrchestration", () => {
  it("records a grid split drag from the cell as the drag found it", () => {
    // Given a grid cell whose editor drag needs more grid rows, so the drag
    // writes the store before it ends
    renderComponent(<GridCell />)
    act(() => probe.orchestration?.splitResizeLive(300))
    expect(actions.updateCell).toHaveBeenCalledWith("a", {
      topHeight: 300,
      topResized: true,
    })

    // When the drag ends
    act(() => probe.orchestration?.splitResizeEnd(320))

    // Then the undo history gets the change from the height before the drag
    expect(actions.arrange).toHaveBeenCalledWith(["a"], expect.any(Function), {
      startCells: [cell],
    })
  })
})
