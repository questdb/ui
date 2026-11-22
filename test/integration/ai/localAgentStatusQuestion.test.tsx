// @vitest-environment jsdom
import React from "react"
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import {
  fixtures,
  getByHook,
  openChat,
  queryByHook,
  renderChat,
  sendMessage,
} from "./support/chatHarness"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import { AIStatusIndicator } from "../../../src/components/AIStatusIndicator"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../../../src/utils/localAgent/localAgentChannel"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentQuestionField,
} from "../../../src/utils/localAgent/protocol"
import type { MCPBridgeClient } from "../../../src/utils/mcp/MCPBridgeClient"

const bridge = vi.hoisted(() => ({ channel: null as LocalAgentChannel | null }))
vi.mock("../../../src/utils/localAgent/LocalAgentContext", async (load) => {
  const { useSyncExternalStore } = await import("react")
  return {
    ...(await load<
      typeof import("../../../src/utils/localAgent/LocalAgentContext")
    >()),
    useLocalAgent: () =>
      useSyncExternalStore(
        bridge.channel?.subscribe ?? (() => () => undefined),
        bridge.channel?.getSnapshot ?? (() => null),
      ),
    useLocalAgentChannel: () => bridge.channel,
  }
})

const PROMPT = "Which display style do you prefer?"
const choice: AgentQuestionField = {
  id: "style",
  kind: "choice",
  title: null,
  prompt: PROMPT,
  options: [{ value: "compact", label: "Compact", description: null }],
  multiple: false,
  required: true,
  otherFieldId: null,
}

const localAgentSettings = {
  ...(JSON.parse(
    fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
  ) as AiAssistantSettings),
  selectedModel: "local-agent",
}

const mockAgent = () => {
  const sent: AgentInboundMessage[] = []
  let deliver!: (message: AgentOutboundMessage) => void
  const client = {
    canSendAgentMessage: () => true,
    on: (event: string, handler: typeof deliver) => {
      if (event === "agentMessage") deliver = handler
      return () => undefined
    },
    sendAgentMessage: (message: AgentInboundMessage) => {
      sent.push(message)
      return true
    },
  } as unknown as MCPBridgeClient
  const channel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Mock local agent", cwd: "/tmp" },
    onNotebookRead: vi.fn(),
  })
  bridge.channel = channel
  registerLocalAgentChannel(channel)
  deliver({
    v: "0.6.0",
    type: "agent_status",
    state: "ready",
    config: null,
    error: null,
  })
  return {
    sent,
    deliver: (m: AgentOutboundMessage) => deliver(m),
    channel,
    dispose: () => {
      unregisterLocalAgentChannel(channel)
      bridge.channel = null
      channel.dispose()
    },
  }
}

it.each(["question", "link"])(
  "tells the user a pending %s waits for them while the chat is closed",
  async (kind) => {
    const { sent, deliver, dispose } = mockAgent()
    try {
      renderChat("openai", <AIStatusIndicator />, localAgentSettings)
      await openChat()
      await sendMessage("Show a sample query")
      const prompt = sent.find((m) => m.type === "agent_prompt")
      if (!prompt) throw new Error("Expected a local agent prompt")
      const { v, conversationId } = prompt

      // The user closes the drawer while the turn runs.
      await userEvent.click(getByHook("chat-window-close"))
      await waitFor(() =>
        expect(getByHook("ai-status-text")).toHaveTextContent("Working..."),
      )

      const link = kind === "link"
      const url = "https://example.invalid/setup"
      act(() => {
        deliver({
          v,
          conversationId,
          type: "agent_question",
          requestId: "req-1",
          message: link ? `Open the setup page at ${url}` : PROMPT,
          ...(link && { url }),
          fields: link ? [] : [choice],
        } as AgentOutboundMessage)
      })
      expect(getByHook("ai-status-text")).toHaveTextContent(
        "Waiting for your answer",
      )

      await userEvent.click(getByHook("ai-status-view-chat"))
      const cardHook = link ? "chat-link-request" : "chat-question-card"
      await waitFor(() => expect(queryByHook(cardHook)).toBeVisible())
    } finally {
      dispose()
    }
  },
)
