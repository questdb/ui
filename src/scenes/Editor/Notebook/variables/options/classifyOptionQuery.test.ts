import { describe, expect, it, vi } from "vitest"
import type { ValidateQueryResult } from "../../../../../utils/questdb/types"
import { classifyOptionQuery } from "./classifyOptionQuery"

const dql: ValidateQueryResult = {
  query: "",
  columns: [{ name: "symbol", type: "SYMBOL" }],
  timestamp: -1,
}

const entries = [{ name: "venue", value: "'LSE'" }]

describe("classifyOptionQuery", () => {
  it("accepts a query the server classifies as a result set", async () => {
    // Given
    const validate = vi.fn(() => Promise.resolve(dql))

    // When
    const verdict = await classifyOptionQuery(
      "SELECT symbol FROM t WHERE venue = @venue",
      entries,
      validate,
    )

    // Then
    expect(verdict).toEqual({ ok: true })
    expect(validate).toHaveBeenCalledWith(
      "DECLARE\n  @venue := 'LSE'\nSELECT symbol FROM t WHERE venue = @venue",
    )
  })

  it("declares only the entries the query references", async () => {
    // Given
    const validate = vi.fn(() => Promise.resolve(dql))

    // When
    await classifyOptionQuery(
      "SELECT symbol FROM t WHERE venue = @venue",
      [{ name: "pair", value: "('EURUSD', 'GBPUSD')" }, ...entries],
      validate,
    )

    // Then
    expect(validate).toHaveBeenCalledWith(
      "DECLARE\n  @venue := 'LSE'\nSELECT symbol FROM t WHERE venue = @venue",
    )
  })

  it("rejects a statement the server classifies as a write", async () => {
    // Given
    const validate = vi.fn(() =>
      Promise.resolve({ query: "", queryType: "INSERT" }),
    )

    // When
    const verdict = await classifyOptionQuery(
      "INSERT INTO t VALUES (1)",
      entries,
      validate,
    )

    // Then
    expect(verdict).toEqual({
      ok: false,
      error: "The option query must be a SELECT, not INSERT.",
    })
  })

  it("passes a server error through and refuses more than one statement", async () => {
    // Given
    const validate = vi.fn(() =>
      Promise.resolve({
        query: "",
        position: 8,
        error: "table does not exist",
      }),
    )

    // Then
    expect(
      await classifyOptionQuery("SELECT x FROM nope", [], validate),
    ).toEqual({ ok: false, error: "table does not exist" })
    expect(
      await classifyOptionQuery("SELECT 1; DROP TABLE t", [], validate),
    ).toEqual({ ok: false, error: "The query must be a single statement." })
    expect(validate).toHaveBeenCalledTimes(1)
  })
})
