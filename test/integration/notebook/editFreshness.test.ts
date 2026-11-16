import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  captureReadSeq,
  createNotebookFreshness,
} from "../../../src/utils/notebooks/notebookFreshness"
import {
  __resetNotebookAIBridgeForTests,
  getBufferActionSeq,
  signalUserEdit,
} from "../../../src/utils/notebooks/notebookAIBridge"

describe("createNotebookFreshness", () => {
  beforeEach(() => __resetNotebookAIBridgeForTests())
  afterEach(() => __resetNotebookAIBridgeForTests())

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
