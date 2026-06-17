import { describe, it, expect } from "vitest"
import {
  computeColumnWidths,
  formatCellValue,
  formatCellValueForCopy,
  formatColumnType,
  isLeftAligned,
} from "./inlineGridUtils"
import type { ColumnDefinition } from "../../../../utils/questdb/types"

const col = (
  name: string,
  type: string,
  extra: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({ name, type, ...extra })

describe("isLeftAligned", () => {
  it("returns true for string-like types", () => {
    expect(isLeftAligned("STRING")).toBe(true)
    expect(isLeftAligned("SYMBOL")).toBe(true)
    expect(isLeftAligned("VARCHAR")).toBe(true)
    expect(isLeftAligned("ARRAY")).toBe(true)
  })
  it("returns true regardless of case", () => {
    expect(isLeftAligned("string")).toBe(true)
    expect(isLeftAligned("Symbol")).toBe(true)
  })
  it("returns false for numeric/timestamp/boolean types", () => {
    expect(isLeftAligned("INT")).toBe(false)
    expect(isLeftAligned("DOUBLE")).toBe(false)
    expect(isLeftAligned("TIMESTAMP")).toBe(false)
    expect(isLeftAligned("BOOLEAN")).toBe(false)
  })
})

describe("formatColumnType", () => {
  it("lowercases non-array types", () => {
    expect(formatColumnType(col("x", "INT"))).toBe("int")
    expect(formatColumnType(col("x", "TIMESTAMP"))).toBe("timestamp")
  })

  it("renders 1-D arrays as elemType[]", () => {
    expect(
      formatColumnType(col("x", "ARRAY", { dim: 1, elemType: "DOUBLE" })),
    ).toBe("double[]")
  })

  it("renders 2-D arrays as elemType[][]", () => {
    expect(
      formatColumnType(col("x", "ARRAY", { dim: 2, elemType: "DOUBLE" })),
    ).toBe("double[][]")
  })

  it("renders dim>2 arrays with numeric dim form", () => {
    expect(
      formatColumnType(col("x", "ARRAY", { dim: 3, elemType: "double" })),
    ).toBe("ARRAY(DOUBLE,3)")
  })

  it("falls back to 'unknown' when elemType is missing", () => {
    expect(formatColumnType(col("x", "ARRAY", { dim: 1 }))).toBe("unknown[]")
  })
})

describe("formatCellValue", () => {
  it("returns 'null' for null", () => {
    expect(formatCellValue(null)).toBe("null")
  })

  it("returns 'true'/'false' for booleans", () => {
    expect(formatCellValue(true)).toBe("true")
    expect(formatCellValue(false)).toBe("false")
  })

  it("returns string of number by default", () => {
    expect(formatCellValue(42)).toBe("42")
    expect(formatCellValue(3.14)).toBe("3.14")
  })

  it("adds .0 for integer-valued FLOAT/DOUBLE", () => {
    expect(formatCellValue(5, col("x", "FLOAT"))).toBe("5.0")
    expect(formatCellValue(5, col("x", "DOUBLE"))).toBe("5.0")
  })

  it("does not alter non-integer float values", () => {
    expect(formatCellValue(5.2, col("x", "FLOAT"))).toBe("5.2")
  })

  it("does not apply float suffix to non-float types", () => {
    expect(formatCellValue(5, col("x", "INT"))).toBe("5")
  })

  it("decodes HTML entities in string values", () => {
    expect(formatCellValue("a&nbsp;b", col("x", "VARCHAR"))).toBe("a\u00A0b")
    expect(formatCellValue("a&amp;b &lt;c&gt;", col("x", "STRING"))).toBe(
      "a&b <c>",
    )
  })

  it("formats 1-D array values", () => {
    expect(
      formatCellValue(
        [1, 2, 3] as unknown as number,
        col("x", "ARRAY", { dim: 1, elemType: "INT" }),
      ),
    ).toBe("ARRAY[1,2,3]")
  })

  it("adds .0 to integer elements of float arrays", () => {
    expect(
      formatCellValue(
        [1, 2] as unknown as number,
        col("x", "ARRAY", { dim: 1, elemType: "DOUBLE" }),
      ),
    ).toBe("ARRAY[1.0,2.0]")
  })

  it("renders null arrays as 'null'", () => {
    expect(
      formatCellValue(null, col("x", "ARRAY", { dim: 1, elemType: "INT" })),
    ).toBe("null")
  })

  it("truncates array content when columnWidth is tight", () => {
    // columnWidth=200 → maxArrayTextLength = ceil(200/8.3) = 25, minus 7
    // overhead = 18 chars of content, which is less than a 100-element
    // integer array stringified.
    const longArray = Array.from({ length: 100 }, (_, i) => i)
    const out = formatCellValue(
      longArray as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "INT" }),
      200,
    )
    expect(out.startsWith("ARRAY[")).toBe(true)
    expect(out.endsWith("]")).toBe(true)
    expect(out).toContain("...")
  })

  it("leaves array untruncated when columnWidth leaves ≤3 chars of content", () => {
    // columnWidth=80 → maxContentLength drops to 3; the truncation branch is
    // skipped (guard: maxContentLength > 3) and the full array is returned.
    const longArray = Array.from({ length: 100 }, (_, i) => i)
    const out = formatCellValue(
      longArray as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "INT" }),
      80,
    )
    expect(out).not.toContain("...")
    expect(out).toContain("99")
  })

  it("does not truncate when columnWidth is absent", () => {
    const longArray = Array.from({ length: 50 }, (_, i) => i)
    const out = formatCellValue(
      longArray as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "INT" }),
    )
    expect(out).not.toContain("...")
  })
})

