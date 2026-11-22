import { describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import {
  clickedValue,
  columnTypeOf,
  interactionEvents,
  sqlLiteral,
  withBrush,
} from "./chartInteractions"

it("keeps a Custom chart's single zoom slider while adding a brush", () => {
  const slider = { type: "slider" as const, start: 15, end: 75 }
  const option = withBrush(
    { xAxis: { type: "time" }, dataZoom: slider },
    { brush: { from: "start", to: "end" } },
  )
  expect(option.dataZoom).toEqual([slider])
  expect(option.brush).toMatchObject({ brushType: "lineX" })
})

describe("sqlLiteral", () => {
  it("quotes text and keeps numbers", () => {
    // Given / When / Then
    expect(sqlLiteral("O'Hare")).toBe("'O''Hare'")
    expect(sqlLiteral(1.5)).toBe("1.5")
    expect(sqlLiteral(null)).toBe("null")
  })

  it("keeps LONG and DECIMAL values, which arrive as text, numeric", () => {
    // Given values as the console receives them, with their column types
    expect(sqlLiteral("42", "LONG")).toBe("42")
    expect(sqlLiteral("-9223372036854775807", "LONG")).toBe(
      "-9223372036854775807",
    )
    expect(sqlLiteral("1.50", "DECIMAL(10,2)")).toBe("1.50m")
    // Text columns, and text that is not a number, stay quoted
    expect(sqlLiteral("42", "VARCHAR")).toBe("'42'")
    expect(sqlLiteral("42", "SYMBOL")).toBe("'42'")
    expect(sqlLiteral("n/a", "LONG")).toBe("'n/a'")
    expect(sqlLiteral("42")).toBe("'42'")
  })
})

describe("clickedValue", () => {
  it("prefers the exact source value to a rounded plotted dimension", () => {
    expect(
      clickedValue(
        {
          value: [9007199254740992],
          dimensionNames: ["id"],
          data: { columns: { id: "9007199254740993" } },
        },
        "id",
      ),
    ).toBe("9007199254740993")
  })

  it("doesn't use synthetic labels and sums as explicit row values", () => {
    const params = {
      name: "desk",
      data: { name: "desk", value: 3 },
      value: [3],
      dimensionNames: ["value"],
    }
    expect(clickedValue(params, "name", true)).toBeUndefined()
    expect(clickedValue(params, "value", true)).toBeUndefined()
    expect(clickedValue(params, undefined, true)).toBe("desk")
    expect(
      clickedValue(
        { ...params, data: { ...params.data, columns: { value: 2 } } },
        "value",
        true,
      ),
    ).toBe(2)
  })

  it("reads the SQL alias length rather than the dataset row's width", () => {
    const row = [10, 42]
    expect(
      clickedValue(
        { data: row, value: row, dimensionNames: ["x", "length"] },
        "length",
      ),
    ).toBe(42)
    expect(clickedValue({ data: row, value: row }, "length")).toBeUndefined()
  })

  it("reads the named column from a dataset row, else the item name", () => {
    // Given
    const params = {
      name: "BTC",
      value: ["BTC", 63000],
      dimensionNames: ["sym", "price"],
    }

    // When / Then
    expect(clickedValue(params, "price")).toBe(63000)
    expect(clickedValue(params, undefined)).toBe("BTC")
  })
})

describe("interactionEvents", () => {
  it("leaves the variable unchanged when the bound column is unavailable", () => {
    const setVariables = vi.fn()
    const instance = {} as EChartsType
    const events = interactionEvents(
      { click: { variable: "desk", column: "code" } },
      setVariables,
    )
    events.click({ name: "Tokyo", value: 9 }, instance)
    expect(setVariables).not.toHaveBeenCalled()

    events.click({ name: "Tokyo", data: { columns: { code: null } } }, instance)
    expect(setVariables).toHaveBeenCalledWith({ desk: "null" })
  })

  it("sets a clicked LONG column as a number", () => {
    // Given a click bound to a LONG id column of the cell's statements
    const setVariables = vi.fn()
    const statements = [
      { columns: [{ name: "id", type: "LONG" }] },
      { columns: [{ name: "label", type: "VARCHAR" }] },
    ]
    const events = interactionEvents(
      { click: { variable: "sel", column: "id" } },
      setVariables,
      false,
      (name) => columnTypeOf(statements, name),
    )

    // When the clicked item carries the id as the console's decimal text
    events.click({ data: { columns: { id: "42" } } }, {} as EChartsType)

    // Then the variable holds the number, as the interaction contract says
    expect(setVariables).toHaveBeenCalledWith({ sel: "42" })
  })

  it("sets the time window variables from a drag and clears the brush", () => {
    // Given
    const setVariables = vi.fn()
    const dispatchAction = vi.fn()
    const events = interactionEvents(
      { brush: { from: "t0", to: "t1" } },
      setVariables,
    )

    // When
    events.brushEnd(
      { areas: [{ coordRange: [Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 1)] }] },
      { dispatchAction } as unknown as EChartsType,
    )

    // Then
    expect(setVariables).toHaveBeenCalledWith({
      t0: "'2026-01-01T00:00:00.000Z'",
      t1: "'2026-01-02T00:00:00.000Z'",
    })
    expect(dispatchAction).toHaveBeenCalledWith({ type: "brush", areas: [] })
  })
})
