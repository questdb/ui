import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import {
  closedBuffersToDelete,
  nextOpenPosition,
  positionsAfterMove,
  pinnedBuffersWithout,
  positionsWithout,
  sortClosedBuffers,
  sortOpenBuffers,
  sortPinnedBuffers,
} from "./tabOrder"

const buffer = (id: number, overrides: Partial<Buffer> = {}): Buffer =>
  ({
    id,
    label: `tab-${id}`,
    value: "",
    position: id,
    ...overrides,
  }) as Buffer

describe("tabOrder", () => {
  describe("sortOpenBuffers", () => {
    it("orders open buffers by position and places the temporary buffer last", () => {
      // Given
      const buffers = [
        buffer(3, { position: 2 }),
        buffer(1, { position: 0 }),
        buffer(9, { archived: true, isTemporary: true, position: -1 }),
        buffer(2, { position: 1 }),
        buffer(8, { archived: true, position: -1 }),
      ]

      // When
      const ids = sortOpenBuffers(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([1, 2, 3, 9])
    })

    it("places the AI diff tab after every other tab, whatever its position", () => {
      // Given: the diff tab sits between user tabs by position
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(7, { isPreviewBuffer: true, position: 1 }),
        buffer(2, { position: 2 }),
        buffer(9, { archived: true, isTemporary: true, position: -1 }),
        buffer(3, { position: 3 }),
      ]

      // When
      const ids = sortOpenBuffers(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([1, 2, 3, 9, 7])
    })
  })

  describe("sortPinnedBuffers", () => {
    it("lists only the user's open tabs, without the closed-tab preview and the AI diff tab", () => {
      // Given
      const buffers = [
        buffer(7, { isPreviewBuffer: true, position: 0 }),
        buffer(2, { position: 2 }),
        buffer(1, { position: 1 }),
        buffer(9, { archived: true, isTemporary: true, position: -1 }),
      ]

      // When
      const ids = sortPinnedBuffers(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([1, 2])
    })
  })

  describe("sortClosedBuffers", () => {
    it("returns closed buffers, including the previewed one, most recently archived first", () => {
      // Given
      const buffers = [
        buffer(1),
        buffer(2, { archived: true, archivedAt: 100, position: -1 }),
        buffer(3, { archived: true, archivedAt: 300, position: -1 }),
        buffer(4, {
          archived: true,
          archivedAt: 200,
          isTemporary: true,
          position: -1,
        }),
      ]

      // When
      const ids = sortClosedBuffers(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([3, 4, 2])
    })
  })

  describe("closedBuffersToDelete", () => {
    it("includes the previewed closed tab and deletes it first", () => {
      // Given
      const buffers = [
        buffer(1),
        buffer(2, { archived: true, archivedAt: 100, position: -1 }),
        buffer(3, { archived: true, archivedAt: 300, position: -1 }),
        buffer(4, {
          archived: true,
          archivedAt: 200,
          isTemporary: true,
          position: -1,
        }),
        buffer(5, { position: 1 }),
      ]

      // When
      const ids = closedBuffersToDelete(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([4, 3, 2])
    })

    it("never includes open tabs", () => {
      // Given
      const buffers = [buffer(1), buffer(2, { position: 1 })]

      // When
      const ids = closedBuffersToDelete(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([])
    })
  })

  describe("pinnedBuffersWithout", () => {
    it("returns the other open tabs in tab order", () => {
      // Given
      const buffers = [
        buffer(3, { position: 2 }),
        buffer(1, { position: 0 }),
        buffer(2, { position: 1 }),
        buffer(8, { archived: true, position: -1 }),
      ]

      // When
      const ids = pinnedBuffersWithout(buffers, 2).map((b) => b.id)

      // Then
      expect(ids).toEqual([1, 3])
    })

    it("does not count the preview of a closed tab as an open tab", () => {
      // Given
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(9, { archived: true, isTemporary: true, position: -1 }),
      ]

      // When
      const remaining = pinnedBuffersWithout(buffers, 1)

      // Then
      expect(remaining).toEqual([])
    })

    it("excludes the preview when other open tabs remain", () => {
      // Given
      const buffers = [
        buffer(9, { archived: true, isTemporary: true, position: -1 }),
        buffer(1, { position: 0 }),
        buffer(2, { position: 1 }),
      ]

      // When
      const ids = pinnedBuffersWithout(buffers, 1).map((b) => b.id)

      // Then
      expect(ids).toEqual([2])
    })
  })

  describe("nextOpenPosition", () => {
    it("places a restored tab after the last open tab when a delete left a gap", () => {
      // Given: A(0), C(2) open after B was deleted without compaction; D closed
      const buffers = [
        buffer(1, { label: "A", position: 0 }),
        buffer(3, { label: "C", position: 2 }),
        buffer(4, { label: "D", archived: true, position: -1 }),
      ]

      // When
      const position = nextOpenPosition(buffers)
      const restored = buffers.map((b) =>
        b.id === 4 ? { ...b, archived: false, position } : b,
      )

      // Then
      expect(position).toBe(3)
      expect(sortOpenBuffers(restored).map((b) => b.label)).toEqual([
        "A",
        "C",
        "D",
      ])
    })

    it("ignores closed and previewed tabs", () => {
      // Given
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(2, { position: 1 }),
        buffer(8, { archived: true, position: 7 }),
        buffer(9, { archived: true, isTemporary: true, position: 9 }),
      ]

      // When
      const position = nextOpenPosition(buffers)

      // Then
      expect(position).toBe(2)
    })

    it("ignores the AI diff tab", () => {
      // Given
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(7, { isPreviewBuffer: true, position: 5 }),
      ]

      // When
      const position = nextOpenPosition(buffers)

      // Then
      expect(position).toBe(1)
    })

    it("returns 0 when no tab is open", () => {
      // Given
      const buffers = [buffer(1, { archived: true, position: -1 })]

      // When
      const position = nextOpenPosition(buffers)

      // Then
      expect(position).toBe(0)
    })
  })

  describe("positionsWithout", () => {
    it("compacts positions of the remaining open buffers", () => {
      // Given
      const buffers = [buffer(1), buffer(2), buffer(3)]

      // When
      const positions = positionsWithout(buffers, 2)

      // Then
      expect(positions).toEqual([
        { id: 1, position: 0 },
        { id: 3, position: 1 },
      ])
    })
  })

  describe("positionsAfterMove", () => {
    it("moves a buffer forward and shifts the others", () => {
      // Given
      const buffers = [buffer(1), buffer(2), buffer(3)]

      // When
      const positions = positionsAfterMove(buffers, 1, 2)

      // Then
      expect(positions).toEqual([
        { id: 2, position: 0 },
        { id: 3, position: 1 },
        { id: 1, position: 2 },
      ])
    })

    it("moves a buffer backward and shifts the others", () => {
      // Given
      const buffers = [buffer(1), buffer(2), buffer(3)]

      // When
      const positions = positionsAfterMove(buffers, 3, 0)

      // Then
      expect(positions).toEqual([
        { id: 3, position: 0 },
        { id: 1, position: 1 },
        { id: 2, position: 2 },
      ])
    })

    it("indexes the user's tabs only, so the AI diff tab between them does not shift the drop", () => {
      // Given: A, AI Suggestion, B, C by position
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(7, { isPreviewBuffer: true, position: 1 }),
        buffer(2, { position: 2 }),
        buffer(3, { position: 3 }),
      ]

      // When A is dropped at the end of the list [A, B, C]
      const positions = positionsAfterMove(buffers, 1, 2)

      // Then A is last among the user's tabs and the diff tab is untouched
      expect(positions).toEqual([
        { id: 2, position: 0 },
        { id: 3, position: 1 },
        { id: 1, position: 2 },
      ])
    })

    it("clamps a drop past the user's tabs to the last user slot", () => {
      // Given
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(2, { position: 1 }),
        buffer(7, { isPreviewBuffer: true, position: 2 }),
      ]

      // When
      const positions = positionsAfterMove(buffers, 1, 5)

      // Then
      expect(positions).toEqual([
        { id: 2, position: 0 },
        { id: 1, position: 1 },
      ])
    })

    it("never moves the AI diff tab", () => {
      // Given
      const buffers = [
        buffer(1, { position: 0 }),
        buffer(7, { isPreviewBuffer: true, position: 1 }),
      ]

      // When
      const positions = positionsAfterMove(buffers, 7, 0)

      // Then
      expect(positions).toEqual([])
    })

    it("returns no positions for an unknown buffer", () => {
      // Given
      const buffers = [buffer(1), buffer(2)]

      // When
      const positions = positionsAfterMove(buffers, 42, 0)

      // Then
      expect(positions).toEqual([])
    })
  })
})
