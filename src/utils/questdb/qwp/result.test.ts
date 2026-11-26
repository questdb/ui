import { describe, expect, it } from "vitest"
import {
  QWP_COLUMN_TYPE,
  type QwpResultBatch,
  type QwpResultColumn,
} from "@questdb/browser-client"
import { parseLimit, QwpResultCollector, timingsFromStats } from "./result"

const batch = (columns: QwpResultColumn[]) =>
  ({
    columns,
    rowCount: columns[0]?.values.length ?? 0,
  }) as unknown as QwpResultBatch

describe("parseLimit", () => {
  // /exec returns rows [lo - 1, hi) for `lo,hi`, and the first `n` for `n`.
  it.each([
    [undefined, { skipRows: 0 }],
    ["0,1000", { skipRows: 0, maxRows: 1000 }],
    ["1,1000", { skipRows: 0, maxRows: 1000 }],
    ["1001,2000", { skipRows: 1000, maxRows: 1000 }],
    ["3,5", { skipRows: 2, maxRows: 3 }],
    ["5", { skipRows: 0, maxRows: 5 }],
    ["5,", { skipRows: 4 }],
    ["3,1", { skipRows: 2, maxRows: 0 }],
    ["-3", { skipRows: 0, maxRows: 0 }],
    ["abc", { skipRows: 0 }],
    [",5", { skipRows: 0 }],
    ["3,x", { skipRows: 2 }],
  ])("reads %s as the rows /exec returns", (limit, window) => {
    expect(parseLimit(limit)).toEqual(window)
  })
})

describe("QwpResultCollector", () => {
  it("collects rows across batches as /exec cells", () => {
    const collector = new QwpResultCollector()
    collector.add(
      batch([
        { name: "x", type: QWP_COLUMN_TYPE.LONG, values: [BigInt(1), null] },
        { name: "s", type: QWP_COLUMN_TYPE.VARCHAR, values: ["a", null] },
        {
          name: "ts",
          type: QWP_COLUMN_TYPE.TIMESTAMP,
          values: [BigInt(0), BigInt(1)],
        },
      ]),
    )
    collector.add(
      batch([
        { name: "x", type: QWP_COLUMN_TYPE.LONG, values: [BigInt(3)] },
        { name: "s", type: QWP_COLUMN_TYPE.VARCHAR, values: ["c"] },
        { name: "ts", type: QWP_COLUMN_TYPE.TIMESTAMP, values: [null] },
      ]),
    )

    expect(collector.columns).toEqual([
      { name: "x", type: "LONG" },
      { name: "s", type: "VARCHAR" },
      { name: "ts", type: "TIMESTAMP" },
    ])
    expect(collector.dataset).toEqual([
      ["1", "a", "1970-01-01T00:00:00.000000Z"],
      [null, null, "1970-01-01T00:00:00.000001Z"],
      ["3", "c", null],
    ])
  })

  it("describes the columns of an empty result", () => {
    const collector = new QwpResultCollector()
    collector.add(
      batch([
        {
          name: "g",
          type: QWP_COLUMN_TYPE.GEOHASH,
          precisionBits: 10,
          values: [],
        },
        { name: "d", type: QWP_COLUMN_TYPE.DECIMAL64, scale: 2, values: [] },
      ]),
    )
    expect(collector.dataset).toEqual([])
    expect(collector.columns).toEqual([
      { name: "g", type: "GEOHASH(2c)" },
      { name: "d", type: "DECIMAL(18,2)" },
    ])
  })

  it("takes an array column's dimensions from the first array it holds", () => {
    const collector = new QwpResultCollector()
    collector.add(
      batch([
        { name: "a", type: QWP_COLUMN_TYPE.DOUBLE_ARRAY, values: [null] },
      ]),
    )
    collector.add(
      batch([
        {
          name: "a",
          type: QWP_COLUMN_TYPE.DOUBLE_ARRAY,
          values: [{ dimensions: [1, 2], values: [1, 2] }],
        },
      ]),
    )
    expect(collector.columns).toEqual([
      { name: "a", type: "ARRAY", dim: 2, elemType: "DOUBLE" },
    ])
    expect(collector.dataset).toEqual([[null], [[[1, 2]]]])
  })

  it("has no columns before a batch", () => {
    const collector = new QwpResultCollector()
    expect(collector.columns).toEqual([])
    expect(collector.dataset).toEqual([])
  })
})

describe("timingsFromStats", () => {
  it("times execution from the end of compilation, as /exec does", () => {
    expect(
      timingsFromStats(
        {
          compileNanos: BigInt(2_000),
          executeNanos: BigInt(9_000),
          countNanos: BigInt(500),
          clientWaitNanos: BigInt(100),
          jitCompiled: true,
        },
        12_000,
      ),
    ).toEqual({
      authentication: 0,
      compiler: 2_000,
      execute: 7_000,
      count: 500,
      fetch: 12_000,
    })
  })

  it("reports only the fetch time without statistics", () => {
    expect(timingsFromStats(undefined, 5)).toEqual({
      authentication: 0,
      compiler: 0,
      execute: 0,
      count: 0,
      fetch: 5,
    })
  })
})
