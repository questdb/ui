import "../../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../../store/db"
import type {
  NotebookCell,
  NotebookVariable,
} from "../../../../../store/notebook"
import {
  GLOBAL_OPTIONS_OWNER,
  notebookOptionsOwner,
} from "../../../../../store/notebookOptions"
import { copyGlobalsToLocals } from "./copyGlobalsToLocals"

const expression = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "expression",
  value,
})

const cell = (value: string): NotebookCell => ({
  id: value,
  position: 0,
  value,
})

const putNotebook = (
  id: number,
  cells: NotebookCell[],
  variables: NotebookVariable[] = [],
) =>
  db.buffers.put({
    id,
    label: `Notebook ${id}`,
    position: id,
    value: "",
    notebookViewState: { cells, settings: { variables } },
  })

const localVariables = async (id: number) =>
  (await db.buffers.get(id))?.notebookViewState?.settings?.variables

beforeEach(async () => {
  await db.buffers.clear()
  await db.notebook_options.clear()
})

describe("copyGlobalsToLocals", () => {
  it("prepends each global to the other notebooks that reference it", async () => {
    // Given
    const symbol = expression("symbol", "'EURUSD'")
    const venue = expression("venue", "'lmax'")
    await putNotebook(1, [cell("SELECT @symbol")])
    await putNotebook(
      2,
      [cell("SELECT @symbol, @venue")],
      [expression("own", "1")],
    )
    await putNotebook(3, [cell("SELECT @venue")])
    await putNotebook(4, [cell("SELECT 1")])

    // When
    await copyGlobalsToLocals([symbol, venue], 1)

    // Then
    expect(await localVariables(1)).toEqual([])
    expect(await localVariables(2)).toEqual([
      symbol,
      venue,
      expression("own", "1"),
    ])
    expect(await localVariables(3)).toEqual([venue])
    expect(await localVariables(4)).toEqual([])
  })

  it("keeps an existing local with the same name and copies the cached options", async () => {
    // Given
    const symbol = expression("symbol", "'EURUSD'")
    const local = expression("SYMBOL", "'GBPUSD'")
    await putNotebook(2, [cell("SELECT @symbol, @venue")], [local])
    await db.notebook_options.bulkPut([
      {
        owner: GLOBAL_OPTIONS_OWNER,
        name: "symbol",
        options: [],
        fetchedAt: 1,
      },
      { owner: GLOBAL_OPTIONS_OWNER, name: "venue", options: [], fetchedAt: 2 },
    ])

    // When
    await copyGlobalsToLocals([symbol, expression("venue", "'lmax'")])

    // Then
    expect(await localVariables(2)).toEqual([
      expression("venue", "'lmax'"),
      local,
    ])
    const copied = await db.notebook_options
      .where("owner")
      .equals(notebookOptionsOwner(2))
      .toArray()
    expect(copied.map((row) => row.name)).toEqual(["venue"])
  })
})
