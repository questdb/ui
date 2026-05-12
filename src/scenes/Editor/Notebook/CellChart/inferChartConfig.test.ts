import { describe, it, expect } from "vitest"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import {
  inferChartConfig,
  isResultChartable,
  classifyColumn,
} from "./inferChartConfig"

const col = (name: string, type: string): ColumnDefinition => ({ name, type })

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
    expect(config.type).toBe("candlestick")
    expect(config.xColumn).toBe("ts")
    expect(config.ohlc).toEqual({
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
    expect(config.type).toBe("candlestick")
  })

  it("picks line for temporal + numeric without OHLC", () => {
    const columns = [col("ts", "TIMESTAMP"), col("price", "DOUBLE")]
    const config = inferChartConfig(
      columns,
      [],
      "SELECT ts, price FROM trades SAMPLE BY 1m",
    )
    expect(config.type).toBe("line")
    expect(config.xColumn).toBe("ts")
    expect(config.yColumns).toEqual(["price"])
    expect(config.partitionByColumn).toBeUndefined()
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
    expect(config.type).toBe("line")
    expect(config.xColumn).toBe("time")
    expect(config.partitionByColumn).toBe("symbol")
    expect(config.yColumns).toEqual(["rsi_14"])
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
    expect(config.type).toBe("line")
    expect(config.partitionByColumn).toBeUndefined()
    expect(config.yColumns).toEqual(["price"])
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
    expect(config.type).toBe("pie")
    expect(config.xColumn).toBe("symbol")
    expect(config.yColumns).toEqual(["c"])
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
    expect(config.type).toBe("bar")
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
    expect(config.type).toBe("bar")
    expect(config.xColumn).toBe("symbol")
  })

  it("picks scatter when only numerics, no temporal", () => {
    const columns = [col("x", "DOUBLE"), col("y", "DOUBLE")]
    const config = inferChartConfig(columns, [], "SELECT x, y FROM t")
    expect(config.type).toBe("scatter")
    expect(config.xColumn).toBe("x")
    expect(config.yColumns).toEqual(["y"])
  })

  it("falls back to bar for unclassifiable shapes", () => {
    const columns = [col("u", "UUID"), col("b", "BINARY")]
    const config = inferChartConfig(columns, [], "SELECT u, b FROM t")
    expect(config.type).toBe("bar")
    expect(config.xColumn).toBe("u")
    expect(config.yColumns).toEqual(["b"])
  })

  it("caps default series at 8", () => {
    const columns = [
      col("ts", "TIMESTAMP"),
      ...Array.from({ length: 12 }, (_, i) => col(`m${i}`, "DOUBLE")),
    ]
    const config = inferChartConfig(columns, [], "SELECT * FROM t")
    expect(config.type).toBe("line")
    expect(config.yColumns).toHaveLength(8)
  })

  it("does not throw on empty columns", () => {
    const config = inferChartConfig([], [], "")
    expect(config.type).toBe("bar")
    expect(config.xColumn).toBeNull()
    expect(config.yColumns).toEqual([])
  })
})
