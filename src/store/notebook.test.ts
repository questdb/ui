import { describe, it, expect } from "vitest"
import {
  defaultHighlightRuleAppliesTo,
  dropLegacyChartConfigs,
  dropMalformedHighlightConfigs,
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

describe("dropMalformedHighlightConfigs", () => {
  const cell = (highlightConfigs: unknown): NotebookCell =>
    ({
      id: "c1",
      position: 0,
      value: "select 1",
      highlightConfigs,
    }) as NotebookCell

  it("keeps well-formed configs and drops malformed entries", () => {
    // Given a valid config, a config with a bad rule kind and a trailing null
    const ok = { identityColumns: ["symbol"], rules: [{ kind: "value" }] }
    const state: NotebookViewState = {
      cells: [
        cell([
          ok,
          { identityColumns: ["symbol"], rules: [{ kind: "nope" }] },
          null,
        ]),
      ],
    }

    // When sanitized
    const result = dropMalformedHighlightConfigs(state)

    // Then the valid entry keeps its index, the malformed one becomes null and the tail is trimmed
    expect(result.cells[0].highlightConfigs).toEqual([ok])
  })

  it("removes the field when nothing valid remains and keeps clean state untouched", () => {
    // Given a cell with only malformed configs and a cell with none
    const dirty: NotebookViewState = { cells: [cell([{ rules: "x" }])] }
    const clean: NotebookViewState = { cells: [cell(undefined)] }

    // When sanitized
    const dirtyResult = dropMalformedHighlightConfigs(dirty)
    const cleanResult = dropMalformedHighlightConfigs(clean)

    // Then the field is gone and the clean state is the same reference
    expect("highlightConfigs" in dirtyResult.cells[0]).toBe(false)
    expect(cleanResult).toBe(clean)
  })
})

describe("defaultHighlightRuleAppliesTo", () => {
  const cell = (highlightConfigs: NotebookCell["highlightConfigs"]) =>
    ({
      id: "c1",
      position: 0,
      value: "select 1",
      highlightConfigs,
    }) as NotebookCell

  it("gives older rules a cell applies-to and leaves gradients and set rules alone", () => {
    // Given a config saved before applies-to existed, next to a gradient and a row rule
    const legacy = {
      id: "v",
      enabled: true,
      target: { kind: "column", name: "price" },
      display: "always",
      kind: "value",
      condition: { op: "gt", value: 1 },
      color: "dataSeries2",
    }
    const gradient = {
      id: "g",
      enabled: true,
      target: { kind: "column", name: "amount" },
      display: "always",
      kind: "gradient",
      max: "auto",
      negativeColor: "dataNegative",
      positiveColor: "dataPositive",
    }
    const state: NotebookViewState = {
      cells: [
        cell([
          null,
          {
            identityColumns: ["symbol"],
            rules: [legacy, gradient] as never,
          },
        ]),
        cell([
          {
            identityColumns: ["symbol"],
            rules: [{ ...legacy, appliesTo: "row" }] as never,
          },
        ]),
      ],
    }

    // When defaults are applied
    const result = defaultHighlightRuleAppliesTo(state)

    // Then only the older rule changes and the already-set cell is the same reference
    expect(result.cells[0].highlightConfigs?.[1]?.rules).toEqual([
      { ...legacy, appliesTo: "cell" },
      gradient,
    ])
    expect(result.cells[0].highlightConfigs?.[0]).toBeNull()
    expect(result.cells[1]).toBe(state.cells[1])
  })
})
