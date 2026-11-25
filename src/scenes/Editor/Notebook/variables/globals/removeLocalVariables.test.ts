import "../../../../../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../../../../store/db"
import type { NotebookVariable } from "../../../../../store/notebook"
import { notebookOptionsOwner } from "../../../../../store/notebookOptions"
import { removeLocalVariables } from "./removeLocalVariables"

const expression = (name: string, value: string): NotebookVariable => ({
  name,
  kind: "expression",
  value,
})

const putNotebook = (id: number, variables: NotebookVariable[]) =>
  db.buffers.put({
    id,
    label: `Notebook ${id}`,
    position: id,
    value: "",
    notebookViewState: {
      cells: [],
      settings: { variables, timeRange: { from: "now-1h", to: "now" } },
    },
  })

const localVariables = async (id: number) =>
  (await db.buffers.get(id))?.notebookViewState?.settings?.variables

beforeEach(async () => {
  await db.buffers.clear()
  await db.notebook_options.clear()
})

describe("removeLocalVariables", () => {
  it("strips the named locals from every other notebook and keeps the rest of its settings", async () => {
    // Given
    await putNotebook(1, [expression("symbol", "'EURUSD'")])
    await putNotebook(2, [
      expression("SYMBOL", "'GBPUSD'"),
      expression("venue", "'lmax'"),
    ])
    await putNotebook(3, [expression("venue", "'lmax'")])

    // When
    await removeLocalVariables(["symbol"], 1)

    // Then
    expect(await localVariables(1)).toEqual([expression("symbol", "'EURUSD'")])
    expect(await localVariables(2)).toEqual([expression("venue", "'lmax'")])
    expect(await localVariables(3)).toEqual([expression("venue", "'lmax'")])
    expect(
      (await db.buffers.get(2))?.notebookViewState?.settings?.timeRange,
    ).toEqual({ from: "now-1h", to: "now" })
  })

  it("drops the cached options of the removed locals only", async () => {
    // Given
    await putNotebook(2, [expression("symbol", "'GBPUSD'")])
    const owner = notebookOptionsOwner(2)
    await db.notebook_options.bulkPut([
      { owner, name: "symbol", options: [], fetchedAt: 0 },
      { owner, name: "venue", options: [], fetchedAt: 0 },
    ])

    // When
    await removeLocalVariables(["symbol"])

    // Then
    const remaining = await db.notebook_options.toArray()
    expect(remaining.map((row) => row.name)).toEqual(["venue"])
  })

  it("leaves untouched notebooks and SQL buffers as they are", async () => {
    // Given
    await putNotebook(2, [expression("venue", "'lmax'")])
    await db.buffers.put({
      id: 3,
      label: "SQL",
      position: 3,
      value: "SELECT 1",
    })

    // When
    await removeLocalVariables(["symbol"])

    // Then
    expect(await localVariables(2)).toEqual([expression("venue", "'lmax'")])
    expect((await db.buffers.get(3))?.notebookViewState).toBeUndefined()
  })
})
