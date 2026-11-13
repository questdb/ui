import "../../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../../store/db"
import type {
  NotebookCell,
  NotebookVariable,
} from "../../../../../store/notebook"
import { globalReferences } from "./globalReferences"

const cell = (value: string, type?: NotebookCell["type"]): NotebookCell => ({
  id: value,
  position: 0,
  value,
  type,
})

const putNotebook = (
  id: number,
  label: string,
  cells: NotebookCell[],
  variables: NotebookVariable[] = [],
) =>
  db.buffers.put({
    id,
    label,
    position: id,
    value: "",
    notebookViewState: { cells, settings: { variables } },
  })

beforeEach(async () => {
  await db.buffers.clear()
})

describe("globalReferences", () => {
  it("lists the other notebooks whose SQL cells reference each name", async () => {
    // Given
    await putNotebook(1, "Current", [cell("SELECT @symbol")])
    await putNotebook(2, "Trades", [cell("SELECT @SYMBOL, @venue")])
    await putNotebook(3, "FX", [cell("SELECT @venue")])
    await putNotebook(4, "Notes", [cell("Mention @symbol here", "markdown")])
    await putNotebook(5, "Unrelated", [cell("SELECT 1")])

    // When
    const references = await globalReferences(["symbol", "venue", "free"], 1)

    // Then
    expect(references).toEqual([
      { name: "symbol", notebooks: ["Trades"] },
      { name: "venue", notebooks: ["Trades", "FX"] },
    ])
  })

  it("counts references from local variable sources", async () => {
    // Given
    await putNotebook(
      2,
      "Trades",
      [cell("SELECT 1")],
      [
        {
          name: "pairs",
          kind: "list",
          source: {
            type: "query",
            query: "SELECT symbol FROM t WHERE venue = @venue",
          },
          sort: "none",
          multi: false,
          includeAll: true,
          all: { mode: "list" },
          selected: "all",
        },
      ],
    )

    // When
    const references = await globalReferences(["venue"])

    // Then
    expect(references).toEqual([{ name: "venue", notebooks: ["Trades"] }])
  })
})
