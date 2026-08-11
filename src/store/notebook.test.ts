import { describe, it, expect } from "vitest"
import {
  dropLegacyChartConfigs,
  migrateCellName,
  migrateImplicitChartAutoRefresh,
  migrateLegacyCellNames,
  type AutoRefresh,
  type NotebookCell,
  type NotebookViewState,
} from "./notebook"

const cell = (over: Partial<NotebookCell> & { id: string }): NotebookCell => ({
  position: 0,
  value: "",
  ...over,
})

const chart = (id: string, autoRefresh?: AutoRefresh): NotebookCell =>
  cell(
    autoRefresh === undefined
      ? { id, mode: "draw" }
      : { id, mode: "draw", autoRefresh },
  )

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

describe("migrateImplicitChartAutoRefresh", () => {
  it("stamps an explicit Auto onto implicit charts so they keep polling under the Off fallback", () => {
    // Given a legacy notebook whose charts polled through the implicit fallback
    const state: NotebookViewState = {
      cells: [chart("a"), chart("b", "5s"), cell({ id: "r", mode: "run" })],
    }

    // When the notebook loads
    const result = migrateImplicitChartAutoRefresh(state)

    // Then only the implicit chart gains the stamp; explicit and run cells
    // stay untouched
    expect(result.cells[0].autoRefresh).toBe(true)
    expect(result.cells[1].autoRefresh).toBe("5s")
    expect(result.cells[2].autoRefresh).toBeUndefined()
  })

  it("never synthesizes a notebook default", () => {
    // Given an untouched chart-only notebook
    const result = migrateImplicitChartAutoRefresh({ cells: [chart("a")] })

    // Then the chart is stamped but the notebook stays unconfigured
    expect(result.cells[0].autoRefresh).toBe(true)
    expect(result.settings?.autoRefreshDefault).toBeUndefined()
  })

  it("yields to a stored notebook default so implicit charts inherit it", () => {
    // Given a notebook whose owner chose a notebook-wide cadence
    const state: NotebookViewState = {
      cells: [chart("a")],
      settings: { autoRefreshDefault: "30s" },
    }

    // Then the migration leaves it exactly as-is
    expect(migrateImplicitChartAutoRefresh(state)).toBe(state)
  })

  it("returns the same state when nothing needs the stamp, and is idempotent", () => {
    // Given only explicit charts and run cells
    const state: NotebookViewState = {
      cells: [chart("a", false), cell({ id: "r", mode: "run" })],
    }
    expect(migrateImplicitChartAutoRefresh(state)).toBe(state)

    // And a stamped notebook does not change on a second pass
    const stamped = migrateImplicitChartAutoRefresh({ cells: [chart("b")] })
    expect(migrateImplicitChartAutoRefresh(stamped)).toBe(stamped)
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
