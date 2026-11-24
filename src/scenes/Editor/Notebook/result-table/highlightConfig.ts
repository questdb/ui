import type {
  CellInteractions,
  DqlQueryResult,
  GridMode,
  NotebookCell,
  SingleQueryResult,
} from "../../../../store/notebook"
import type { ColumnFormats } from "../../../../utils/formats/columnFormat"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  defaultIdentityColumns,
  type HighlightConfig,
} from "../../../../components/ResultGrid/highlight"
import { changedSettings, type CellSettingsPatch } from "../cellSettings"

export const resolveHighlightConfig = (
  config: HighlightConfig | undefined,
  result: DqlQueryResult,
): HighlightConfig =>
  config ?? {
    identityColumns: defaultIdentityColumns(
      result.columns,
      result.timestamp ?? -1,
    ),
    rules: [],
  }

export const comparesWithPrevious = (
  config: HighlightConfig | undefined,
): boolean =>
  config?.rules.some(
    (rule) =>
      rule.enabled && (rule.kind === "previous" || rule.kind === "newRow"),
  ) ?? false

/** What the grid settings drawer edits, from the cell's fields. */
export type GridSettings = {
  highlightConfig?: HighlightConfig
  formats?: ColumnFormats
  gridMode?: GridMode
  interactions?: CellInteractions
}

/** The same saved settings: each field the same object as before. */
export const sameGridSettings = (
  a: GridSettings | undefined,
  b: GridSettings | undefined,
): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.highlightConfig === b.highlightConfig &&
    a.formats === b.formats &&
    a.gridMode === b.gridMode &&
    a.interactions === b.interactions)

/**
 * What a grid settings save writes: the fields whose saved value it does not
 * hand back. A drawer save returns untouched fields as the saved objects.
 */
export const gridSettingsPatch = (
  saved: GridSettings,
  next: {
    highlight: HighlightConfig | null
    formats: ColumnFormats | undefined
    gridMode: GridMode | undefined
    interactions: CellInteractions | undefined
  },
): CellSettingsPatch =>
  changedSettings<CellSettingsPatch>(
    {
      highlightConfig: saved.highlightConfig,
      formats: saved.formats,
      gridMode: saved.gridMode,
      interactions: saved.interactions,
    },
    {
      highlightConfig: next.highlight ?? undefined,
      formats: next.formats,
      gridMode: next.gridMode,
      interactions: next.interactions,
    },
  )

export const withHighlightConfig = (
  cell: NotebookCell,
  config: HighlightConfig | null,
): NotebookCell => {
  if (config) return { ...cell, highlightConfig: config }
  const { highlightConfig: _dropped, ...rest } = cell
  return rest
}

// Every column any result of the cell has, once by name, so a rule can target
// a column of any statement.
export const cellColumnsOf = (
  results: (SingleQueryResult | null)[],
): ColumnDefinition[] => {
  const seen = new Set<string>()
  const columns: ColumnDefinition[] = []
  for (const result of results) {
    if (result?.type !== "dql") continue
    for (const column of result.columns) {
      if (seen.has(column.name)) continue
      seen.add(column.name)
      columns.push(column)
    }
  }
  return columns
}
