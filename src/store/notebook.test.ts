import { describe, it, expect } from "vitest"
import {
  dropLegacyChartConfigs,
  migrateCellName,
  migrateLegacyAutoRefresh,
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

describe("migrateLegacyAutoRefresh", () => {
  const overrides = (state: NotebookViewState): string[] =>
    state.cells.filter((c) => c.autoRefresh !== undefined).map((c) => c.id)

  it("adopts the shared cadence as the notebook default when every chart agrees", () => {
    // Given 10 legacy charts the user had all turned Off
    const state: NotebookViewState = {
      cells: Array.from({ length: 10 }, (_, i) => chart(`c${i}`, false)),
    }

    // When the notebook loads
    const result = migrateLegacyAutoRefresh(state)

    // Then the notebook reads Off and no chart claims to override it
    expect(result.settings?.autoRefreshDefault).toBe(false)
    expect(overrides(result)).toEqual([])
  })

  it("keeps all-adaptive charts on Auto and drops their phantom overrides", () => {
    // Given legacy AI charts, each persisted with an explicit true
    const state: NotebookViewState = {
      cells: [chart("a", true), chart("b", true), chart("c", true)],
    }

    // When the notebook loads
    const result = migrateLegacyAutoRefresh(state)

    // Then the notebook reads Auto and nothing claims to override it
    expect(result.settings?.autoRefreshDefault).toBe(true)
    expect(overrides(result)).toEqual([])
  })

  it("adopts a shared fixed interval", () => {
    const state: NotebookViewState = {
      cells: [chart("a", "5s"), chart("b", "5s")],
    }
    const result = migrateLegacyAutoRefresh(state)
    expect(result.settings?.autoRefreshDefault).toBe("5s")
    expect(overrides(result)).toEqual([])
  })

  it("keeps an override only where a chart diverges from the resulting default", () => {
    // Given legacy adaptive charts mixed with charts the user turned Off
    const state: NotebookViewState = {
      cells: [
        chart("legacy1", true),
        chart("legacy2", true),
        chart("off1", false),
        chart("off2", false),
      ],
    }

    // When the notebook loads
    const result = migrateLegacyAutoRefresh(state)

    // Then the default falls back to Auto and only the real divergence remains
    expect(result.settings?.autoRefreshDefault).toBe(true)
    expect(overrides(result)).toEqual(["off1", "off2"])
  })

  it("marks every chart an override when they diverge with no adaptive majority", () => {
    const state: NotebookViewState = {
      cells: [chart("a", false), chart("b", "5s")],
    }
    const result = migrateLegacyAutoRefresh(state)
    expect(result.settings?.autoRefreshDefault).toBe(true)
    expect(overrides(result)).toEqual(["a", "b"])
  })

  it("clears a dormant adaptive key on a run cell so it cannot inflate the count", () => {
    // Given a cell that carried an override before switching out of draw mode
    const state: NotebookViewState = {
      cells: [cell({ id: "a", mode: "run", autoRefresh: true })],
    }

    // Then the invisible key is gone, but a diverging one survives the switch
    expect(overrides(migrateLegacyAutoRefresh(state))).toEqual([])
    expect(
      overrides(
        migrateLegacyAutoRefresh({
          cells: [cell({ id: "a", mode: "run", autoRefresh: "5s" })],
        }),
      ),
    ).toEqual(["a"])
  })

  it("only decides from charts, ignoring a dormant run-cell value", () => {
    // Given every chart Off and an unrelated dormant key on a run cell
    const state: NotebookViewState = {
      cells: [
        chart("a", false),
        chart("b", false),
        cell({ id: "r", mode: "run", autoRefresh: "1m" }),
      ],
    }

    // Then the charts still set the default; the run cell does not vote
    const result = migrateLegacyAutoRefresh(state)
    expect(result.settings?.autoRefreshDefault).toBe(false)
    expect(overrides(result)).toEqual(["r"])
  })

  it("stamps the default it resolved, so a later override is never mistaken for legacy data", () => {
    // Given an untouched notebook — the one shape a deliberate override could
    // otherwise be misread as legacy
    const first = migrateLegacyAutoRefresh({ cells: [chart("a")] })
    expect(first.settings?.autoRefreshDefault).toBe(true)

    // When the user sets that single chart to Off and it loads again
    const overridden: NotebookViewState = {
      ...first,
      cells: [{ ...first.cells[0], autoRefresh: false }],
    }
    const reloaded = migrateLegacyAutoRefresh(overridden)

    // Then the override survives instead of collapsing into the default
    expect(reloaded.cells[0].autoRefresh).toBe(false)
    expect(reloaded.settings?.autoRefreshDefault).toBe(true)
  })

  it("never touches a notebook that already has a stored default", () => {
    // Given a post-upgrade notebook where the pinned cell is deliberate
    const state: NotebookViewState = {
      cells: [chart("a", true), chart("b", "5s")],
      settings: { autoRefreshDefault: "30s" },
    }

    // Then the migration leaves it exactly as-is
    expect(migrateLegacyAutoRefresh(state)).toBe(state)
  })

  it("is idempotent", () => {
    const state: NotebookViewState = {
      cells: [chart("a", false), chart("b", false)],
    }
    const once = migrateLegacyAutoRefresh(state)
    expect(migrateLegacyAutoRefresh(once)).toBe(once)
  })

  it("preserves what every chart actually polls at", () => {
    // Given a mix of stored, absent, and diverging values
    const state: NotebookViewState = {
      cells: [
        chart("a", true),
        chart("b"),
        chart("c", false),
        chart("d", "5s"),
      ],
    }
    const before = state.cells.map((c) => c.autoRefresh ?? true)

    // When migrated, each cell resolves against the new default
    const result = migrateLegacyAutoRefresh(state)
    const fallback = result.settings?.autoRefreshDefault ?? true
    const after = result.cells.map((c) => c.autoRefresh ?? fallback)

    // Then every chart polls exactly as it did before
    expect(after).toEqual(before)
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
