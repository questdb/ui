import { describe, expect, it } from "vitest"
import type { DqlQueryResult } from "../../../../store/notebook"
import { resultStatementKeys, statementKeysFor } from "../statementIdentity"
import { rekeyLegacyStatementKeys } from "./legacyStatementKeys"

// Legacy snapshots persisted results without their fetch time.
const dqlResult = (query: string): DqlQueryResult => ({
  type: "dql",
  query,
  columns: [],
  dataset: [],
  count: 0,
})

const fetchedDqlResult = (query: string): DqlQueryResult => ({
  ...dqlResult(query),
  fetchedAt: 500,
})

// Legacy snapshots keyed a statement by its trimmed text plus its occurrence.
const legacyKeyOf = (trimmedSql: string) => `${trimmedSql}\u00010`

describe("rekeyLegacyStatementKeys", () => {
  const first = "select  1"
  const second = "select  2"
  const [currentFirst, currentSecond] = statementKeysFor([first, second])

  it("translates legacy keys to current keys by the statement they described", () => {
    // Given a snapshot keyed the legacy way
    const keys = {
      activeStatementKey: legacyKeyOf(second),
      refreshErrors: [{ statementKey: legacyKeyOf(first), message: "boom" }],
    }

    // When it is re-keyed against its saved results
    const results = [dqlResult(first), dqlResult(second)]
    const rekeyed = rekeyLegacyStatementKeys(
      results,
      resultStatementKeys(results),
      keys,
    )

    // Then every key is the current key of the same statement
    expect(rekeyed).toEqual({
      activeStatementKey: currentSecond,
      refreshErrors: [{ statementKey: currentFirst, message: "boom" }],
    })
  })

  it("returns null for a current snapshot, whose results carry their fetch time", () => {
    // Given a snapshot saved with current keys
    const keys = {
      activeStatementKey: currentFirst,
      refreshErrors: [{ statementKey: currentFirst, message: "boom" }],
    }

    // When it is re-keyed
    // Then nothing needed translation
    const results = [fetchedDqlResult(first)]
    expect(
      rekeyLegacyStatementKeys(results, resultStatementKeys(results), keys),
    ).toBeNull()
  })

  it("maps a legacy key by position even when it spells another statement's current key", () => {
    // Given a legacy snapshot of `select 1; SELECT 1` with the second tab
    // active and an error on each statement: the legacy key of statement 2 is
    // the current key of statement 1
    const lower = "select 1"
    const upper = "SELECT 1"
    const [currentLower, currentUpper] = statementKeysFor([lower, upper])
    expect(legacyKeyOf(upper)).toBe(currentLower)
    const keys = {
      activeStatementKey: legacyKeyOf(upper),
      refreshErrors: [
        { statementKey: legacyKeyOf(lower), message: "first" },
        { statementKey: legacyKeyOf(upper), message: "second" },
      ],
    }

    // When it is re-keyed against its saved results
    const results = [dqlResult(lower), dqlResult(upper)]
    const rekeyed = rekeyLegacyStatementKeys(
      results,
      resultStatementKeys(results),
      keys,
    )

    // Then each key lands on the statement it described
    expect(rekeyed).toEqual({
      activeStatementKey: currentUpper,
      refreshErrors: [
        { statementKey: currentLower, message: "first" },
        { statementKey: currentUpper, message: "second" },
      ],
    })
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
      { statementKey: currentFirst, message: "boom" },
      { statementKey: gone, message: "dropped" },
    ])
  })
})
