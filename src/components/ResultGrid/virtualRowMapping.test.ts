import { describe, it, expect } from "vitest"
import {
  LEAP_TAIL_ROWS,
  MAX_VIRTUAL_ROWS,
  toAbsoluteIndex,
  toVisibleAbsoluteRange,
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

describe("toVisibleAbsoluteRange", () => {
  const headCount = MAX_VIRTUAL_ROWS - LEAP_TAIL_ROWS

  it("maps both ends directly when the result fits within the height cap", () => {
    // Given a result below the cap
    const rowCount = 5000

    // When the visible window is anywhere in it
    const range = toVisibleAbsoluteRange(100, 130, rowCount)

    // Then the range is the identity mapping
    expect(range).toEqual({ firstIndex: 100, lastIndex: 130 })
  })

  it("maps a window fully inside the head 1:1", () => {
    // Given a result past the cap
    const rowCount = MAX_VIRTUAL_ROWS * 3

    // When the window ends before the leap
    const range = toVisibleAbsoluteRange(
      headCount - 50,
      headCount - 20,
      rowCount,
    )

    // Then both ends stay 1:1
    expect(range).toEqual({
      firstIndex: headCount - 50,
      lastIndex: headCount - 20,
    })
  })

  it("maps a window fully inside the tail onto the end of the result", () => {
    // Given a result past the cap
    const rowCount = MAX_VIRTUAL_ROWS * 3

    // When the window sits entirely in the leap tail
    const range = toVisibleAbsoluteRange(
      headCount + 10,
      headCount + 40,
      rowCount,
    )

    // Then both ends resolve into the result's last LEAP_TAIL_ROWS window
    expect(range).toEqual({
      firstIndex: rowCount - LEAP_TAIL_ROWS + 10,
      lastIndex: rowCount - LEAP_TAIL_ROWS + 40,
    })
  })

  it("resolves a leap-straddling window to the head when it holds more rows", () => {
    // Given a result past the cap
    const rowCount = MAX_VIRTUAL_ROWS * 3

    // When most of the window is above the leap
    const range = toVisibleAbsoluteRange(
      headCount - 20,
      headCount + 5,
      rowCount,
    )

    // Then the range is the contiguous head segment, never spanning the gap
    expect(range).toEqual({
      firstIndex: headCount - 20,
      lastIndex: headCount - 1,
    })
  })

  it("resolves a leap-straddling window to the tail when it holds more rows", () => {
    // Given a result past the cap
    const rowCount = MAX_VIRTUAL_ROWS * 3

    // When most of the window is below the leap
    const range = toVisibleAbsoluteRange(
      headCount - 5,
      headCount + 20,
      rowCount,
    )

    // Then the range is the contiguous tail segment, never spanning the gap
    expect(range).toEqual({
      firstIndex: rowCount - LEAP_TAIL_ROWS,
      lastIndex: rowCount - LEAP_TAIL_ROWS + 20,
    })
  })
})
