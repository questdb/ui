import { describe, expect, it } from "vitest"
import type { AgentUpdate } from "./protocol"
import { classifyAgentToolCall, questdbToolName } from "./agentToolCalls"

const toolCall = (
  title: string,
  name: string | null = null,
): Extract<AgentUpdate, { kind: "tool_call" }> => ({
  kind: "tool_call",
  toolCallId: "call-1",
  title,
  name,
  toolKind: "other",
  status: "pending",
  content: null,
})

describe("classifyAgentToolCall", () => {
  it("recognises a QuestDB tool however each agent names it", () => {
    // Given
    const calls = [
      toolCall("Get tables", "mcp__questdb_console__get_tables"),
      toolCall("mcp.questdb_console.get_tables"),
      toolCall("questdb_console_get_tables"),
    ]

    // Then
    expect(calls.map(classifyAgentToolCall)).toEqual([
      "questdb",
      "questdb",
      "questdb",
    ])
    expect(calls.map(questdbToolName)).toEqual([
      "get_tables",
      "get_tables",
      "get_tables",
    ])
  })

  it("leaves Cursor's unnamed MCP steps to the console's own status", () => {
    // When
    const kind = classifyAgentToolCall(toolCall("MCP: tool"))

    // Then
    expect(kind).toBe("questdb")
    expect(questdbToolName(toolCall("MCP: tool"))).toBeNull()
  })

  it("keeps the agent's own tools, housekeeping and reviews apart", () => {
    // Then
    expect(classifyAgentToolCall(toolCall("yarn test"))).toBe("own")
    expect(classifyAgentToolCall(toolCall("tool_search 'questdb'"))).toBe(
      "lookup",
    )
  })
})
