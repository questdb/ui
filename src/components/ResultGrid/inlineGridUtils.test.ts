import { describe, it, expect } from "vitest"
import {
  applyMaxColumnWidth,
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

  it("unescapes HTML entities so copy matches the displayed text", () => {
    // Given a string value carrying HTML entities, as the grid displays it
    // unescaped
    // When formatting it for copy
    const out = formatCellValueForCopy("a&amp;b&lt;c&gt;d", col("x", "VARCHAR"))

    // Then the copied text is unescaped, matching the cell
    expect(out).toBe("a&b<c>d")
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

  it("samples a budgeted row count when the column set is very wide", () => {
    // Given 1000 columns, which drops the row budget to 50 rows
    const columns = Array.from({ length: 1000 }, (_, i) =>
      col(`c${i}`, "STRING"),
    )
    const shortRow = () => Array.from({ length: 1000 }, () => "x")
    const baseline = sampleColumnWidths(columns, [shortRow()])[0]

    // When a wide value sits beyond the budgeted rows
    const rowsWithLateWideValue = Array.from({ length: 55 }, shortRow)
    rowsWithLateWideValue[54][0] = "w".repeat(100)

    // Then it does not widen the column
    expect(sampleColumnWidths(columns, rowsWithLateWideValue)[0]).toBe(baseline)

    // And the same value within the budgeted rows does
    const rowsWithEarlyWideValue = Array.from({ length: 55 }, shortRow)
    rowsWithEarlyWideValue[0][0] = "w".repeat(100)
    expect(
      sampleColumnWidths(columns, rowsWithEarlyWideValue)[0],
    ).toBeGreaterThan(baseline)
  })
})

describe("clampColumnWidths", () => {
  it("leaves columns untouched when their total fits the container", () => {
    // Given columns whose total width is within the container
    // When clamped
    const widths = clampColumnWidths([200, 300], 1000)

    // Then nothing is shrunk
    expect(widths).toEqual([200, 300])
  })

  it("keeps overflowing columns that are all within the max", () => {
    // Given columns that overflow the container but none exceeds the max width
    // When clamped
    const widths = clampColumnWidths([300, 300, 300, 300], 1000)

    // Then every column keeps its width and the grid scrolls horizontally
    expect(widths).toEqual([300, 300, 300, 300])
  })

  it("gives a lone wide column the space the narrow ones leave", () => {
    // Given one wide column alongside a narrow one, overflowing the container
    // When clamped
    const widths = clampColumnWidths([1000, 100], 1000)

    // Then the wide column takes the remaining space minus the scrollbar
    // allowance, and the narrow one is kept
    expect(widths).toEqual([886, 100])
  })

  it("splits the leftover space among multiple wide columns", () => {
    // Given several wide columns overflowing an otherwise empty container
    // When clamped
    const widths = clampColumnWidths([1000, 1000], 1000)

    // Then they share the container minus the scrollbar allowance equally
    expect(widths).toEqual([493, 493])
  })

  it("floors wide columns at the max width when space is tight", () => {
    // Given more wide columns than the leftover space can fairly fit
    // When clamped
    const widths = clampColumnWidths([500, 500, 500], 1000)

    // Then each settles at the max width and the grid scrolls horizontally
    expect(widths).toEqual([400, 400, 400])
  })

  it("keeps the narrow columns and floors the lone wide one when they crowd it out", () => {
    // Given narrow columns that consume most of the space beside one wide column
    // When clamped
    const widths = clampColumnWidths([300, 300, 300, 1000], 1000)

    // Then the narrow columns are untouched and the wide one floors at the max
    expect(widths).toEqual([300, 300, 300, 400])
  })

  it("floors the wide column at the max when the narrow columns already overrun the container", () => {
    // Given narrow columns whose total alone exceeds the available width,
    // leaving a negative budget for the one wide column
    // When clamped
    const widths = clampColumnWidths([300, 300, 300, 300, 1000], 500)

    // Then the narrow columns are kept and the wide one still floors at the max
    // rather than collapsing to a negative width
    expect(widths).toEqual([300, 300, 300, 300, 400])
  })

  it("fills the container with a single overflowing column", () => {
    // Given a column whose sampled value is far wider than the container
    const sampled = sampleColumnWidths(
      [col("long", "STRING")],
      [["x".repeat(1000)]],
    )

    // When the container clamp is applied
    const widths = clampColumnWidths(sampled, 1000)

    // Then it fills the container width minus the scrollbar allowance
    expect(widths[0]).toBe(986)
  })
})

describe("applyMaxColumnWidth", () => {
  it("returns the same array when the setting is auto", () => {
    // Given widths and the automatic setting
    const widths = [200, 1000]

    // When the cap is applied
    const capped = applyMaxColumnWidth(widths, "auto")

    // Then the input array is returned untouched
    expect(capped).toBe(widths)
  })

  it("returns the same empty array when there are no columns", () => {
    // Given no columns
    const widths: number[] = []

    // When the cap is applied
    const capped = applyMaxColumnWidth(widths, 200)

    // Then the input array is returned untouched
    expect(capped).toBe(widths)
  })

  it("returns the same array when no width exceeds the cap", () => {
    // Given widths that all fit under the cap
    const widths = [200, 300]

    // When the cap is applied
    const capped = applyMaxColumnWidth(widths, 400)

    // Then the input array is returned untouched
    expect(capped).toBe(widths)
  })

  it("caps only the widths above the cap", () => {
    // Given one width above and one below the cap
    // When the cap is applied
    const capped = applyMaxColumnWidth([1000, 100], 250)

    // Then only the wide column shrinks
    expect(capped).toEqual([250, 100])
  })

  it("keeps capped columns through the container clamp", () => {
    // Given widths capped below the wide-column threshold
    const capped = applyMaxColumnWidth([1000, 1000, 1000], 200)

    // When the container clamp runs on a container they overflow
    const clamped = clampColumnWidths(capped, 500)

    // Then the capped widths are kept and the grid scrolls horizontally
    expect(clamped).toEqual([200, 200, 200])
  })
})