describe("formatCellValueForCopy", () => {
  it("returns 'null' for null", () => {
    expect(formatCellValueForCopy(null)).toBe("null")
  })

  it("returns the same as formatCellValue for primitives", () => {
    expect(formatCellValueForCopy(true)).toBe("true")
    expect(formatCellValueForCopy(42)).toBe("42")
    expect(formatCellValueForCopy("hi")).toBe("hi")
  })

  it("returns the full array without truncation", () => {
    const longArray = Array.from({ length: 100 }, (_, i) => i)
    const out = formatCellValueForCopy(
      longArray as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "INT" }),
    )
    expect(out.startsWith("ARRAY[")).toBe(true)
    expect(out.endsWith("]")).toBe(true)
    expect(out).not.toContain("...")
    expect(out).toContain("0,1,2")
    expect(out).toContain("99")
  })

  it("preserves float suffix in copy form", () => {
    const out = formatCellValueForCopy(
      [1, 2] as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "DOUBLE" }),
    )
    expect(out).toBe("ARRAY[1.0,2.0]")
  })
})

describe("computeColumnWidths", () => {
  it("returns one entry per column", () => {
    const columns = [col("a", "INT"), col("b", "STRING"), col("c", "DOUBLE")]
    const widths = computeColumnWidths(columns, [], 1000)
    expect(widths).toHaveLength(3)
  })

  it("respects the MIN_COLUMN_WIDTH floor", () => {
    const widths = computeColumnWidths([col("a", "INT")], [], 1000)
    expect(widths[0]).toBeGreaterThanOrEqual(60)
  })

  it("clamps at maxWidth (containerWidth * 0.5)", () => {
    const longValue = "x".repeat(1000)
    const widths = computeColumnWidths(
      [col("long", "STRING")],
      [[longValue]],
      1000,
    )
    expect(widths[0]).toBeLessThanOrEqual(500)
  })

  it("widens for longer data values", () => {
    const widthShort = computeColumnWidths(
      [col("a", "STRING")],
      [["hi"]],
      1000,
    )[0]
    const widthLong = computeColumnWidths(
      [col("a", "STRING")],
      [["hello world this is longer"]],
      1000,
    )[0]
    expect(widthLong).toBeGreaterThan(widthShort)
  })

  it("includes header + type length when sizing", () => {
    const narrow = computeColumnWidths([col("x", "INT")], [[1]], 1000)[0]
    const wide = computeColumnWidths(
      [col("extremely_long_column_name", "INT")],
      [[1]],
      1000,
    )[0]
    expect(wide).toBeGreaterThan(narrow)
  })

  it("handles empty dataset", () => {
    const widths = computeColumnWidths([col("a", "INT")], [], 1000)
    expect(widths).toHaveLength(1)
    expect(widths[0]).toBeGreaterThanOrEqual(60)
  })
})
