// @vitest-environment jsdom
import { getHook, findHook, requestUrl } from "../../../src/test/component"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TEST_BRIDGE_TOKEN } from "../../e2e/utils/mcpFakeWebSocket"
import { connect, mountBridge, win } from "./bridgeHarness"

vi.mock("../../../src/modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))
const read = { grantSchemaAccess: true, read: true, write: false }
const none = { grantSchemaAccess: false, read: false, write: false }

describe("MCP permission integration", () => {
  it("waits for consent and sends the chosen None grant in its first hello", async () => {
    // Given
    await mountBridge()
    expect(getHook("permissions-trigger")).toHaveTextContent("Read")
    expect(win.__mcpFakeSockets).toHaveLength(0)

    // When
    await userEvent.click(getHook("permissions-trigger"))
    await userEvent.click(getHook("permission-level-none"))
    expect(getHook("permissions-trigger")).toHaveTextContent("None")
    await connect()

    // Then
    expect(win.__mcpFakeWS.framesOfType("hello")[0]).toMatchObject({
      token: TEST_BRIDGE_TOKEN,
      permissions: none,
    })
  })

  it("denies SQL and cached schema disclosure with a committed None grant", async () => {
    // Given
    const fetch = await mountBridge(none)
    expect(getHook("permissions-trigger")).toHaveTextContent("None")
    await connect()

    // When
    act(() => {
      win.__mcpFakeWS.toolCall(
        "run_query",
        { sql: "SELECT 1", limit: 10 },
        "query",
      )
      win.__mcpFakeWS.toolCall("get_tables", {}, "schema")
    })

    // Then
    await waitFor(() => {
      const results = win.__mcpFakeWS.framesOfType("tool_result")
      for (const id of ["query", "schema"]) {
        const result = results.find((result) => result.requestId === id)
        expect(result).toMatchObject({ isError: true })
        expect(JSON.stringify(result?.content)).toContain("PERMISSION_DENIED")
        expect(JSON.stringify(result)).not.toContain("private_trades")
      }
      expect(
        JSON.stringify(results.find((result) => result.requestId === "schema")),
      ).toContain("grantSchemaAccess")
    })
    expect(
      fetch.mock.calls.filter(
        ([input]) => requestUrl(input).pathname === "/exec",
      ),
    ).toHaveLength(0)
  })

  it("discards an uncommitted Write choice on Cancel and restores Read on reopening", async () => {
    // Given
    await mountBridge()
    await connect()
    expect(JSON.parse(localStorage.getItem("mcp:permissions")!)).toEqual(read)

    // When
    await userEvent.click(getHook("mcp-status-pill"))
    await findHook("mcp-pair-popover")
    await userEvent.click(getHook("permissions-trigger"))
    await userEvent.click(getHook("permission-level-write"))
    await userEvent.click(getHook("mcp-pair-cancel"))

    // Then
    expect(JSON.parse(localStorage.getItem("mcp:permissions")!)).toEqual(read)
    await userEvent.click(getHook("mcp-status-pill"))
    expect(getHook("permissions-trigger")).toHaveTextContent("Read")
  })
})
