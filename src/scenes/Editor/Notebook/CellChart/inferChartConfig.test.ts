import { describe, it, expect } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  inferChartConfig,
  isResultChartable,
  classifyColumn,
  availableChartTypes,
  groupColumns,
  MAX_DEFAULT_SERIES,
} from "./inferChartConfig"

const col = (name: string, type: string): ColumnDefinition => ({ name, type })

describe("availableChartTypes", () => {
  it("offers step types alongside line/area for temporal + numeric", () => {
    const groups = groupColumns([col("ts", "TIMESTAMP"), col("v", "DOUBLE")])
    const types = availableChartTypes(groups, false)
    expect(types).toContain("stepLine")
    expect(types).toContain("stepArea")
    expect(types).toContain("line")
  })

  it("offers line family + steps (no bars) for numeric-only x (depth charts)", () => {
    const groups = groupColumns([
      col("price", "DOUBLE"),
      col("cum_bid", "DOUBLE"),
      col("cum_ask", "DOUBLE"),
    ])
    const types = availableChartTypes(groups, false)
    expect(types).toEqual(
      expect.arrayContaining([
        "line",
        "area",
        "stepLine",
        "stepArea",
        "scatter",
      ]),
    )
    expect(types).not.toContain("bar")
    expect(types).not.toContain("stackedBar")
  })

  it("offers candlestick for temporal + 4 numeric even when columns aren't named open/high/low/close", () => {
    const groups = groupColumns([
      col("time", "TIMESTAMP"),
      col("open", "DOUBLE"),
      col("close", "DOUBLE"),
      col("lo", "DOUBLE"),
      col("hi", "DOUBLE"),
    ])
    expect(availableChartTypes(groups, false)).toContain("candlestick")
  })

  it("does not offer candlestick without a temporal axis, nor with fewer than 4 numeric", () => {
    const fourNumericNoTime = groupColumns([
      col("a", "DOUBLE"),
      col("b", "DOUBLE"),
      col("c", "DOUBLE"),
      col("d", "DOUBLE"),
    ])
    expect(availableChartTypes(fourNumericNoTime, false)).not.toContain(
      "candlestick",
    )
    const temporalThreeNumeric = groupColumns([
      col("ts", "TIMESTAMP"),
      col("a", "DOUBLE"),
      col("b", "DOUBLE"),
      col("c", "DOUBLE"),
    ])
    expect(availableChartTypes(temporalThreeNumeric, false)).not.toContain(
      "candlestick",
    )
  })
})

describe("classifyColumn", () => {
  it("identifies temporal", () => {
    expect(classifyColumn(col("ts", "TIMESTAMP"))).toBe("temporal")
    expect(classifyColumn(col("ts", "TIMESTAMP_NS"))).toBe("temporal")
    expect(classifyColumn(col("d", "DATE"))).toBe("temporal")
  })
  it("identifies numeric", () => {
    expect(classifyColumn(col("p", "DOUBLE"))).toBe("numeric")
    expect(classifyColumn(col("p", "LONG"))).toBe("numeric")
  })
  it("identifies categorical", () => {
    expect(classifyColumn(col("s", "SYMBOL"))).toBe("categorical")
    expect(classifyColumn(col("s", "VARCHAR"))).toBe("categorical")
  })
  it("flags arrays/uuid as other", () => {
    expect(classifyColumn(col("u", "UUID"))).toBe("other")
    expect(classifyColumn(col("a", "ARRAY"))).toBe("other")
  })
})

describe("isResultChartable", () => {
  it("true with at least one numeric/temporal/categorical", () => {
    expect(isResultChartable([col("p", "DOUBLE")])).toBe(true)
  })
  it("false when all columns are non-chartable", () => {
    expect(isResultChartable([col("u", "UUID"), col("b", "BINARY")])).toBe(
      false,
    )
  })
})

