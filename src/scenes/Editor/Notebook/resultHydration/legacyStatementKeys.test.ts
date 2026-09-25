import { describe, expect, it } from "vitest"
import type { SingleQueryResult } from "../../../../store/notebook"
import { resultStatementKeys, statementKeysFor } from "../notebookUtils"
import { rekeyLegacyStatementKeys } from "./legacyStatementKeys"

const dqlResult = (query: string): SingleQueryResult => ({
  type: "dql",
  query,
  columns: [],
  dataset: [],
  count: 0,
})

// Base keyed a statement by its trimmed text plus its occurrence.
const legacyKeyOf = (trimmedSql: string) => `${trimmedSql}\u00010`

describe("rekeyLegacyStatementKeys", () => {
  const first = "select  1"
  const second = "select  2"
  const [headFirst, headSecond] = statementKeysFor([first, second])

  it("translates legacy keys to head keys by the statement they described", () => {
    // Given a snapshot keyed the way base saved it
    const keys = {
      activeStatementKey: legacyKeyOf(second),
      refreshErrors: [{ statementKey: legacyKeyOf(first), message: "boom" }],
      slotFetchedAt: [{ statementKey: legacyKeyOf(second), fetchedAt: 7 }],
    }

    // When it is re-keyed against its saved results
    const results = [dqlResult(first), dqlResult(second)]
    const rekeyed = rekeyLegacyStatementKeys(
      results,
      resultStatementKeys(results),
      keys,
    )

    // Then every key is the head key of the same statement
    expect(rekeyed).toEqual({
      activeStatementKey: headSecond,
      refreshErrors: [{ statementKey: headFirst, message: "boom" }],
      slotFetchedAt: [{ statementKey: headSecond, fetchedAt: 7 }],
    })
  })

  it("returns null when every key is already a head key", () => {
    // Given a snapshot saved by head
    const keys = {
      activeStatementKey: headFirst,
      refreshErrors: [{ statementKey: headFirst, message: "boom" }],
    }

    // When it is re-keyed
    // Then nothing needed translation
    const results = [dqlResult(first)]
    expect(
      rekeyLegacyStatementKeys(results, resultStatementKeys(results), keys),
    ).toBeNull()
  })

  it("passes a key of a statement that is no longer in the results through unchanged", () => {
    // Given a legacy error for a surviving statement and one for a removed one
    const gone = legacyKeyOf("select gone")
    const keys = {
      refreshErrors: [
        { statementKey: legacyKeyOf(first), message: "boom" },
        { statementKey: gone, message: "dropped" },
      ],
    }

    // When it is re-keyed
    const results = [dqlResult(first)]
    const rekeyed = rekeyLegacyStatementKeys(
      results,
      resultStatementKeys(results),
      keys,
    )

    // Then the surviving key translates and the removed one is left for the
    // live-key filter
    expect(rekeyed?.refreshErrors).toEqual([
      { statementKey: headFirst, message: "boom" },
      { statementKey: gone, message: "dropped" },
    ])
  })
})
