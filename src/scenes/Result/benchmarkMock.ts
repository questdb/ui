// Dev-only A/B benchmarking harness for the two result grids (legacy grid.js vs
// the React ResultGrid). Everything here is inert unless localStorage holds
// "mock.pagination" === "true", so a normal session is unaffected and the code
// can ship without changing behaviour. See BENCHMARK.md for the full recipe.
//
// It synthesises a result of any size (rows x cols) with zero network: one canned
// page of constant rows is built once and served for every fetch behind a fixed
// 10ms latency. That removes API/network variance and per-fetch generation cost,
// leaving the grid's render/scroll work as the only variable both grids share.
import type { ColumnDefinition } from "../../utils/questdb/types"
import type { ResultGridRow } from "../../components/ResultGrid"
import { PAGE_SIZE } from "./nextPageWindow"

const MOCK_PAGINATION_KEY = "mock.pagination"
const PAGE_LATENCY_MS = 10

export const isMockPagination = (): boolean =>
  localStorage.getItem(MOCK_PAGINATION_KEY) === "true"

export type MockSeed = {
  columns: ColumnDefinition[]
  dataset: ResultGridRow[]
  count: number
  query: string
  timestamp: number
}

let cannedPage: ResultGridRow[] = []

const buildColumns = (cols: number): ColumnDefinition[] =>
  Array.from({ length: cols }, (_, i) => {
    if (i === 0) return { name: "ts", type: "TIMESTAMP" }
    if (i % 3 === 1) return { name: `sym_${i}`, type: "SYMBOL" }
    if (i % 3 === 2) return { name: `val_${i}`, type: "DOUBLE" }
    return { name: `num_${i}`, type: "LONG" }
  })

const buildRow = (row: number, columns: ColumnDefinition[]): ResultGridRow =>
  columns.map((col, c) => {
    switch (col.type) {
      case "TIMESTAMP":
        return `2024-01-01T00:00:${String(row % 60).padStart(2, "0")}.000000Z`
      case "SYMBOL":
        return `sym_${row % 97}_${c}`
      case "DOUBLE":
        return (row + c) * 1.5
      default:
        return row * 1000 + c
    }
  })

const buildCannedPage = (columns: ColumnDefinition[]): ResultGridRow[] =>
  Array.from({ length: PAGE_SIZE }, (_, row) => buildRow(row, columns))

export const seedMock = (rows: number, cols: number): MockSeed => {
  const columns = buildColumns(cols)
  cannedPage = buildCannedPage(columns)
  return {
    columns,
    dataset: cannedPage.slice(),
    count: rows,
    query: `mock://${rows}x${cols}`,
    timestamp: 0,
  }
}

// Mirrors the real paginationFn's contract: lo is 1-based inclusive, hi is
// inclusive, so the page spans (hi - lo + 1) rows. The two-page renderer splices
// the outer array in place, so each call returns a fresh outer array of shared
// (immutable) canned rows — O(rows), not O(rows * cols).
export const mockPaginate = (
  lo: number,
  hi: number,
  rendererFn: (data: { dataset: ResultGridRow[] }) => void,
): void => {
  const rowsNeeded = Math.max(0, hi - lo + 1)
  const dataset: ResultGridRow[] = []
  while (dataset.length < rowsNeeded && cannedPage.length > 0) {
    const remaining = rowsNeeded - dataset.length
    dataset.push(
      ...(remaining >= cannedPage.length
        ? cannedPage
        : cannedPage.slice(0, remaining)),
    )
  }
  setTimeout(() => rendererFn({ dataset }), PAGE_LATENCY_MS)
}
