import React from "react"
import { act, create } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { useNotebookTelemetry } from "./useNotebookTelemetry"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
const owner = vi.hoisted(() => ({ id: 7 }))
vi.mock("./NotebookProvider", () => ({ useNotebookBufferId: () => owner.id }))
vi.mock("../../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

describe("notebook event identity", () => {
  it("binds deferred callbacks to their owner, even after a tab switch", async () => {
    let emit!: ReturnType<typeof useNotebookTelemetry>
    const View = ({ cell }: { cell: string }) => {
      emit = useNotebookTelemetry(cell)
      return null
    }
    const renderer = create(<View cell="old-cell" />)
    const oldCallback = emit
    owner.id = 9
    act(() => renderer.update(<View cell="new-cell" />))
    await oldCallback(ConsoleEvent.NOTEBOOK_CHART_SETTINGS_SAVE, {
      chartType: "line",
    })
    expect(trackEvent).toHaveBeenLastCalledWith(
      ConsoleEvent.NOTEBOOK_CHART_SETTINGS_SAVE,
      { notebookId: 7, cellId: "old-cell", chartType: "line" },
    )
    await emit(ConsoleEvent.GRID_MARKDOWN_COPY, { source: "notebook" })
    expect(trackEvent).toHaveBeenLastCalledWith(
      ConsoleEvent.GRID_MARKDOWN_COPY,
      { notebookId: 9, cellId: "new-cell", source: "notebook" },
    )
    act(() => renderer.unmount())
  })
})
