import { describe, expect, it } from "vitest"
import {
  cellTimeFormSchema,
  cellTimeFromForm,
  previewEntries,
  type CellTimeFormValues,
} from "./cellTimeForm"

const values = (
  overrides: Partial<CellTimeFormValues> = {},
): CellTimeFormValues => ({
  dateFrom: "",
  dateTo: "",
  shift: "",
  showInHeader: false,
  ...overrides,
})

const validate = (input: CellTimeFormValues) =>
  cellTimeFormSchema
    .validate(input, { abortEarly: false })
    .error?.details.map((detail) => detail.path.join(".")) ?? []

describe("cellTimeFormSchema", () => {
  it("accepts an empty override with a shift, and rejects a half-filled range", () => {
    // Given
    const shiftOnly = values({ shift: "-1d" })
    const halfRange = values({ dateFrom: "now-1h" })

    // When / Then
    expect(validate(shiftOnly)).toEqual([])
    expect(validate(halfRange)).toEqual(["dateTo"])
  })

  it("rejects a shift without a sign or with an unknown unit", () => {
    // Given
    const unsigned = values({ shift: "1d" })
    const badUnit = values({ shift: "-1q" })

    // When / Then
    expect(validate(unsigned)).toEqual(["shift"])
    expect(validate(badUnit)).toEqual(["shift"])
  })
})

describe("cellTimeFromForm", () => {
  it("drops the header flag when neither a range nor a shift is set", () => {
    // Given
    const cleared = values({ showInHeader: true })

    // When
    const cell = cellTimeFromForm(cleared)

    // Then
    expect(cell).toEqual({
      timeRange: undefined,
      timeShift: undefined,
      showTimeRange: undefined,
    })
  })

  it("keeps the header flag with a shift-only override", () => {
    // Given
    const shifted = values({ shift: "+2h", showInHeader: true })

    // When
    const cell = cellTimeFromForm(shifted)

    // Then
    expect(cell).toEqual({
      timeRange: undefined,
      timeShift: "+2h",
      showTimeRange: true,
    })
  })

  it("stores an ISO bound for an absolute date and leaves relative tokens alone", () => {
    // Given
    const mixed = values({ dateFrom: "2025-01-01 10:00:00", dateTo: "now" })

    // When
    const cell = cellTimeFromForm(mixed)

    // Then
    expect(cell.timeRange?.from).toMatch(/^2025-01-01T10:00:00/)
    expect(cell.timeRange?.to).toBe("now")
    expect(cell.timeShift).toBeUndefined()
  })
})

describe("previewEntries", () => {
  it("shows the notebook range shifted while the override fields are empty", () => {
    // Given
    const draft = values({ shift: "-1d" })

    // When
    const entries = previewEntries({ from: "now-15m", to: "now" }, draft)

    // Then
    expect(entries.map((entry) => entry.value)).toEqual([
      "dateadd('d', -1, now())",
      "dateadd('m', -15, @timeTo)",
      "interval(@timeFrom, @timeTo)",
    ])
  })

  it("ignores an invalid shift while the user is still typing", () => {
    // Given
    const draft = values({ dateFrom: "now-1h", dateTo: "now", shift: "-" })

    // When
    const entries = previewEntries(undefined, draft)

    // Then
    expect(entries[0].value).toBe("now()")
  })
})
