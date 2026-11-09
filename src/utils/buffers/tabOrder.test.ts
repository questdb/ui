import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import {
  positionsAfterMove,
  positionsWithout,
  sortArchivedBuffers,
  sortOpenBuffers,
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
  })

  describe("sortArchivedBuffers", () => {
    it("returns archived buffers with the most recently archived first", () => {
      // Given
      const buffers = [
        buffer(1),
        buffer(2, { archived: true, archivedAt: 100, position: -1 }),
        buffer(3, { archived: true, archivedAt: 300, position: -1 }),
        buffer(4, { archived: true, isTemporary: true, position: -1 }),
      ]

      // When
      const ids = sortArchivedBuffers(buffers).map((b) => b.id)

      // Then
      expect(ids).toEqual([3, 2])
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
