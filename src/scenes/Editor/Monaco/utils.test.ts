import { describe, it, expect } from "vitest"
import { _getQueriesFromText } from "./utils"

/**
 * Helper to extract query text strings from _getQueriesFromText result.
 */
const getQueries = (
  text: string,
  cursorRow: number,
  cursorCol: number,
  startRow?: number,
  startCol?: number,
) => {
  const result = _getQueriesFromText(
    text,
    { row: cursorRow, column: cursorCol },
    startRow !== undefined && startCol !== undefined
      ? { row: startRow, column: startCol }
      : undefined,
  )
  return {
    stack: result.sqlTextStack.map((item) =>
      text.substring(item.position, item.limit),
    ),
    next: result.nextSql
      ? text.substring(result.nextSql.position, result.nextSql.limit)
      : null,
    // Raw items for position verification
    rawStack: result.sqlTextStack,
    rawNext: result.nextSql,
  }
}

describe("_getQueriesFromText", () => {
  describe("basic query identification without semicolons", () => {
    it("should identify two queries without semicolons", () => {
      const text = "SELECT 1\nSELECT 2"
      // Cursor at end of text
      const result = getQueries(text, 1, 9)
      expect(result.stack).toEqual(["SELECT 1"])
      expect(result.next).toBe("SELECT 2")
    })

    it("should identify two queries with semicolons", () => {
      const text = "SELECT 1;\nSELECT 2"
      const result = getQueries(text, 1, 9)
      expect(result.stack).toEqual(["SELECT 1"])
      expect(result.next).toBe("SELECT 2")
    })

    it("should identify three queries without semicolons", () => {
      const text =
        "SELECT * FROM trades\nCREATE TABLE t1 AS (SELECT * FROM t2)\nSELECT count() FROM orders"
      // Cursor at the very end
      const result = getQueries(text, 2, 27)
      expect(result.stack.length).toBe(2)
      expect(result.stack[0]).toBe("SELECT * FROM trades")
      expect(result.stack[1]).toBe("CREATE TABLE t1 AS (SELECT * FROM t2)")
      expect(result.next).toBe("SELECT count() FROM orders")
    })

    it("should identify DROP TABLE and SELECT without semicolons", () => {
      const text = "DROP TABLE IF EXISTS t1\nSELECT * FROM t2"
      const result = getQueries(text, 1, 17)
      expect(result.stack.length + (result.next ? 1 : 0)).toBe(2)
    })
  })

  describe("incomplete SQL during editing", () => {
    it("should treat incomplete SQL as a single statement", () => {
      const text = "SELECT * FROM "
      const result = getQueries(text, 0, 15)
      expect(result.next).toContain("SELECT")
      expect(result.next).toContain("FROM")
    })

    it("should handle just SELECT keyword", () => {
      const text = "SELECT "
      const result = getQueries(text, 0, 8)
      expect(result.next).toContain("SELECT")
    })

    it("should handle incomplete WHERE clause", () => {
      const text = "SELECT * FROM trades WHERE "
      const result = getQueries(text, 0, 27)
      const allText = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ].join("")
      expect(allText).toContain("SELECT")
      expect(allText).toContain("WHERE")
    })

    it("should split valid + incomplete query with semicolons", () => {
      const text = "SELECT 1;\nSELECT * FROM "
      const result = getQueries(text, 1, 15)
      expect(result.stack).toEqual(["SELECT 1"])
      expect(result.next).toContain("SELECT * FROM")
    })

    it("should split valid + incomplete query without semicolons", () => {
      const text = "SELECT 1\nSELECT * FROM "
      // Cursor at end of text
      const result = getQueries(text, 1, 15)
      expect(result.stack).toEqual(["SELECT 1"])
      expect(result.next).toContain("SELECT * FROM")
    })
  })

  describe("incomplete SQL mixed with valid queries", () => {
    it("should handle three queries with middle incomplete (semicolons)", () => {
      const text = "SELECT 1;\nSELECT * FROM ;\nSELECT 2"
      // Cursor at end
      const result = getQueries(text, 2, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(3)
      expect(allQueries[0]).toBe("SELECT 1")
      expect(allQueries[1]).toContain("SELECT * FROM")
      expect(allQueries[2]).toBe("SELECT 2")
    })

    it("should handle incomplete WHERE + valid query (semicolons)", () => {
      const text = "SELECT * FROM trades WHERE ;\nSELECT 2"
      const result = getQueries(text, 1, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toContain("WHERE")
      expect(allQueries[1]).toBe("SELECT 2")
    })

    it("should handle incomplete WHERE + valid query (no semicolons)", () => {
      const text = "SELECT * FROM trades WHERE \nSELECT 2"
      const result = getQueries(text, 1, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toContain("WHERE")
      expect(allQueries[1]).toBe("SELECT 2")
    })

    it("should handle valid, incomplete, valid (no semicolons)", () => {
      const text = "SELECT 1\nSELECT * FROM \nSELECT 2"
      // Cursor at end
      const result = getQueries(text, 2, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(3)
      expect(allQueries[0]).toBe("SELECT 1")
      expect(allQueries[1]).toContain("SELECT * FROM")
      expect(allQueries[2]).toBe("SELECT 2")
    })
  })

  describe("CREATE TABLE AS SELECT (nested SELECT)", () => {
    it("should treat CREATE TABLE AS SELECT as a single statement", () => {
      const text = "CREATE TABLE t1 AS (\nSELECT * FROM t2\n)"
      const result = getQueries(text, 2, 2)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(1)
      expect(allQueries[0]).toContain("CREATE TABLE")
      expect(allQueries[0]).toContain("SELECT * FROM t2")
    })

    it("should handle CREATE TABLE AS SELECT + another query", () => {
      const text = "CREATE TABLE t1 AS (\nSELECT * FROM t2\n)\nSELECT 1"
      const result = getQueries(text, 3, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toContain("CREATE TABLE")
      expect(allQueries[1]).toBe("SELECT 1")
    })
  })

  describe("comments", () => {
    it("should handle comments between queries", () => {
      const text = "SELECT 1\n-- this is a comment\nSELECT 2"
      const result = getQueries(text, 2, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toBe("SELECT 1")
      expect(allQueries[1]).toBe("SELECT 2")
    })
  })

  describe("edge cases", () => {
    it("should return empty for empty input", () => {
      const result = getQueries("", 0, 1)
      expect(result.stack).toEqual([])
      expect(result.next).toBeNull()
    })

    it("should return empty for whitespace-only input", () => {
      const result = getQueries("   \n\n   ", 1, 1)
      expect(result.stack).toEqual([])
      expect(result.next).toBeNull()
    })

    it("should handle double semicolons", () => {
      const text = "SELECT 1;;\nSELECT 2"
      const result = getQueries(text, 1, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toBe("SELECT 1")
      expect(allQueries[1]).toBe("SELECT 2")
    })

    it("should handle semicolons in strings", () => {
      const text = "SELECT 'hello;world' FROM t1\nSELECT 2"
      const result = getQueries(text, 1, 9)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      expect(allQueries[0]).toBe("SELECT 'hello;world' FROM t1")
      expect(allQueries[1]).toBe("SELECT 2")
    })

    it("should handle a single complete query", () => {
      const text = "SELECT * FROM trades"
      const result = getQueries(text, 0, 21)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(1)
      expect(allQueries[0]).toBe("SELECT * FROM trades")
    })
  })

  describe("unparseable syntax (DECLARE with array subscripts)", () => {
    it("should split DECLARE + SELECT into two statements", () => {
      const text = `DECLARE
  @level := insertion_point(bids[2], bid_volume),
  @price := bids[1:4][@level]
SELECT
  md.timestamp market_time,
  @level level,
  @price market_price,
  cp.timestamp core_time,
  cp.bid_price core_price
FROM  (
  core_price
  WHERE timestamp IN today()
  AND symbol = 'GBPUSD'
  LIMIT -6
) cp
-- Match the bid to its nearest price within one second.
ASOF JOIN market_data md
ON symbol TOLERANCE 1s

SELECT *
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
LATEST ON timestamp PARTITION BY symbol`

      // Cursor on the last line
      const lastLineIndex = text.split("\n").length - 1
      const result = getQueries(text, lastLineIndex, 40)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      // First statement is the DECLARE + SELECT (parser now handles array subscripts)
      expect(allQueries[0]).toContain("DECLARE")
      expect(allQueries[0]).toContain("ASOF JOIN")
      // Second statement is the standalone SELECT
      expect(allQueries[1]).toContain("SELECT *")
      expect(allQueries[1]).toContain("LATEST ON timestamp")
    })
  })

  describe("DECLARE + WITH subquery comparison (full SQL)", () => {
    it("should split into 2 statements: DECLARE+SELECT and WITH+SELECT", () => {
      const text = `DECLARE
  @prices := asks[1],
  @volumes := asks[2],
  @best_price := @prices[1],
  @multiplier := 1.01,
  @target_price := @multiplier *  @best_price,
  @rel_vol := @volumes[
    1:insertion_point(@prices, @target_price)
  ]
SELECT timestamp, array_sum(@rel_vol) total_volume
FROM market_data
WHERE timestamp > dateadd('m', -1, now())
AND symbol='EURUSD'

WITH yesterday_range AS (
  SELECT
    dateadd('d', -1, date_trunc('day', now())) as start_time,
    date_trunc('day', now()) as end_time
),
aggregated_data AS (
  SELECT
    timestamp,
    sum(price * amount) / sum(amount) as weighted_avg_price,
    sum(amount) as interval_volume,
    sum(price * amount) as interval_notional
  FROM
    trades
  WHERE
    symbol = 'BTC-USDT'
    AND timestamp >= (
      SELECT
        start_time
      FROM
        yesterday_range
    )
    AND timestamp < (
      SELECT
        end_time
      FROM
        yesterday_range
    ) SAMPLE BY 10m
)
SELECT
  timestamp,
  weighted_avg_price,
  cumulative_notional / cumulative_volume as cumulative_weighted_avg
FROM
  aggregated_data
ORDER BY
  timestamp`

      const lastLineIndex = text.split("\n").length - 1
      const result = getQueries(text, lastLineIndex, 40)
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries.length).toBe(2)
      // First: DECLARE + SELECT
      expect(allQueries[0]).toContain("DECLARE")
      expect(allQueries[0]).toContain("array_sum")
      expect(allQueries[0]).toContain("EURUSD")
      // Second: WITH + SELECT (with subquery comparisons)
      expect(allQueries[1]).toContain("WITH")
      expect(allQueries[1]).toContain("timestamp >=")
      expect(allQueries[1]).toContain("ORDER BY")
    })
  })

  describe("cursor position handling", () => {
    it("should put query before cursor in stack", () => {
      const text = "SELECT 1;\nSELECT 2;\nSELECT 3"
      // Cursor at line 2 (0-based row=2)
      const result = getQueries(text, 2, 1)
      expect(result.stack.length).toBeGreaterThanOrEqual(2)
      expect(result.next).toBe("SELECT 3")
    })

    it("should return query at cursor as nextSql when cursor is on it", () => {
      const text = "SELECT 1\nSELECT 2"
      // Cursor on line 0, column 5 (inside first query)
      const result = getQueries(text, 0, 5)
      expect(result.next).toBe("SELECT 1")
    })
  })

  describe("start position filtering", () => {
    it("should filter queries before start position", () => {
      const text = "SELECT 1;\nSELECT 2;\nSELECT 3"
      // Start from line 1, cursor at end
      const result = getQueries(text, 2, 9, 1, 1)
      // SELECT 1 should be excluded since it's before start
      const allQueries = [
        ...result.stack,
        ...(result.next ? [result.next] : []),
      ]
      expect(allQueries).not.toContain("SELECT 1")
      expect(allQueries.length).toBe(2)
    })
  })

  describe("position correctness", () => {
    it("should have correct row/col for multi-line queries", () => {
      const text = "SELECT 1\nSELECT 2"
      const result = _getQueriesFromText(text, {
        row: 1,
        column: 9,
      })

      // First query (in stack): row 0, col 1
      if (result.sqlTextStack.length > 0) {
        const first = result.sqlTextStack[0]
        expect(first.row).toBe(0)
        expect(first.col).toBe(1)
        expect(first.position).toBe(0)
      }

      // Second query (nextSql): row 1
      if (result.nextSql) {
        expect(result.nextSql.row).toBe(1)
        expect(result.nextSql.position).toBe(9)
      }
    })

    it("should have correct endRow/endCol", () => {
      const text = "SELECT 1\nSELECT 2"
      const result = _getQueriesFromText(text, {
        row: 1,
        column: 9,
      })

      if (result.sqlTextStack.length > 0) {
        const first = result.sqlTextStack[0]
        expect(first.endRow).toBe(0)
        // endCol should be at position of '1'
        expect(first.limit).toBe(8) // "SELECT 1" is 8 chars
      }
    })
  })
})
