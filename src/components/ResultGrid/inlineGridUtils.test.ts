import { describe, it, expect } from "vitest"
import {
  clampColumnWidths,
  sampleColumnWidths,
  formatCellValue,
  formatCellValueForCopy,
  formatColumnType,
  isLeftAligned,
} from "./inlineGridUtils"
import type { ColumnDefinition } from "../../utils/questdb/types"

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

  it("formats 1-D array values (.0 on every integer, matching grid.js)", () => {
    expect(
      formatCellValue(
        [1, 2, 3] as unknown as number,
        col("x", "ARRAY", { dim: 1, elemType: "INT" }),
      ),
    ).toBe("ARRAY[1.0,2.0,3.0]")
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
    expect(out).toContain("0.0,1.0,2.0")
    expect(out).toContain("99.0")
  })

  it("preserves float suffix in copy form", () => {
    const out = formatCellValueForCopy(
      [1, 2] as unknown as number,
      col("x", "ARRAY", { dim: 1, elemType: "DOUBLE" }),
    )
    expect(out).toBe("ARRAY[1.0,2.0]")
  })

  it("preserves HTML entity-looking text", () => {
    // Given a string value containing entity-looking text
    // When formatting it for copy
    const out = formatCellValueForCopy("a&amp;b&lt;c&gt;d", col("x", "VARCHAR"))

    // Then the copied text is preserved exactly as returned by the server
    expect(out).toBe("a&amp;b&lt;c&gt;d")
  })
})

describe("sampleColumnWidths", () => {
  it("returns one entry per column", () => {
    const columns = [col("a", "INT"), col("b", "STRING"), col("c", "DOUBLE")]
    const widths = sampleColumnWidths(columns, [])
    expect(widths).toHaveLength(3)
  })

  it("respects the MIN_COLUMN_WIDTH floor", () => {
    const widths = sampleColumnWidths([col("a", "INT")], [])
    expect(widths[0]).toBeGreaterThanOrEqual(60)
  })

  it("widens for longer data values", () => {
    const widthShort = sampleColumnWidths([col("a", "STRING")], [["hi"]])[0]
    const widthLong = sampleColumnWidths(
      [col("a", "STRING")],
      [["hello world this is longer"]],
    )[0]
    expect(widthLong).toBeGreaterThan(widthShort)
  })

  it("includes header + type length when sizing", () => {
    const narrow = sampleColumnWidths([col("x", "INT")], [[1]])[0]
    const wide = sampleColumnWidths(
      [col("extremely_long_column_name", "INT")],
      [[1]],
    )[0]
    expect(wide).toBeGreaterThan(narrow)
  })

  it("handles empty dataset", () => {
    const widths = sampleColumnWidths([col("a", "INT")], [])
    expect(widths).toHaveLength(1)
    expect(widths[0]).toBeGreaterThanOrEqual(60)
  })
})

describe("clampColumnWidths", () => {
  it("caps each width at containerWidth * 0.8", () => {
    expect(clampColumnWidths([1000, 100], 1000)).toEqual([800, 100])
  })

  it("keeps widths below the cap untouched", () => {
    expect(clampColumnWidths([200, 300], 1000)).toEqual([200, 300])
  })

  it("caps a long sampled value at the container limit", () => {
    // Given a column whose sampled value is far wider than the container
    const sampled = sampleColumnWidths(
      [col("long", "STRING")],
      [["x".repeat(1000)]],
    )

    // When the container clamp is applied
    const widths = clampColumnWidths(sampled, 1000)

    // Then the column never exceeds 80% of the container
    expect(widths[0]).toBeLessThanOrEqual(800)
  })
})
