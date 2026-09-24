import { describe, expect, it } from "vitest"
import type { HighlightConfig } from "../../../../components/ResultGrid/highlight"
import type {
  NotebookCell,
  NotebookViewState,
} from "../../../../store/notebook"
import { queryKeyFor } from "../queryKey"
import {
  indexLegacyHighlightConfigs,
  withHighlightConfig,
} from "./highlightConfig"

const config = (identity: string): HighlightConfig => ({
  identityColumns: [identity],
  rules: [],
})

const cell = (
  value: string,
  highlightConfigs?: NotebookCell["highlightConfigs"],
): NotebookCell => ({ id: "c", position: 0, value, highlightConfigs })

describe("withHighlightConfig", () => {
  it("binds a config to its statement index and keeps it when the statement text changes", () => {
    // Given a two-statement cell with rules on the second statement
    const saved = withHighlightConfig(
      cell("SELECT 1; SELECT 2"),
      1,
      config("symbol"),
    )

    // When the second statement is edited
    const edited = { ...saved, value: "SELECT 1; SELECT 2, 3" }

    // Then the rules still sit at index 1, padded with null for the first statement
    expect(edited.highlightConfigs).toEqual([null, config("symbol")])
  })

  it("clears one statement and drops the field when no statement has rules", () => {
    // Given rules on both statements
    const both = withHighlightConfig(
      withHighlightConfig(cell("SELECT 1; SELECT 2"), 0, config("a")),
      1,
      config("b"),
    )

    // When the last one is cleared, then the first
    const lastCleared = withHighlightConfig(both, 1, null)
    const none = withHighlightConfig(lastCleared, 0, null)

    // Then the tail is trimmed and finally the field is gone
    expect(lastCleared.highlightConfigs).toEqual([config("a")])
    expect("highlightConfigs" in none).toBe(false)
  })
})

describe("indexLegacyHighlightConfigs", () => {
  it("pairs text-keyed configs with the statement of the same text and drops orphans", () => {
    // Given a notebook saved with configs keyed by statement text
    const value = "SELECT 1; SELECT 2"
    const legacy = {
      [queryKeyFor("SELECT 2")]: config("second"),
      [queryKeyFor("SELECT gone")]: config("orphan"),
    }
    const state: NotebookViewState = {
      cells: [
        cell(value, legacy as never),
        cell("SELECT 3", [config("already")]),
      ],
    }

    // When the view is migrated
    const result = indexLegacyHighlightConfigs(state)

    // Then the config lands at index 1, the orphan is gone, and indexed cells are untouched
    expect(result.cells[0].highlightConfigs).toEqual([null, config("second")])
    expect(result.cells[1]).toBe(state.cells[1])
  })
})
