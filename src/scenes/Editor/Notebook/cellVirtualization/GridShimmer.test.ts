import "../../../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import type { DqlQueryResult } from "../../../../store/notebook"
import { columnId } from "../../../../components/ResultGrid/inlineGridUtils"
import {
  columnLayoutQueryKey,
  saveNotebookColumnLayout,
} from "../notebookColumnLayoutStore"
import { displayColumnsFor } from "./GridShimmer"

const BUFFER_ID = 7

const dql = (): DqlQueryResult => ({
  type: "dql",
  query: "select * from trades",
  columns: [
    { name: "ts", type: "TIMESTAMP" },
    { name: "price", type: "DOUBLE" },
    { name: "symbol", type: "VARCHAR" },
  ],
  dataset: [["2026-01-01T00:00:00.000000Z", 1.5, "BTC-USD"]],
  count: 1,
})

const saveLayout = (
  cellId: string,
  active: DqlQueryResult,
  layout: Parameters<typeof saveNotebookColumnLayout>[3],
) =>
  saveNotebookColumnLayout(
    BUFFER_ID,
    cellId,
    columnLayoutQueryKey(active.query),
    layout,
  )

describe("displayColumnsFor", () => {
  it("keeps natural order, alignment, and sampled widths without a layout", () => {
    // Given a result with no persisted layout
    const active = dql()

    // When display columns are computed
    const cols = displayColumnsFor(active, BUFFER_ID, "cell-natural")

    // Then columns keep their natural order with content-sampled widths
    expect(cols.map((c) => c.name)).toEqual(["ts", "price", "symbol"])
    expect(cols.map((c) => c.align)).toEqual(["right", "right", "left"])
    for (const col of cols) expect(col.width).toBeGreaterThan(0)
  })

  it("orders frozen columns by the pin list, not columnOrder", () => {
    // Given a layout whose pin list was reordered independently of
    // columnOrder — ResultGrid's moveColumnToFront reorders only the pin list
    const active = dql()
    saveLayout("cell-pinned", active, {
      columnOrder: [columnId(0), columnId(1), columnId(2)],
      pinnedColumns: [columnId(1), columnId(0)],
    })

    // When display columns are computed
    const cols = displayColumnsFor(active, BUFFER_ID, "cell-pinned")

    // Then the frozen band follows the pin list, the rest follow columnOrder
    expect(cols.map((c) => c.name)).toEqual(["price", "ts", "symbol"])
  })

  it("prefers persisted column widths over sampling", () => {
    // Given a layout with a persisted width for one column
    const active = dql()
    saveLayout("cell-sized", active, {
      columnSizing: { [columnId(1)]: 321 },
    })

    // When display columns are computed
    const cols = displayColumnsFor(active, BUFFER_ID, "cell-sized")

    // Then the persisted width wins and the rest fall back to sampling
    expect(cols[1].width).toBe(321)
    expect(cols[0].width).toBeGreaterThan(0)
  })

  it("drops layout ids that no longer exist in the result", () => {
    // Given a stale layout pointing at a column the result no longer has
    const active = dql()
    saveLayout("cell-stale", active, {
      columnOrder: [columnId(9), columnId(2)],
      pinnedColumns: [columnId(9)],
    })

    // When display columns are computed
    const cols = displayColumnsFor(active, BUFFER_ID, "cell-stale")

    // Then the unknown id is gone and every real column is present
    expect(cols.map((c) => c.name)).toEqual(["symbol", "ts", "price"])
  })

  it("returns no columns when the result is not in memory", () => {
    // Given a cell whose result has not hydrated yet
    // When display columns are computed without a result
    const cols = displayColumnsFor(undefined, BUFFER_ID, "cell-lazy")

    // Then the shimmer falls back to its generic silhouette
    expect(cols).toEqual([])
  })
})
