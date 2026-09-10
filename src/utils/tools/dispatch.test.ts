import "../../test/stubBrowserGlobals"
import { describe, expect, it } from "vitest"
import { dispatchTool } from "./dispatch"
import { executeTool } from "../ai/shared"
import type { ModelToolsClient, StatusCallback } from "../ai/aiAssistant"
import type { Table } from "../questdb/types"

const UNSAFE_ROW_COUNT = BigInt("9007199254740993")

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

const toolSurfaces = [
  {
    name: "dispatchTool",
    run: (client: ModelToolsClient) =>
      dispatchTool(
        "get_table_details",
        { table_name: "trades" },
        client,
        ignoreStatus,
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
