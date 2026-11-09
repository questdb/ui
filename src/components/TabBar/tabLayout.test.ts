import { describe, expect, it } from "vitest"
import {
  closestSlotIndex,
  computeTabWidths,
  cumulativePositions,
  displayedIndexDuringDrag,
} from "./tabLayout"

describe("tabLayout", () => {
  describe("computeTabWidths", () => {
    it("caps tabs at the maximum width when there is room", () => {
      // Given
      const rootWidth = 90 + 240 * 2 + 100

      // When
      const widths = computeTabWidths(rootWidth, 2)

      // Then
      expect(widths).toEqual([240, 240])
    })

    it("shares the available width and spreads leftover pixels", () => {
      // Given
      const rootWidth = 90 + 3 * 200 + 2

      // When
      const widths = computeTabWidths(rootWidth, 3)

      // Then
      expect(widths).toEqual([201, 201, 200])
    })

    it("never goes below the minimum width", () => {
      // Given
      const rootWidth = 90 + 100

      // When
      const widths = computeTabWidths(rootWidth, 4)

      // Then
      expect(widths).toEqual([150, 150, 150, 150])
    })
  })

  describe("cumulativePositions", () => {
    it("returns the left edge of each tab", () => {
      expect(cumulativePositions([200, 200, 150])).toEqual([0, 200, 400])
    })
  })

  describe("closestSlotIndex", () => {
    it("picks the slot whose left edge is nearest", () => {
      expect(closestSlotIndex(290, [0, 200, 400])).toBe(1)
      expect(closestSlotIndex(310, [0, 200, 400])).toBe(2)
    })
  })

  describe("displayedIndexDuringDrag", () => {
    it("shifts tabs between origin and target backward when dragging forward", () => {
      // Given a drag from 0 to 2
      // Then
      expect(displayedIndexDuringDrag(0, 0, 2)).toBe(2)
      expect(displayedIndexDuringDrag(1, 0, 2)).toBe(0)
      expect(displayedIndexDuringDrag(2, 0, 2)).toBe(1)
      expect(displayedIndexDuringDrag(3, 0, 2)).toBe(3)
    })

    it("shifts tabs between target and origin forward when dragging backward", () => {
      // Given a drag from 3 to 1
      // Then
      expect(displayedIndexDuringDrag(3, 3, 1)).toBe(1)
      expect(displayedIndexDuringDrag(1, 3, 1)).toBe(2)
      expect(displayedIndexDuringDrag(2, 3, 1)).toBe(3)
      expect(displayedIndexDuringDrag(0, 3, 1)).toBe(0)
    })
  })
})
