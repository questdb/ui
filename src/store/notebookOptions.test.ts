import "../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "./db"
import {
  copyStoredOptions,
  deleteAllStoredOptions,
  deleteStoredOptions,
  GLOBAL_OPTIONS_OWNER,
  loadStoredOptions,
  notebookOptionsOwner,
  saveStoredOptions,
  type StoredVariableOptions,
} from "./notebookOptions"

const row = (
  owner: string,
  name: string,
  values: string[],
): StoredVariableOptions => ({
  owner,
  name,
  options: values.map((value) => ({ value: `'${value}'`, label: value })),
  fetchedAt: 1_700_000_000_000,
})

describe("notebookOptions", () => {
  beforeEach(async () => {
    await db.notebook_options.clear()
  })

  it("stores one row per owner and name and replaces it on save", async () => {
    // Given
    const owner = notebookOptionsOwner(7)
    await saveStoredOptions(row(owner, "pair", ["EURUSD"]))
    await saveStoredOptions(row(GLOBAL_OPTIONS_OWNER, "venue", ["LSE"]))

    // When
    await saveStoredOptions(row(owner, "pair", ["EURUSD", "GBPUSD"]))

    // Then
    const rows = await loadStoredOptions(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0].options.map((o) => o.value)).toEqual([
      "'EURUSD'",
      "'GBPUSD'",
    ])
    expect(await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).toHaveLength(1)
  })

  it("deletes the named rows of one owner and leaves the rest", async () => {
    // Given
    const owner = notebookOptionsOwner(7)
    await saveStoredOptions(row(owner, "pair", ["EURUSD"]))
    await saveStoredOptions(row(owner, "venue", ["LSE"]))
    await saveStoredOptions(row(notebookOptionsOwner(8), "pair", ["USDJPY"]))

    // When
    await deleteStoredOptions(owner, ["pair", "missing"])

    // Then
    expect((await loadStoredOptions(owner)).map((r) => r.name)).toEqual([
      "venue",
    ])
    expect(await loadStoredOptions(notebookOptionsOwner(8))).toHaveLength(1)
  })

  it("deletes every row of an owner", async () => {
    // Given
    const owner = notebookOptionsOwner(7)
    await saveStoredOptions(row(owner, "pair", ["EURUSD"]))
    await saveStoredOptions(row(owner, "venue", ["LSE"]))
    await saveStoredOptions(row(GLOBAL_OPTIONS_OWNER, "pair", ["USDJPY"]))

    // When
    await deleteAllStoredOptions(owner)

    // Then
    expect(await loadStoredOptions(owner)).toEqual([])
    expect(await loadStoredOptions(GLOBAL_OPTIONS_OWNER)).toHaveLength(1)
  })

  it("copies every row of a notebook to a new owner", async () => {
    // Given
    const source = notebookOptionsOwner(7)
    const target = notebookOptionsOwner(9)
    await saveStoredOptions(row(source, "pair", ["EURUSD"]))
    await saveStoredOptions(row(source, "venue", ["LSE"]))

    // When
    await copyStoredOptions(source, target)

    // Then
    const copied = await loadStoredOptions(target)
    expect(copied.map((r) => r.name).sort()).toEqual(["pair", "venue"])
    expect(copied.every((r) => r.owner === target)).toBe(true)
    expect(await loadStoredOptions(source)).toHaveLength(2)
  })
})
