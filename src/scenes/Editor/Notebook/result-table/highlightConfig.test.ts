import { describe, expect, it } from "vitest"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import type {
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { cellColumnsOf, withHighlightConfig } from "./highlightConfig"

const config = (identity: string): HighlightConfig => ({
  identityColumns: [identity],
  rules: [],
})

const cell = (highlightConfig?: HighlightConfig): NotebookCell => ({
  id: "c",
  position: 0,
  value: "SELECT 1; SELECT 2",
  highlightConfig,
})

describe("withHighlightConfig", () => {
  it("stores one config per cell and drops the field when cleared", () => {
    // Given a cell without rules
    const saved = withHighlightConfig(cell(), config("symbol"))

    // When the config is cleared
    const cleared = withHighlightConfig(saved, null)

    // Then the config is on the cell, and later the field is gone
    expect(saved.highlightConfig).toEqual(config("symbol"))
    expect("highlightConfig" in cleared).toBe(false)
  })
})

describe("cellColumnsOf", () => {
  it("lists every column of every result once, first type wins, skipping non-DQL slots", () => {
    // Given two results that share a column name with different types
    const dql = (columns: ColumnDefinition[]): SingleQueryResult =>
      ({
        type: "dql",
        query: "q",
        columns,
        dataset: [],
        timestamp: -1,
      }) as never
    const first = dql([
      { name: "symbol", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
    ])
    const second = dql([
      { name: "price", type: "STRING" },
      { name: "volume", type: "LONG" },
    ])

    // When the union is built
    const columns = cellColumnsOf([first, null, second])

    // Then each name appears once with the type first seen
    expect(columns).toEqual([
      { name: "symbol", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
      { name: "volume", type: "LONG" },
    ])
  })
})
