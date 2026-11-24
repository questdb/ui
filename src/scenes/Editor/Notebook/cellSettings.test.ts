import { describe, expect, it } from "vitest"
import type { NotebookCell } from "../../../store/notebook"
import { applyCellSettings, changedSettings } from "./cellSettings"

const cell: NotebookCell = {
  id: "a",
  position: 0,
  value: "SELECT 1",
  formats: { x: { decimals: 1 } },
  gridMode: "stable",
}

describe("cell settings", () => {
  it("writes only the fields a save changed", () => {
    // Given / When / Then
    const formats = cell.formats
    expect(
      changedSettings(
        { formats, gridMode: cell.gridMode },
        { formats, gridMode: undefined },
      ),
    ).toEqual({ gridMode: undefined })
    expect(
      Object.keys(
        changedSettings(
          { formats, gridMode: cell.gridMode },
          { formats, gridMode: cell.gridMode },
        ),
      ),
    ).toEqual([])
  })

  it("keeps the cell when a patch changes nothing", () => {
    // Given / When / Then
    expect(applyCellSettings(cell, {})).toBe(cell)
    expect(
      applyCellSettings(cell, {
        formats: cell.formats,
        interactions: undefined,
      }),
    ).toBe(cell)
    const next = applyCellSettings(cell, {
      gridMode: undefined,
      interactions: { click: { variable: "v" } },
    })
    expect(next).toEqual({
      id: "a",
      position: 0,
      value: "SELECT 1",
      formats: { x: { decimals: 1 } },
      interactions: { click: { variable: "v" } },
    })
    expect("gridMode" in next).toBe(false)
  })
})
