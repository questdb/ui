import { describe, expect, it, vi } from "vitest"
import * as QuestDB from "./questdb"
import type { Client } from "./questdb/client"
import { executeSingleRaw } from "./executeSingleRaw"

const questReturningOneRow = () =>
  ({
    queryRaw: vi.fn(() => ({
      promise: Promise.resolve({
        type: QuestDB.Type.DQL,
        columns: [{ name: "price", type: "DOUBLE" }],
        dataset: [[1]],
        count: 1,
      }),
      queryId: 1,
    })),
    abort: vi.fn(),
  }) as unknown as Client

describe("executeSingleRaw", () => {
  it("treats a resolved ErrorResult as failure rather than a successful write", async () => {
    const error = {
      type: QuestDB.Type.ERROR,
      error: "not sent",
      position: -1,
      query: "insert into t values (1)",
      requestNotSent: true,
    }
    const quest = {
      queryRaw: vi.fn(() => ({ promise: Promise.resolve(error), queryId: 1 })),
      abort: vi.fn(),
    } as unknown as Client
    expect(await executeSingleRaw(quest, error.query, undefined)).toMatchObject(
      { type: "error", error: "not sent", requestNotSent: true },
    )
  })
  it("records the effective query, which differs per variable value while the query stays the same", async () => {
    // Given one statement that reads a notebook variable
    const sql = "select price from trades where symbol = @sym"

    // When it runs with two values of that variable
    const btc = await executeSingleRaw(questReturningOneRow(), sql, [
      { name: "sym", value: "'BTC-USD'" },
    ])
    const eth = await executeSingleRaw(questReturningOneRow(), sql, [
      { name: "sym", value: "'ETH-USD'" },
    ])

    // Then both keep the typed query, and each records the SQL it sent
    expect(btc.query).toBe(sql)
    expect(eth.query).toBe(sql)
    expect(btc.effectiveQuery).toContain("'BTC-USD'")
    expect(eth.effectiveQuery).toContain("'ETH-USD'")
  })
  it("sends the statement as written, with the variables beside it", async () => {
    // Given a server
    const queryRaw = vi.fn(() => ({
      promise: Promise.resolve({
        type: QuestDB.Type.DQL,
        columns: [],
        dataset: [],
        count: 0,
      }),
      queryId: 1,
    }))
    const quest = {
      queryRaw,
      abort: vi.fn(),
    } as unknown as Client
    // and a statement the client-side parser cannot parse (questdb/ui#631)
    const sql = "select @sym, ??? from trades"

    // When it runs with a notebook variable
    const result = await executeSingleRaw(quest, sql, [
      { name: "sym", value: "'BTC-USD'" },
    ])

    // Then the statement is sent as written, with the variables beside it
    expect(queryRaw).toHaveBeenCalledWith(
      sql,
      expect.objectContaining({ variables: "@sym := 'BTC-USD'" }),
    )
    expect(result.effectiveQuery).toContain("'BTC-USD'")
  })

  it("names the variable an error in the variables falls in", async () => {
    // Given a server that reports an error in the second variable
    const quest = {
      queryRaw: vi.fn(() => ({
        promise: Promise.reject({
          type: QuestDB.Type.ERROR,
          error: "unknown function name",
          position: "@a := 1\n, @b := ".length,
          errorSource: "variables",
        }),
        queryId: 1,
      })),
      abort: vi.fn(),
    } as unknown as Client

    // When a statement runs with those variables
    const result = await executeSingleRaw(quest, "select @b", [
      { name: "a", value: "1" },
      { name: "b", value: "nope()" },
    ])

    // Then the error names the variable
    expect(result).toMatchObject({
      type: "error",
      error: "unknown function name (in variable @b)",
    })
  })
})
