import { describe, expect, it } from "vitest"
import { getTableKind, Table } from "./types"

const makeTable = (overrides: Partial<Table>): Table =>
  ({ table_name: "t", ...overrides }) as Table

describe("getTableKind", () => {
  it("should return table for table_type T", () => {
    // Given
    const table = makeTable({ table_type: "T" })

    // When / Then
    expect(getTableKind(table)).toBe("table")
  })

  it("should return table when table_type is missing on older servers", () => {
    // Given
    const table = makeTable({ table_type: undefined })

    // When / Then
    expect(getTableKind(table)).toBe("table")
  })

  it("should return matview for table_type M", () => {
    // Given
    const table = makeTable({ table_type: "M" })

    // When / Then
    expect(getTableKind(table)).toBe("matview")
  })

  it("should return matview for the legacy matView flag", () => {
    // Given
    const table = makeTable({ matView: true, table_type: undefined })

    // When / Then
    expect(getTableKind(table)).toBe("matview")
  })

  it("should return view for table_type V", () => {
    // Given
    const table = makeTable({ table_type: "V" })

    // When / Then
    expect(getTableKind(table)).toBe("view")
  })

  it("should return liveview for table_type L", () => {
    // Given
    const table = makeTable({ table_type: "L" })

    // When / Then
    expect(getTableKind(table)).toBe("liveview")
  })
})
