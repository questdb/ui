import { describe, it, expect } from "vitest"
import {
  dropLegacyChartConfigs,
  migrateCellName,
  migrateLegacyCellNames,
  type NotebookCell,
  type NotebookViewState,
} from "./notebook"

const cell = (over: Partial<NotebookCell> & { id: string }): NotebookCell => ({
  position: 0,
  value: "",
  ...over,
})

describe("migrateCellName", () => {
  it("promotes a legacy chartConfig.name to the cell name and drops the old copy", () => {
    // Given a cell whose title lives on chartConfig.name
    const input = cell({
      id: "a",
      chartConfig: {
        xColumn: "ts",
        name: "BTC price",
        queries: [{ type: "line", yColumns: ["price"] }],
      } as never,
    })

    // When the cell is migrated
    const result = migrateCellName(input)

    // Then the title becomes the cell name and chartConfig no longer carries it
    expect(result.name).toBe("BTC price")
    expect((result.chartConfig as { name?: string }).name).toBeUndefined()
  })

  it("leaves an explicit cell name untouched", () => {
    // Given a cell that already has a name and a stale chartConfig.name
    const input = cell({
      id: "a",
      name: "Mine",
      chartConfig: { xColumn: null, name: "Legacy", queries: [] } as never,
    })

    // When migrated
    // Then the explicit name wins and the cell is returned unchanged
    expect(migrateCellName(input)).toBe(input)
  })
})

describe("migrateLegacyCellNames composed with dropLegacyChartConfigs", () => {
  it("preserves the legacy name even when the chartConfig has no queries array", () => {
    // Given a pre-combine chart config (no `queries`) that still carries a title
    const state: NotebookViewState = {
      cells: [
        cell({
          id: "legacy",
          value: "SELECT 1",
          chartConfig: { name: "BTC price" } as never,
        }),
      ],
    }

    // When the load-time migration runs (name migration BEFORE the legacy drop)
    const result = dropLegacyChartConfigs(migrateLegacyCellNames(state))

    // Then the title survives as the cell name and the orphan config is dropped
    expect(result.cells[0].name).toBe("BTC price")
    expect(result.cells[0].chartConfig).toBeUndefined()
  })
})
