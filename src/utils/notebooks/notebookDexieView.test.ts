import "../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import type { NotebookCell, NotebookViewState } from "../../store/notebook"
import { migratePersistedNotebookView } from "./notebookDexieView"

const cell = (id: string, highlightConfig: unknown): NotebookCell =>
  ({ id, position: 0, value: "select 1", highlightConfig }) as NotebookCell

describe("migratePersistedNotebookView", () => {
  it("drops a malformed highlight config on load and keeps a valid one", () => {
    // Given a persisted view with one valid config and one with an unknown rule
    const valid = {
      identityColumns: ["symbol"],
      rules: [
        {
          id: "r1",
          kind: "value",
          enabled: true,
          target: { kind: "column", name: "price" },
          display: "always",
          appliesTo: "cell",
          condition: { op: "gt", value: 100 },
          color: "dataSeries2",
        },
      ],
    }
    const persisted: NotebookViewState = {
      cells: [
        cell("ok", valid),
        cell("bad", { identityColumns: [], rules: [{ kind: "nope" }] }),
      ],
    }

    // When the view is read from storage
    const view = migratePersistedNotebookView(persisted)

    // Then the valid rules survive and the malformed config is gone
    expect(view.cells[0].highlightConfig).toEqual(valid)
    expect("highlightConfig" in view.cells[1]).toBe(false)
  })
})
