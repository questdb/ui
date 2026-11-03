import "../../test/stubBrowserGlobals"
import { describe, expect, it, vi } from "vitest"
import { dispatchTool } from "./dispatch"
import { executeTool } from "../ai/shared"
import type { ModelToolsClient, StatusCallback } from "../ai/aiAssistant"
import type { Client } from "../questdb/client"
import type { Table } from "../questdb/types"
import type { Permissions } from "./permissions"
import { mapQueryRawToResult } from "./runQuery"
import {
  AuthRefreshUnavailableError,
  SESSION_ENDED_MESSAGE,
} from "../../modules/OAuth2/session"
import { UNVERIFIED_RUN_NOTE } from "../../scenes/Editor/Notebook/notebookUtils"

const UNSAFE_ROW_COUNT = BigInt("9007199254740993")

const ALL_GRANTED: Permissions = {
  grantSchemaAccess: true,
  read: true,
  write: true,
}
const dqlValidator = () =>
  Promise.resolve({ query: "", columns: [], timestamp: 0 })

const tableWithBigIntCounters = (): Table =>
  ({
    table_name: "trades",
    table_row_count: UNSAFE_ROW_COUNT,
    o3MaxLag: BigInt(300_000),
    table_txn: BigInt(42),
  }) as Table

const clientReturning = (table: Table | null): ModelToolsClient =>
  ({
    getTableDetails: () => Promise.resolve(table),
  }) as unknown as ModelToolsClient

const ignoreStatus: StatusCallback = () => {}

// A model client mapped by the console's run_query adapter over a client
// whose request rejects the way the real client does.
const clientRejectingQuery = (failure: unknown): ModelToolsClient => {
  const quest = {
    queryRaw: () => ({ promise: Promise.reject(failure), queryId: 1 }),
    abort: vi.fn(),
  } as unknown as Client
  return {
    runQueryRaw: (sql: string, limit: number, signal?: AbortSignal) =>
      mapQueryRawToResult(quest, sql, limit, signal),
  } as unknown as ModelToolsClient
}

describe("dispatchTool run_query after the session ends", () => {
  const sql = "INSERT INTO trades VALUES (1)"
  const runQuery = (failure: Record<string, unknown>) =>
    dispatchTool(
      "run_query",
      { sql },
      clientRejectingQuery({
        position: -1,
        query: sql,
        type: "error",
        ...failure,
      }),
      ignoreStatus,
      ALL_GRANTED,
      dqlValidator,
    )

  it("marks a statement interrupted on the server as unverified", async () => {
    // Given the session ended while the statement was being executed
    const result = await runQuery({
      error: SESSION_ENDED_MESSAGE,
      sessionEnded: true,
    })

    // Then the agent must verify the outcome instead of re-running a write
    expect(result.is_error).toBe(true)
    expect(JSON.parse(result.content)).toEqual({
      error: SESSION_ENDED_MESSAGE,
      position: -1,
      unverified: true,
      note: UNVERIFIED_RUN_NOTE,
    })
  })

  it.each([
    {
      reason: "renewal failed before sending",
      failure: {
        error: new AuthRefreshUnavailableError().message,
        authRefreshUnavailable: true,
        requestNotSent: true,
      },
    },
    {
      reason: "the session ended before sending",
      failure: {
        error: SESSION_ENDED_MESSAGE,
        sessionEnded: true,
        requestNotSent: true,
      },
    },
  ])(
    "reports a statement that never executed as a plain error when $reason",
    async ({ failure }) => {
      const result = await runQuery(failure)

      // A retry is safe: nothing reached the server's SQL engine
      expect(result.is_error).toBe(true)
      expect(JSON.parse(result.content)).toEqual({
        error: failure.error,
        position: -1,
      })
    },
  )
})

const toolSurfaces = [
  {
    name: "dispatchTool",
    run: (client: ModelToolsClient) =>
      dispatchTool(
        "get_table_details",
        { table_name: "trades" },
        client,
        ignoreStatus,
        ALL_GRANTED,
        dqlValidator,
      ),
  },
  {
    name: "executeTool",
    run: (client: ModelToolsClient) =>
      executeTool(
        "get_table_details",
        { table_name: "trades" },
        client,
        ignoreStatus,
      ),
  },
]

for (const surface of toolSurfaces) {
  describe(`${surface.name} get_table_details`, () => {
    it("should serialize bigint catalog counters as decimal strings", async () => {
      // Given a table whose catalog LONGs arrived as bigint
      const client = clientReturning(tableWithBigIntCounters())

      // When the model asks for its details
      const result = await surface.run(client)

      // Then the tool answers with JSON that keeps every digit
      expect(result.is_error).toBeFalsy()
      expect(JSON.parse(result.content)).toMatchObject({
        table_name: "trades",
        table_row_count: "9007199254740993",
        o3MaxLag: "300000",
        table_txn: "42",
      })
    })

    it("should report an error when the table has no details", async () => {
      // Given a table the catalog does not know
      const client = clientReturning(null)

      // When the model asks for its details
      const result = await surface.run(client)

      // Then the tool reports the miss instead of an empty result
      expect(result).toEqual({
        content: "Table details not found",
        is_error: true,
      })
    })
  })
}
