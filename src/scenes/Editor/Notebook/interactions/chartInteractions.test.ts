import { describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import { interactionEvents, sqlLiteral, withBrush } from "./chartInteractions"

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

describe("interactionEvents", () => {
  const instance = {} as EChartsType

  it("leaves the variable unchanged when the bound column is unavailable", () => {
    // Given a click bound to a column only one statement has
    const setVariables = vi.fn()
    const statements = [
      { columns: [{ name: "desk", type: "SYMBOL" }], rows: [["Tokyo"]] },
      { columns: [{ name: "code", type: "SYMBOL" }], rows: [[null]] },
    ]
    const events = interactionEvents(
      { click: { variable: "desk", column: "code" } },
      setVariables,
      () => statements,
    )

    // When the user clicks an item with no pick, then one of the statement
    // without the column, by its name and value
    events.click({ name: "Tokyo", value: 9 }, instance)
    events.click(
      { name: "Tokyo", data: { pick: { statement: 0, rows: [0] } } },
      instance,
    )
    // Then nothing is set
    expect(setVariables).not.toHaveBeenCalled()

    // When the user clicks a row of the statement with the column
    events.click({ data: { pick: { statement: 1, rows: [0] } } }, instance)

    // Then its NULL is set
    expect(setVariables).toHaveBeenCalledWith({ desk: "null" })
  })

  it("sets a clicked LONG column as a number", () => {
    // Given a click bound to a LONG id column of the cell's statements
    const setVariables = vi.fn()
    const statements = [
      { columns: [{ name: "id", type: "LONG" }], rows: [["42"]] },
      { columns: [{ name: "label", type: "VARCHAR" }], rows: [["a"]] },
    ]
    const events = interactionEvents(
      { click: { variable: "sel", column: "id" } },
      setVariables,
      () => statements,
    )

    // When the clicked item was drawn from the row with the id "42"
    events.click({ data: { pick: { statement: 0, rows: [0] } } }, instance)

    // Then the variable holds the number, as the interaction contract says
    expect(setVariables).toHaveBeenCalledWith({ sel: "42" })
  })

  it("reads the statements when the click happens, not when bound", () => {
    // Given handlers made before a refresh
    const setVariables = vi.fn()
    let statements = [{ columns: [{ name: "v", type: "INT" }], rows: [[1]] }]
    const events = interactionEvents(
      { click: { variable: "v" } },
      setVariables,
      () => statements,
    )

    // When the rows change and the user clicks the first one
    statements = [{ columns: [{ name: "v", type: "INT" }], rows: [[2]] }]
    events.click(
      { data: { pick: { statement: 0, rows: [0], column: 0 } } },
      instance,
    )

    // Then the variable holds the current row's value
    expect(setVariables).toHaveBeenCalledWith({ v: "2" })
  })

  it("ignores clicks on event mark lines and areas", () => {
    // Given
    const setVariables = vi.fn()
    const statements = [{ columns: [{ name: "v", type: "INT" }], rows: [[1]] }]
    const events = interactionEvents(
      { click: { variable: "v" } },
      setVariables,
      () => statements,
    )
    const data = { pick: { statement: 0, rows: [0], column: 0 } }

    // When
    events.click({ componentType: "markLine", data }, instance)
    events.click({ componentType: "markArea", data }, instance)

    // Then
    expect(setVariables).not.toHaveBeenCalled()
  })

  it("sets the time window variables from a drag and clears the brush", () => {
    // Given
    const setVariables = vi.fn()
    const dispatchAction = vi.fn()
    const events = interactionEvents(
      { brush: { from: "t0", to: "t1" } },
      setVariables,
      () => [],
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
