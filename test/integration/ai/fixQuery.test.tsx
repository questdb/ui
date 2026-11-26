// @vitest-environment jsdom
import React from "react"
import {
  renderChat,
  openChat,
  chatServer,
  fixtures,
  getAllByHook,
  getByHook,
  queryByHook,
  gate,
  failQuery,
  seedChat,
} from "./support/chatHarness"
import { expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "../../../src/components/Button"
import { useMCPBridge } from "../../../src/providers/MCPBridgeProvider"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import type { AgentPromptMessage } from "../../../src/utils/localAgent/protocol"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import { EXPECTED_MCP_VERSION as v } from "../../../src/utils/mcp/protocolVersion"
import {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

const win = window as unknown as BridgeTestWindow

// The console's answer to the agent's call.
const toolResult = () => {
  const [result] = win.__mcpFakeWS.framesOfType("tool_result") as Array<{
    requestId: string
    isError: boolean
    content: Array<{ type: string; text: string }>
  }>
  return result
}

it("starts one Fix answer for a double click, and Stop cancels its request", async () => {
  // Given a chat about a failed query and an answer that waits
  const sql = "SELECT * FROM tradess"
  const queryKey = failQuery(1, sql, {
    message: "table does not exist [table=tradess]",
    position: 14,
  })
  await seedChat("Failed query", {
    bufferId: 1,
    queryKey,
    currentSQL: sql,
    messages: [],
  })
  const reply = gate()
  const server = chatServer("openai", [
    async () => {
      await reply.promise
      return fixtures.createFinalResponse("openai", "Use the trades table.")
    },
  ])
  renderChat()
  await openChat()

  // When the user clicks Fix query twice before the chat re-renders
  const fix = screen.getByRole("button", { name: "Fix query" })
  act(() => {
    fix.click()
    fix.click()
  })

  // Then one answer starts
  await waitFor(() => expect(server.requests).toHaveLength(1))
  expect(getAllByHook("chat-message-user")).toHaveLength(1)
  expect(server.requests[0].request.signal.aborted).toBe(false)

  // When the user stops it
  await userEvent.click(
    screen.getByRole("button", { name: "Stop AI generation" }),
  )

  // Then its request is cancelled and the late answer is not shown
  expect(server.requests[0].request.signal.aborted).toBe(true)
  await reply.release()
  await waitFor(() =>
    expect(queryByHook("chat-stop-button")).not.toBeInTheDocument(),
  )
  expect(screen.queryByText("Use the trades table.")).not.toBeInTheDocument()
  expect(server.requests).toHaveLength(1)
})

const ConnectBridge = () => {
  const { connect } = useMCPBridge()
  return (
    <Button onClick={() => connect(TEST_BRIDGE_URL, TEST_BRIDGE_TOKEN)}>
      Connect fake bridge
    </Button>
  )
}

// The chat, with a connected agent selected, ready to answer.
const openChatWithAgent = async () => {
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  renderChat(
    "openai",
    <ConnectBridge />,
    {
      ...(JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ) as AiAssistantSettings),
      selectedModel: LOCAL_AGENT_MODEL,
    },
    { bridge: true },
  )
  await userEvent.click(
    screen.getByRole("button", { name: "Connect fake bridge" }),
  )
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("hello")).toHaveLength(1),
  )
  act(() => {
    win.__mcpFakeWS.helloAck({
      agent: { id: "mock-local", label: "Mock local agent", cwd: "/tmp" },
    })
    win.__mcpFakeWS.receive({
      v,
      type: "agent_status",
      state: "ready",
      config: null,
      error: null,
    })
  })
  await openChat()
}

