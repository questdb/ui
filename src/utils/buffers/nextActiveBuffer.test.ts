import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import {
  MAX_RECENT_BUFFERS,
  pickNextActiveBuffer,
  pushRecentBuffer,
  resolveNextActiveBuffer,
} from "./nextActiveBuffer"

const buffer = (id: number, overrides: Partial<Buffer> = {}): Buffer =>
  ({ id, label: `tab-${id}`, value: "", position: id, ...overrides }) as Buffer

describe("pushRecentBuffer", () => {
  it("moves the id to the front without duplicates", () => {
    expect(pushRecentBuffer([3, 1, 2], 1)).toEqual([1, 3, 2])
  })

  it("keeps at most the configured number of ids", () => {
    // Given
    const full = Array.from({ length: MAX_RECENT_BUFFERS }, (_, i) => i + 1)

    // When
    const next = pushRecentBuffer(full, 99)

    // Then
    expect(next).toHaveLength(MAX_RECENT_BUFFERS)
    expect(next[0]).toBe(99)
    expect(next).not.toContain(MAX_RECENT_BUFFERS)
  })
})

describe("pickNextActiveBuffer", () => {
  it("prefers the most recently used open tab", () => {
    // Given
    const buffers = [buffer(1), buffer(2), buffer(3), buffer(4)]

    // When
    const next = pickNextActiveBuffer(buffers, 4, [4, 2, 1], null)

    // Then
    expect(next?.id).toBe(2)
  })

  it("skips recent ids that are closed, deleted, or previewed", () => {
    // Given
    const buffers = [
      buffer(1),
      buffer(2, { archived: true, position: -1 }),
      buffer(3, { archived: true, isTemporary: true, position: -1 }),
      buffer(4),
    ]

    // When
    const next = pickNextActiveBuffer(buffers, 4, [9, 2, 3, 1], 3)

    // Then
    expect(next?.id).toBe(1)
  })

  it("falls back to the left neighbour in tab order", () => {
    // Given
    const buffers = [
      buffer(1, { position: 0 }),
      buffer(2, { position: 1 }),
      buffer(3, { position: 2 }),
    ]

    // When
    const next = pickNextActiveBuffer(buffers, 2, [], null)

    // Then
    expect(next?.id).toBe(1)
  })

  it("falls back to the right neighbour when the first tab is removed", () => {
    // Given
    const buffers = [
      buffer(1, { position: 0 }),
      buffer(2, { position: 1 }),
      buffer(3, { position: 2 }),
    ]

    // When
    const next = pickNextActiveBuffer(buffers, 1, [], null)

    // Then
    expect(next?.id).toBe(2)
  })

  it("falls back to the preview tab when no pinned tab is left", () => {
    // Given
    const buffers = [
      buffer(1),
      buffer(2, { archived: true, isTemporary: true, position: -1 }),
    ]

    // When
    const next = pickNextActiveBuffer(buffers, 1, [1], 2)

    // Then
    expect(next?.id).toBe(2)
  })

  it("returns nothing when no tab is left at all", () => {
    // Given
    const buffers = [buffer(1)]

    // When
    const next = pickNextActiveBuffer(buffers, 1, [1], null)

    // Then
    expect(next).toBeUndefined()
  })
})

describe("resolveNextActiveBuffer", () => {
  const resolve = (
    snapshot: Buffer[],
    stored: Buffer[],
    removedId: number,
    recentIds: number[] = [],
    previewId: number | null = null,
  ) =>
    resolveNextActiveBuffer({
      snapshot,
      loadStored: () => Promise.resolve(stored),
      removedId,
      recentIds,
      previewId,
    })

  it("activates the stored content, not the caller's stale snapshot", async () => {
    // Given
    const snapshot = [
      buffer(1, { position: 0 }),
      buffer(2, { position: 1, value: "select 1;" }),
    ]
    const stored = [buffer(2, { position: 1, value: "select 1;\nselect 2;" })]

    // When
    const next = await resolve(snapshot, stored, 1, [2])

    // Then
    expect(next?.id).toBe(2)
    expect(next?.value).toBe("select 1;\nselect 2;")
  })

  it("considers tabs created after the snapshot was taken", async () => {
    // Given
    const snapshot = [buffer(1, { position: 0 })]
    const stored = [buffer(3, { position: 1 })]

    // When
    const next = await resolve(snapshot, stored, 1, [3])

    // Then
    expect(next?.id).toBe(3)
  })

  it("skips a tab that was closed after the snapshot was taken", async () => {
    // Given
    const snapshot = [
      buffer(1, { position: 0 }),
      buffer(2, { position: 1 }),
      buffer(3, { position: 2 }),
    ]
    const stored = [
      buffer(1, { archived: true, position: -1 }),
      buffer(2, { archived: true, position: -1 }),
      buffer(3, { position: 1 }),
    ]

    // When
    const next = await resolve(snapshot, stored, 2, [1])

    // Then
    expect(next?.id).toBe(3)
  })

  it("keeps the left neighbour although the removed row is already gone", async () => {
    // Given
    const snapshot = [
      buffer(1, { position: 0 }),
      buffer(2, { position: 1 }),
      buffer(3, { position: 2 }),
    ]
    const stored = [buffer(1, { position: 0 }), buffer(3, { position: 2 })]

    // When
    const next = await resolve(snapshot, stored, 2)

    // Then
    expect(next?.id).toBe(1)
  })

  it("falls back to the preview tab when no pinned tab is left", async () => {
    // Given
    const snapshot = [
      buffer(1, { position: 0 }),
      buffer(2, { archived: true, isTemporary: true, position: -1 }),
    ]
    const stored = [buffer(2, { archived: true, position: -1 })]

    // When
    const next = await resolve(snapshot, stored, 1, [1], 2)

    // Then
    expect(next?.id).toBe(2)
    expect(next?.isTemporary).toBe(true)
  })
})
