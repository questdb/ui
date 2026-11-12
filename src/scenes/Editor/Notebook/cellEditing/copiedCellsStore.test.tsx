// @vitest-environment jsdom
import React, { Profiler } from "react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../../../test/component"
import type { CellClipboardPayload } from "./cellClipboardPayload"
import { setCopiedCells, useCopiedCells } from "./copiedCellsStore"

const PasteButton = () => {
  const copied = useCopiedCells()
  return <span>{copied ? "can paste" : "nothing copied"}</span>
}

describe("copiedCellsStore", () => {
  it("updates every subscriber in one commit", () => {
    // Given a list notebook with a Paste Cell button between each pair of
    // its 50 cells
    let commits = 0
    renderComponent(
      <Profiler id="notebook" onRender={() => (commits += 1)}>
        {Array.from({ length: 50 }, (_, index) => (
          <PasteButton key={index} />
        ))}
      </Profiler>,
    )
    commits = 0

    // When a cell is copied from a keyboard shortcut, outside a React event
    setCopiedCells({
      cells: [],
    } as unknown as CellClipboardPayload)

    // Then the buttons update together, in one commit
    expect(commits).toBe(1)
  })
})
