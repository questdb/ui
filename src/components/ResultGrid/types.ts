import type {
  ColumnDefinition,
  Timings,
  Explain,
} from "../../utils/questdb/types"

// Neutral DQL-result shape the grid reads from, free of feature-specific
// coupling so it stays reusable.
export type DqlQueryResult = {
  columns: ColumnDefinition[]
  dataset: (boolean | string | number | null)[][]
  count: number
  query: string
  timestamp?: number
  timings?: Timings
  explain?: Explain
}

export type ResultGridRow = (boolean | string | number | null)[]

export type ResultGridDataSource = {
  columns: ColumnDefinition[]
  rowCount: number
  designatedTimestamp: number
  getRow: (index: number) => ResultGridRow | undefined
  sampleRows: ResultGridRow[]
  onVisibleRowsChange?: (range: {
    firstIndex: number
    lastIndex: number
    direction: number
  }) => void
}

export const inMemoryDataSource = (
  columns: ColumnDefinition[],
  dataset: ResultGridRow[],
  designatedTimestamp = -1,
): ResultGridDataSource => ({
  columns,
  rowCount: dataset.length,
  designatedTimestamp,
  getRow: (index) => dataset[index],
  sampleRows: dataset,
})