it("shows an agent's Fix query answer as a change to accept or reject", async () => {
  // Given a chat about a failed query, with a connected agent selected
  const sql = "SELEC 1"
  const queryKey = failQuery(1, sql, {
    message: "unexpected token [SELEC]",
    position: 0,
  })
  await seedChat("Failed query", {
    bufferId: 1,
    queryKey,
    currentSQL: sql,
    messages: [],
  })
  await openChatWithAgent()

  // When the user clicks Fix query
  await userEvent.click(screen.getByRole("button", { name: "Fix query" }))

  // Then the agent, which has suggest_query among the tools the console
  // offered, is asked to propose the fix with it
  const [hello] = win.__mcpFakeWS.framesOfType("hello") as Array<{
    tools: Array<{ name: string }>
  }>
  expect(hello.tools.map(({ name }) => name)).toContain("suggest_query")
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("agent_prompt")).toHaveLength(1),
  )
  const [prompt] = win.__mcpFakeWS.framesOfType(
    "agent_prompt",
  ) as unknown as AgentPromptMessage[]
  const [request] = prompt.prompt
  expect(request.type === "text" && request.text).toContain(
    "Propose the fixed query with the suggest_query tool",
  )

  // When the agent suggests the fixed query, then ends its answer
  act(() =>
    win.__mcpFakeWS.receive({
      v,
      type: "tool_call",
      requestId: "suggest",
      name: "suggest_query",
      arguments: { query: "SELECT 1" },
      deadlineMs: null,
      conversationId: prompt.conversationId,
    }),
  )
  await waitFor(() =>
    expect(win.__mcpFakeWS.framesOfType("tool_result")).toHaveLength(1),
  )
  const turn = {
    v,
    conversationId: prompt.conversationId,
    turnId: prompt.turnId,
  }
  act(() => {
    win.__mcpFakeWS.receive({
      ...turn,
      type: "agent_update",
      update: {
        kind: "message_chunk",
        messageId: "fix",
        text: "SELEC is a typo of SELECT.",
      },
    })
    win.__mcpFakeWS.receive({
      ...turn,
      type: "agent_turn_end",
      result: { outcome: "completed", stopReason: "end_turn", usage: null },
    })
  })

  // Then the agent was told the suggestion shows, and the answer shows the
  // change from the failed query to the fix, with Accept and Reject
  expect(toolResult()).toMatchObject({ requestId: "suggest", isError: false })
  expect(toolResult().content[0].text).toMatch(
    /^Query suggestion registered\. It will be shown to the user as a suggestion they can accept or reject\./,
  )
  const diff = await waitFor(() => getByHook("inline-diff-container"))
  expect(diff).toHaveTextContent("Suggested change")
  expect(within(diff).getByText("SELEC 1")).toBeVisible()
  expect(within(diff).getByText("SELECT 1")).toBeVisible()
  expect(within(diff).getByRole("button", { name: "Accept" })).toBeEnabled()
  expect(within(diff).getByRole("button", { name: "Reject" })).toBeEnabled()
  expect(screen.getByText("SELEC is a typo of SELECT.")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  ["from the terminal, naming no chat", undefined],
  ["naming a chat with no answer running", "chat-without-answer"],
])(
  "tells an agent that its suggest_query %s showed nothing",
  async (_, conversationId) => {
    // Given a connected agent, with no chat answer running
    await openChatWithAgent()

    // When the agent suggests a query
    act(() =>
      win.__mcpFakeWS.receive({
        v,
        type: "tool_call",
        requestId: "suggest",
        name: "suggest_query",
        arguments: { query: "SELECT 1" },
        deadlineMs: null,
        ...(conversationId && { conversationId }),
      }),
    )

    // Then the agent learns that the user saw nothing, and no change shows
    await waitFor(() =>
      expect(win.__mcpFakeWS.framesOfType("tool_result")).toHaveLength(1),
    )
    expect(toolResult()).toMatchObject({ requestId: "suggest", isError: true })
    expect(toolResult().content[0].text).toMatch(
      /^suggest_query works only during an AI Assistant chat answer; nothing was shown to the user\./,
    )
    expect(queryByHook("inline-diff-container")).not.toBeInTheDocument()
  },
)
