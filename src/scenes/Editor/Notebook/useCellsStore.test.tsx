// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import { useCellsStore } from "./useCellsStore"

describe("cells store", () => {
  it("saves a drawer's fields together and removes the ones it cleared", () => {
    // Given a cell with formats and interactions
    const cell = {
      id: "c",
      value: "SELECT 1",
      position: 0,
      formats: { x: { decimals: 1 } },
      interactions: { click: { variable: "v" } },
    } as NotebookCell
    const persistCells = vi.fn()
    const { result } = renderHook(() =>
      useCellsStore({
        initialCells: [cell],
        persistCells,
        onCellsChange: () => undefined,
      }),
    )

    // When a save sets the chart and clears the interactions
    act(() =>
      result.current.setCellSettings("c", {
        chartConfig: { xColumn: null, queries: [] },
        formats: { x: { decimals: 2 } },
        interactions: undefined,
      }),
    )

    // Then
    const saved = result.current.cells[0]
    expect(saved.chartConfig).toEqual({ xColumn: null, queries: [] })
    expect(saved.formats).toEqual({ x: { decimals: 2 } })
    expect("interactions" in saved).toBe(false)
  })
})
