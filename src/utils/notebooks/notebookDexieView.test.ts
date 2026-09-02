import { describe, expect, it } from "vitest"
import type { NotebookViewState } from "../../store/notebook"
import { migratePersistedNotebookView } from "./notebookDexieView"

const legacyView = (isViewMaximized?: boolean): NotebookViewState =>
  ({
    cells: [
      {
        id: "c",
        position: 0,
        value: "SELECT 1",
        ...(isViewMaximized !== undefined ? { isViewMaximized } : {}),
      },
    ],
  }) as unknown as NotebookViewState

describe("migratePersistedNotebookView preferred view", () => {
  it.each([
    [true, "result"],
    [false, "editor_result"],
    [undefined, "editor_result"],
  ] as const)(
    "maps main's isViewMaximized=%s to %s",
    (legacy, preferredView) => {
      const cell = migratePersistedNotebookView(legacyView(legacy)).cells[0]
      expect(cell.preferredView).toBe(preferredView)
      expect(cell).not.toHaveProperty("isViewMaximized")
    },
  )

  it("removes pane preference state from markdown", () => {
    const view = {
      cells: [
        {
          id: "m",
          position: 0,
          value: "# Title",
          type: "markdown",
          preferredView: "result",
          isViewMaximized: true,
        },
      ],
    } as unknown as NotebookViewState
    const cell = migratePersistedNotebookView(view).cells[0]
    expect(cell).not.toHaveProperty("preferredView")
    expect(cell).not.toHaveProperty("isViewMaximized")
  })
})
