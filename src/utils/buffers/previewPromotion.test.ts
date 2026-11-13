import { describe, expect, it } from "vitest"
import type { Buffer } from "../../store/buffers"
import { promoteActivePreview } from "./previewPromotion"

const buffer = (id: number, overrides: Partial<Buffer> = {}): Buffer =>
  ({ id, label: `tab-${id}`, value: "", position: id, ...overrides }) as Buffer

const preview = (id: number, overrides: Partial<Buffer> = {}) =>
  buffer(id, {
    archived: true,
    archivedAt: 1000,
    position: -1,
    isTemporary: true,
    ...overrides,
  })

// The payload restore_tab (NotebookWorkspaceBridge) and keepBufferOpen send.
const restorePayload: Partial<Buffer> = {
  archived: false,
  archivedAt: undefined,
  isTemporary: false,
  position: 3,
}

describe("promoteActivePreview", () => {
  it("reopens the previewed active tab so the preview UI goes away", () => {
    // Given
    const active = preview(7, { value: "select 1;" })

    // When
    const next = promoteActivePreview(active, 7, restorePayload)

    // Then
    expect(next).toMatchObject({
      id: 7,
      value: "select 1;",
      archived: false,
      archivedAt: undefined,
      isTemporary: false,
      position: 3,
    })
  })

  it("keeps notebook content so the notebook remounts live", () => {
    // Given
    const notebookViewState = { cells: [] }
    const active = preview(7, { notebookViewState })

    // When
    const next = promoteActivePreview(active, 7, restorePayload)

    // Then
    expect(next?.notebookViewState).toBe(notebookViewState)
    expect(next?.archived).toBe(false)
  })

  it("ignores updates to another buffer", () => {
    expect(promoteActivePreview(preview(7), 8, restorePayload)).toBeUndefined()
  })

  it("ignores the active buffer when it is not a preview", () => {
    expect(promoteActivePreview(buffer(7), 7, restorePayload)).toBeUndefined()
  })

  it("ignores discarding the preview (it stays archived)", () => {
    expect(
      promoteActivePreview(preview(7), 7, { isTemporary: false, position: -1 }),
    ).toBeUndefined()
  })

  it("ignores updates that do not clear the preview flag", () => {
    expect(
      promoteActivePreview(preview(7), 7, { label: "renamed" }),
    ).toBeUndefined()
    expect(
      promoteActivePreview(preview(7), 7, { isTemporary: true }),
    ).toBeUndefined()
  })
})
