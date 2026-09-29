import "../../../../test/stubBrowserGlobals"
import { describe, expect, it, vi } from "vitest"
import type { Client } from "../../../../utils/questdb/client"
import { captureExecution } from "./captureExecution"

const client = () => ({
  validateQuery: vi.fn((query: string) =>
    Promise.resolve({
      query,
      columns: [],
      timestamp: -1,
    }),
  ),
  queryRaw: vi.fn((_sql: string) => ({
    queryId: "q",
    promise: Promise.resolve({
      type: "dql",
      columns: [],
      dataset: [],
      count: 0,
    }),
  })),
  abort: vi.fn(),
})

describe("captureExecution", () => {
  it("waits before capturing and keeps the same declarations across statements", async () => {
    // Given
    const quest = client()
    let finish!: () => void
    const ready = new Promise<void>((resolve) => {
      finish = resolve
    })
    let entries = [{ name: "a", value: "1" }]
    const read = vi.fn(() => entries)
    // When
    const pending = captureExecution(
      quest as unknown as Client,
      () => ready,
      read,
    )
    expect(read).not.toHaveBeenCalled()
    entries = [{ name: "a", value: "2" }]
    finish()
    const execution = await pending
    await execution.executeSingle("SELECT @a")
    entries = [{ name: "a", value: "3" }]
    await execution.executeSingle("SELECT @a + 1")
    // Then
    expect(quest.queryRaw.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("@a := 2"),
      expect.stringContaining("@a := 2"),
    ])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("sends a cell's own declaration to QuestDB for validation and execution", async () => {
    // Given
    const quest = client()
    const execution = await captureExecution(
      quest as unknown as Client,
      () => Promise.resolve(),
      () => [],
    )
    // When
    const sql = "DECLARE @a := 5 SELECT @a"
    await execution.validateWithGlobals(sql)
    const result = await execution.executeSingle(sql)
    // Then
    expect(quest.validateQuery.mock.calls.map(([query]) => query)).toEqual([
      sql,
    ])
    expect(quest.queryRaw.mock.calls.map(([query]) => query)).toEqual([sql])
    expect(result.type).toBe("dql")
  })

  it("returns QuestDB's error when a referenced variable has no declaration", async () => {
    // Given
    const quest = client()
    quest.queryRaw.mockImplementation(() => ({
      queryId: "q",
      promise: Promise.resolve({
        type: "error",
        error: "undeclared variable: @a",
        columns: [],
        dataset: [],
        count: 0,
      }),
    }))
    const execution = await captureExecution(
      quest as unknown as Client,
      () => Promise.resolve(),
      () => [],
    )

    // When
    const result = await execution.executeSingle("SELECT @a")

    // Then
    expect(quest.queryRaw.mock.calls.map(([query]) => query)).toEqual([
      "SELECT @a",
    ])
    expect(result).toMatchObject({
      type: "error",
      error: "undeclared variable: @a",
    })
  })
})
