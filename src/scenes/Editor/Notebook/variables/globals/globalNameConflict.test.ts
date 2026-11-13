import "../../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../../store/db"
import type { NotebookVariable } from "../../../../../store/notebook"
import {
  describeGlobalNameConflict,
  globalNameConflicts,
} from "./globalNameConflict"

const expression = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "expression",
  value,
})

const putNotebook = (
  id: number,
  label: string,
  variables: NotebookVariable[],
) =>
  db.buffers.put({
    id,
    label,
    position: id,
    value: "",
    notebookViewState: { cells: [], settings: { variables } },
  })

beforeEach(async () => {
  await db.buffers.clear()
})

describe("globalNameConflicts", () => {
  it("excludes the current notebook because the dialog validates its drafts", async () => {
    // Given
    await putNotebook(1, "Notebook", [expression("a", "5")])
    const globals = [expression("A", "5")]

    // When
    const current = await globalNameConflicts(globals, 1)
    const other = await globalNameConflicts(globals, 2)

    // Then
    expect(current).toEqual([])
    expect(other).toEqual([{ name: "A", notebooks: ["Notebook"] }])
  })

  it("lists every notebook that defines each conflicting global", async () => {
    // Given
    await putNotebook(1, "Trades", [expression("symbol", "'EURUSD'")])
    await putNotebook(2, "FX", [
      expression("SYMBOL", "'GBPUSD'"),
      expression("venue", "'lmax'"),
    ])
    await putNotebook(3, "Empty", [])
    const globals = [
      expression("symbol", "'EURUSD'"),
      expression("venue", "'lmax'"),
      expression("free", "1"),
    ]

    // When
    const conflicts = await globalNameConflicts(globals)

    // Then
    expect(conflicts).toEqual([
      { name: "symbol", notebooks: ["Trades", "FX"] },
      { name: "venue", notebooks: ["FX"] },
    ])
  })
})

describe("describeGlobalNameConflict", () => {
  it("names the notebooks that hold the local definition", () => {
    expect(
      describeGlobalNameConflict({ name: "symbol", notebooks: ["Trades"] }),
    ).toBe('This variable is already defined in notebook "Trades".')
    expect(
      describeGlobalNameConflict({
        name: "symbol",
        notebooks: ["Trades", "FX", "Rates"],
      }),
    ).toBe(
      'This variable is already defined in notebooks "Trades", "FX" and "Rates".',
    )
  })
})
