// @vitest-environment jsdom
import {
  renderChat,
  chatServer,
  fixtures,
  getByHook,
} from "./support/chatHarness"
import {
  raw,
  table,
} from "../../../src/scenes/Schema/TableDetailsDrawer/test/catalogFixtures"
import React from "react"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import { TableDetailsDrawer } from "../../../src/scenes/Schema/TableDetailsDrawer"
import { actions } from "../../../src/store"

describe("table warning AI action", () => {
  it("sends the selected warning and table context, renders its answer, and returns to the table", async () => {
    // Given
    const server = chatServer("openai", [
      fixtures.createFinalResponse(
        "openai",
        "Batch the small transactions before ingestion.",
      ),
    ])
    server.other = (request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith(".md"))
        return new Response(
          "## Small transactions\nBatch rows to increase transaction size.",
        )
      const query = url.searchParams.get("query") ?? ""
      if (query.startsWith("tables()"))
        return Response.json(raw([{ ...table(), wal_tx_size_p90: BigInt(50) }]))
      if (query.startsWith("SHOW COLUMNS"))
        return Response.json(
          raw([
            {
              column: "symbol",
              type: "SYMBOL",
              indexed: false,
              designated: false,
            },
          ]),
        )
      if (query.startsWith("SHOW CREATE"))
        return Response.json(
          raw([{ ddl: "CREATE TABLE trades (symbol SYMBOL);" }]),
        )
      throw new Error(`Unexpected request: ${url}`)
    }
    const { store } = renderChat("openai", <TableDetailsDrawer />)
    await act(async () => {
      store.dispatch(
        actions.console.pushSidebarHistory({
          type: "tableDetails",
          payload: { tableName: "trades", kind: "table" },
        }),
      )
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(getByHook("table-details-warning-ask-ai")).toBeEnabled(),
    )
    // When
    await userEvent.click(getByHook("table-details-warning-ask-ai"))
    // Then
    await waitFor(() =>
      expect(getByHook("chat-message-assistant")).toHaveTextContent(
        "Batch the small transactions before ingestion.",
      ),
    )
    expect(getByHook("chat-message-user")).toHaveTextContent(
      "Small transactions",
    )
    expect(server.requests).toHaveLength(1)
    const request = JSON.stringify(server.requests[0].body)
    expect(request).toContain("trades")
    expect(request).toContain("Small transactions")
    expect(request).toContain("50")
    // When
    await userEvent.click(getByHook("sidebar-back-button"))
    // Then
    await waitFor(() =>
      expect(getByHook("table-details-name")).toHaveValue("trades"),
    )
    expect(getByHook("table-details-performance-alerts")).toHaveTextContent(
      "Small transactions",
    )
  })
})
