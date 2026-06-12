import { describe, it, expect } from "vitest"
import {
  LEAP_TAIL_ROWS,
  MAX_VIRTUAL_ROWS,
  toAbsoluteIndex,
} from "./virtualRowMapping"

describe("toAbsoluteIndex", () => {
  it("is identity when the result fits within the height cap", () => {
    expect(toAbsoluteIndex(0, 100)).toBe(0)
    expect(toAbsoluteIndex(42, 100)).toBe(42)
    expect(toAbsoluteIndex(99, 100)).toBe(99)
    expect(toAbsoluteIndex(7, MAX_VIRTUAL_ROWS)).toBe(7)
  })

  it("keeps the head rows 1:1 when the result exceeds the cap", () => {
    const rowCount = MAX_VIRTUAL_ROWS * 3
    const headCount = MAX_VIRTUAL_ROWS - LEAP_TAIL_ROWS

    expect(toAbsoluteIndex(0, rowCount)).toBe(0)
    expect(toAbsoluteIndex(headCount - 1, rowCount)).toBe(headCount - 1)
  })

  it("maps the tail rows onto the end of the result", () => {
    const rowCount = MAX_VIRTUAL_ROWS * 3
    const headCount = MAX_VIRTUAL_ROWS - LEAP_TAIL_ROWS

    // The first tail row jumps to the last LEAP_TAIL_ROWS window of the result.
    expect(toAbsoluteIndex(headCount, rowCount)).toBe(rowCount - LEAP_TAIL_ROWS)
    // The very last virtual row resolves to the very last real row.
    expect(toAbsoluteIndex(MAX_VIRTUAL_ROWS - 1, rowCount)).toBe(rowCount - 1)
  })
})
