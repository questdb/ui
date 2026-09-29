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
})