describe("inferChartConfig", () => {
  it("picks candlestick for OHLC + temporal", () => {
    const columns = [
      col("ts", "TIMESTAMP"),
      col("open", "DOUBLE"),
      col("high", "DOUBLE"),
      col("low", "DOUBLE"),
      col("close", "DOUBLE"),
    ]
    const config = inferChartConfig(
      columns,
      [],
      "SELECT ts, open, high, low, close FROM t SAMPLE BY 1h",
    )
    expect(config.chart.type).toBe("candlestick")
    expect(config.xColumn).toBe("ts")
    expect(config.chart.ohlc).toEqual({
      open: "open",
      high: "high",
      low: "low",
      close: "close",
    })
  })

  it("OHLC detection is case-insensitive", () => {
    const columns = [
      col("ts", "TIMESTAMP"),
      col("Open", "DOUBLE"),
      col("HIGH", "DOUBLE"),
      col("Low", "DOUBLE"),
      col("CLOSE", "DOUBLE"),
    ]
    const config = inferChartConfig(columns, [], "SELECT * FROM t")
    expect(config.chart.type).toBe("candlestick")
  })

  it("picks line for temporal + numeric without OHLC", () => {
    const columns = [col("ts", "TIMESTAMP"), col("price", "DOUBLE")]
    const config = inferChartConfig(
      columns,
      [],
      "SELECT ts, price FROM trades SAMPLE BY 1m",
    )
    expect(config.chart.type).toBe("line")
    expect(config.xColumn).toBe("ts")
    expect(config.chart.yColumns).toEqual(["price"])
    expect(config.chart.partitionByColumn).toBeUndefined()
  })

  it("auto-partitions long-format temporal + categorical + numeric", () => {
    const columns = [
      col("time", "TIMESTAMP"),
      col("symbol", "SYMBOL"),
      col("rsi_14", "DOUBLE"),
    ]
    const dataset: (string | number)[][] = [
      ["2024-01-01", "BTC-USDT", 60],
      ["2024-01-01", "ETH-USDT", 55],
      ["2024-01-02", "BTC-USDT", 62],
      ["2024-01-02", "ETH-USDT", 50],
    ]
    const config = inferChartConfig(
      columns,
      dataset,
      "SELECT time, symbol, rsi_14 FROM ...",
    )
    expect(config.chart.type).toBe("line")
    expect(config.xColumn).toBe("time")
    expect(config.chart.partitionByColumn).toBe("symbol")
    expect(config.chart.yColumns).toEqual(["rsi_14"])
  })

  it("does not auto-partition when categorical cardinality is too high", () => {
    const columns = [
      col("time", "TIMESTAMP"),
      col("trade_id", "SYMBOL"),
      col("price", "DOUBLE"),
    ]
    const dataset: (string | number)[][] = Array.from(
      { length: 50 },
      (_, i) => ["2024-01-01", `id-${i}`, i],
    )
    const config = inferChartConfig(
      columns,
      dataset,
      "SELECT time, trade_id, price FROM ...",
    )
    expect(config.chart.type).toBe("line")
    expect(config.chart.partitionByColumn).toBeUndefined()
    expect(config.chart.yColumns).toEqual(["price"])
  })

  it("picks pie for low-cardinality categorical + numeric", () => {
    const columns = [col("symbol", "SYMBOL"), col("c", "LONG")]
    const dataset: (string | number)[][] = [
      ["BTC", 10],
      ["ETH", 8],
      ["SOL", 5],
    ]
    const config = inferChartConfig(
      columns,
      dataset,
      "SELECT symbol, count() FROM trades",
    )
    expect(config.chart.type).toBe("pie")
    expect(config.xColumn).toBe("symbol")
    expect(config.chart.yColumns).toEqual(["c"])
  })

  it("picks bar for high-cardinality categorical + numeric", () => {
    const columns = [col("symbol", "SYMBOL"), col("c", "LONG")]
    const dataset: (string | number)[][] = Array.from(
      { length: 30 },
      (_, i) => [`S${i}`, i],
    )
    const config = inferChartConfig(
      columns,
      dataset,
      "SELECT symbol, count() FROM trades",
    )
    expect(config.chart.type).toBe("bar")
  })

  it("picks bar for LATEST ON snapshot", () => {
    const columns = [col("symbol", "SYMBOL"), col("price", "DOUBLE")]
    const config = inferChartConfig(
      columns,
      [
        ["BTC", 1],
        ["ETH", 2],
      ],
      "SELECT symbol, price FROM trades LATEST ON ts PARTITION BY symbol",
    )
    expect(config.chart.type).toBe("bar")
    expect(config.xColumn).toBe("symbol")
  })

  it("picks scatter when only numerics, no temporal", () => {
    const columns = [col("x", "DOUBLE"), col("y", "DOUBLE")]
    const config = inferChartConfig(columns, [], "SELECT x, y FROM t")
    expect(config.chart.type).toBe("scatter")
    expect(config.xColumn).toBe("x")
    expect(config.chart.yColumns).toEqual(["y"])
  })

  it("falls back to bar for unclassifiable shapes", () => {
    const columns = [col("u", "UUID"), col("b", "BINARY")]
    const config = inferChartConfig(columns, [], "SELECT u, b FROM t")
    expect(config.chart.type).toBe("bar")
    expect(config.xColumn).toBe("u")
    expect(config.chart.yColumns).toEqual(["b"])
  })

  it("caps default series at MAX_DEFAULT_SERIES", () => {
    const columns = [
      col("ts", "TIMESTAMP"),
      ...Array.from({ length: MAX_DEFAULT_SERIES + 4 }, (_, i) =>
        col(`m${i}`, "DOUBLE"),
      ),
    ]
    const config = inferChartConfig(columns, [], "SELECT * FROM t")
    expect(config.chart.type).toBe("line")
    expect(config.chart.yColumns).toHaveLength(MAX_DEFAULT_SERIES)
  })

  it("does not throw on empty columns", () => {
    const config = inferChartConfig([], [], "")
    expect(config.chart.type).toBe("bar")
    expect(config.xColumn).toBeNull()
    expect(config.chart.yColumns).toEqual([])
  })
})
