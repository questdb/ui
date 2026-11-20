import { describe, expect, it } from "vitest"
import type { CellResult, DqlQueryResult } from "../../../../store/notebook"
import { statementResultsOf, treeFromPath } from "./statementRows"

const columns = [{ name: "price", type: "DOUBLE" }]
const select = (
  query: string,
  dataset: DqlQueryResult["dataset"],
): DqlQueryResult => ({
  type: "dql",
  query,
  columns,
  dataset,
  count: dataset.length,
})
const frame = (...results: CellResult["results"]): CellResult => ({
  results,
  activeResultIndex: 0,
  timestamp: 1,
})

const bids = "select price from bids"
const asks = "select price from asks"

describe("statement results for dashboard visuals", () => {
  it("keeps empty SQL results and failures in their original statement slots", () => {
    const result = frame(
      select(` ${asks}; `, []),
      select(bids, [[98]]),
      { type: "error", query: "select depth", error: "Missing depth" },
      { type: "error", query: "select spread", error: "Missing spread" },
    )

    expect(
      statementResultsOf(result, [asks, bids, "select depth", "select spread"]),
    ).toEqual({
      kind: "settled",
      statements: [
        { columns, rows: [] },
        { columns, rows: [[98]] },
        null,
        null,
      ],
      error: "Missing depth",
    })
  })

  it("does not draw stale, incomplete, or truncated frames", () => {
    const complete = frame(select(asks, [[102]]), select(bids, [[98]]))
    const pending = frame(select(asks, [[102]]), {
      type: "running",
      query: bids,
    })
    const truncated = frame(select(asks, [[102]]), {
      ...select(bids, [[98]]),
      truncated: true,
    })

    expect(statementResultsOf(complete, [bids, asks])).toEqual({
      kind: "waiting",
    })
    for (const result of [
      undefined,
      frame(select(asks, [[102]])),
      pending,
      truncated,
    ]) {
      expect(statementResultsOf(result, [asks, bids])).toEqual({
        kind: "waiting",
      })
    }
  })

  it("combines duplicate leaf paths without merging identically named leaves in different branches", () => {
    expect(
      treeFromPath(
        {
          columns: [],
          rows: [
            ["east", "node", 4, 0],
            ["west", "node", 2, -1],
            ["east", "node", 6, null],
            ["east", "backup", 1, 3],
          ],
        },
        [0, 1],
        2,
        3,
      ),
    ).toEqual([
      {
        name: "east",
        value: 11,
        children: [
          { name: "node", value: 10, colorValue: 0 },
          { name: "backup", value: 1, colorValue: 3 },
        ],
      },
      {
        name: "west",
        value: 2,
        children: [{ name: "node", value: 2, colorValue: -1 }],
      },
    ])
  })
})
