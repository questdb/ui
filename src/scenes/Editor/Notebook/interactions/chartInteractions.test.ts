import { describe, expect, it, vi } from "vitest"
import type { EChartsType } from "echarts"
import {
  clickedValue,
  interactionEvents,
  sqlLiteral,
} from "./chartInteractions"

describe("sqlLiteral", () => {
  it("quotes text and keeps numbers", () => {
    // Given / When / Then
    expect(sqlLiteral("O'Hare")).toBe("'O''Hare'")
    expect(sqlLiteral(1.5)).toBe("1.5")
    expect(sqlLiteral(null)).toBe("null")
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
