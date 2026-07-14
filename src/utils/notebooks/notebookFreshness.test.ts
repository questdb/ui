import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { captureReadSeq, createNotebookFreshness } from "./notebookFreshness"
import {
  __resetNotebookAIBridgeForTests,
  getBufferActionSeq,
  signalUserEdit,
} from "./notebookAIBridge"

describe("createNotebookFreshness", () => {
  beforeEach(() => __resetNotebookAIBridgeForTests())
  afterEach(() => __resetNotebookAIBridgeForTests())

  it("reports not_fetched for a buffer that was never read", () => {
    // Given
    const freshness = createNotebookFreshness()

    // When / Then
    expect(freshness.assertFresh(1)).toBe("not_fetched")
  })

  it("reports fresh while the recorded read seq matches the live seq", () => {
    // Given
    const freshness = createNotebookFreshness()

    // When
    freshness.recordRead(1, captureReadSeq(1))

    // Then
    expect(freshness.assertFresh(1)).toBe("fresh")
  })

  it("reports stale once the user edits the buffer after the read", () => {
    // Given
    const freshness = createNotebookFreshness()
    freshness.recordRead(1, captureReadSeq(1))

    // When
    signalUserEdit(1)

    // Then
    expect(freshness.assertFresh(1)).toBe("stale")
  })

  it("scopes freshness per buffer: an edit to another buffer stays fresh", () => {
    // Given
    const freshness = createNotebookFreshness()
    freshness.recordRead(1, captureReadSeq(1))
    freshness.recordRead(2, captureReadSeq(2))

    // When
    signalUserEdit(2)

    // Then
    expect(freshness.assertFresh(1)).toBe("fresh")
    expect(freshness.assertFresh(2)).toBe("stale")
  })

  it("seeds read baselines from the constructor", () => {
    // Given
    const freshness = createNotebookFreshness([[1, getBufferActionSeq(1)]])

    // Then
    expect(freshness.getReadSeq(1)).toBe(getBufferActionSeq(1))
    expect(freshness.assertFresh(1)).toBe("fresh")
  })

  it("drops every baseline on reset", () => {
    // Given
    const freshness = createNotebookFreshness()
    freshness.recordRead(1, captureReadSeq(1))

    // When
    freshness.reset()

    // Then
    expect(freshness.getReadSeq(1)).toBeUndefined()
    expect(freshness.assertFresh(1)).toBe("not_fetched")
  })

  it("advances the generation on every reset", () => {
    // Given
    const freshness = createNotebookFreshness()
    const before = freshness.generation()

    // When
    freshness.reset()

    // Then
    expect(freshness.generation()).toBe(before + 1)
  })

  it("ignores a recordRead whose read began before a reset (reconnect)", () => {
    // Given — a workspace read captures the generation, then a reconnect resets
    const freshness = createNotebookFreshness()
    const readGeneration = freshness.generation()
    freshness.reset()

    // When — the obsolete read resolves and tries to record freshness
    freshness.recordRead(1, captureReadSeq(1), readGeneration)

    // Then — the new connection never inherits freshness it never fetched
    expect(freshness.assertFresh(1)).toBe("not_fetched")
    expect(freshness.getReadSeq(1)).toBeUndefined()
  })

  it("records a read whose generation still matches", () => {
    // Given
    const freshness = createNotebookFreshness()

    // When — read and record within the same generation
    freshness.recordRead(1, captureReadSeq(1), freshness.generation())

    // Then
    expect(freshness.assertFresh(1)).toBe("fresh")
  })
})

describe("captureReadSeq", () => {
  beforeEach(() => __resetNotebookAIBridgeForTests())
  afterEach(() => __resetNotebookAIBridgeForTests())

  it("returns the buffer's current action seq", () => {
    // Given
    signalUserEdit(1)

    // When / Then
    expect(captureReadSeq(1)).toBe(getBufferActionSeq(1))
  })
})
