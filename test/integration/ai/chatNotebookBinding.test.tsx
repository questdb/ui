// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import {
  chatServer,
  fixtures,
  openChat,
  renderChat,
  sendMessage,
} from "./support/chatHarness"
import { Button } from "../../../src/components/Button"
import { useMCPBridge } from "../../../src/providers/MCPBridgeProvider"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import { db } from "../../../src/store/db"
import { aiConversationStore } from "../../../src/store/aiConversations"
import { LOCAL_AGENT_MODEL } from "../../../src/utils/localAgent/localAgentModel"
import { EXPECTED_MCP_VERSION as v } from "../../../src/utils/mcp/protocolVersion"
import {
  registerWorkspace,
  unregisterWorkspace,
} from "../../../src/utils/notebooks/notebookAIBridge"
import {
  installFakeWebSocket,
  TEST_BRIDGE_TOKEN,
  TEST_BRIDGE_URL,
  type BridgeTestWindow,
} from "../../e2e/utils/mcpFakeWebSocket"

const win = window as unknown as BridgeTestWindow
const ask = "Create a notebook with a chart of trades."
const created = { bufferId: 4101, label: "Trades" }

afterEach(() => {
  unregisterWorkspace()
})

const createWithApiModel = async () => {
  chatServer("openai", [
    fixtures.createToolCallResponse("openai", "create_notebook", {
      label: created.label,
    }),
    fixtures.createFinalResponse("openai", "Created the notebook."),
  ])
  renderChat()
  await openChat()
  await sendMessage(ask)
  await screen.findByText("Created the notebook.")
  const [conversation] = await db.ai_conversations.toArray()
  return conversation.id
}

const ConnectBridge = () => {
  const { connect } = useMCPBridge()
  return (
    <Button onClick={() => connect(TEST_BRIDGE_URL, TEST_BRIDGE_TOKEN)}>
      Connect fake bridge
    </Button>
  )
}

const createWithChatAgent = async () => {
  const original = window.WebSocket
  installFakeWebSocket(window)
  const transport = window.WebSocket
  window.WebSocket = original
  vi.stubGlobal("WebSocket", transport)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
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
  const bridge = win.__mcpFakeWS
  act(() => {
    bridge.helloAck({
      v,
      agent: { id: "mock-local", label: "Mock local agent", cwd: "/tmp/mock" },
    })
    bridge.receive({
      v,
      type: "agent_status",
      state: "ready",
      config: null,
      error: null,
    })
  })
  await openChat()
  await sendMessage(ask)
  await waitFor(() =>
    expect(bridge.framesOfType("agent_prompt")).toHaveLength(1),
  )
  const conversationId = bridge.framesOfType("agent_prompt")[0]
    .conversationId as string
  act(() =>
    bridge.receive({
      v,
      type: "tool_call",
      requestId: "create-trades",
      name: "create_notebook",
      arguments: { label: created.label },
      deadlineMs: null,
      conversationId,
    }),
  )
  await waitFor(() =>
    expect(bridge.framesOfType("tool_result")).toEqual([
      expect.objectContaining({ requestId: "create-trades", isError: false }),
    ]),
  )
  return conversationId
}

// Every model a chat runs on creates notebooks through the same tool, and a
// notebook it creates binds the chat, whichever path dispatched the call.
it.each([
  ["an API model", createWithApiModel],
  ["a chat agent", createWithChatAgent],
])(
  "binds an unbound chat to the notebook %s creates in it",
  async (_, createNotebookFromChat) => {
    // Given a chat opened with no notebook, and a workspace that creates one
    registerWorkspace({
      createNotebook: () => Promise.resolve(created),
      duplicateNotebook: () => Promise.reject(new Error("not used")),
      deleteNotebook: () => Promise.resolve(),
      activateNotebook: () => Promise.resolve(true),
      listNotebookBuffers: () => [],
    })

    // When the model the chat runs on creates a notebook
    const conversationId = await createNotebookFromChat()

    // Then the chat is bound to it
    await waitFor(async () =>
      expect(
        (await aiConversationStore.getMeta(conversationId))?.notebookBufferId,
      ).toBe(created.bufferId),
    )
  },
)
