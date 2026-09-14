import "../../test/stubBrowserGlobals"
import { describe, expect, it, vi } from "vitest"
import { createModelToolsClient } from "./aiAssistant"
import { Type } from "../questdb/types"
import type { Client } from "../questdb/client"
import type { Table, TableType } from "../questdb/types"

const makeTable = (name: string, tableType: TableType): Table =>
  ({ table_name: name, table_type: tableType }) as Table

const TABLES = [
  makeTable("btc_trades", "T"),
  makeTable("btc_trades_mv", "M"),
  makeTable("btc_trades_view", "V"),
  makeTable("btc_trades_lv", "L"),
]

describe("createModelToolsClient getTableSchema", () => {
  it("should request DDL with the kind resolved from the table list", async () => {
    // Given a quest client whose DDL requests are captured
    const showDDL = vi
      .fn<[string, string], Promise<unknown>>()
      .mockResolvedValue({ type: Type.DQL, data: [{ ddl: "CREATE ..." }] })
    const toolsClient = createModelToolsClient(
      { showDDL } as unknown as Client,
      TABLES,
    )

    // When the model asks for the schema of each table kind
    await toolsClient.getTableSchema?.("btc_trades")
    await toolsClient.getTableSchema?.("btc_trades_mv")
    await toolsClient.getTableSchema?.("btc_trades_view")
    await toolsClient.getTableSchema?.("btc_trades_lv")

    // Then every request carries the kind of its own table
    expect(showDDL.mock.calls).toEqual([
      ["btc_trades", "table"],
      ["btc_trades_mv", "matview"],
      ["btc_trades_view", "view"],
      ["btc_trades_lv", "liveview"],
    ])
  })

  it("should return the DDL from a successful response", async () => {
    // Given a quest client that answers with DDL
    const showDDL = vi.fn().mockResolvedValue({
      type: Type.DQL,
      data: [{ ddl: "CREATE LIVE VIEW 'btc_trades_lv' ..." }],
    })
    const toolsClient = createModelToolsClient(
      { showDDL } as unknown as Client,
      TABLES,
    )

    // When / Then
    await expect(toolsClient.getTableSchema?.("btc_trades_lv")).resolves.toBe(
      "CREATE LIVE VIEW 'btc_trades_lv' ...",
    )
  })

  it("should return null without a DDL request for an unknown table", async () => {
    // Given a quest client and a table name that is not in the table list
    const showDDL = vi.fn()
    const toolsClient = createModelToolsClient(
      { showDDL } as unknown as Client,
      TABLES,
    )

    // When / Then
    await expect(toolsClient.getTableSchema?.("nope")).resolves.toBeNull()
    expect(showDDL).not.toHaveBeenCalled()
  })
})
