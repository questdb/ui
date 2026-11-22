// @vitest-environment jsdom
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
import { aiConversationStore } from "../../../src/store/aiConversations"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../../../src/utils/localAgent/localAgentChannel"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
} from "../../../src/utils/localAgent/protocol"
import type { MCPBridgeClient } from "../../../src/utils/mcp/MCPBridgeClient"

const bridge = vi.hoisted(() => ({ channel: null as LocalAgentChannel | null }))
vi.mock("../../../src/utils/localAgent/LocalAgentContext", async (load) => ({
  ...(await load<
    typeof import("../../../src/utils/localAgent/LocalAgentContext")
  >()),
  useLocalAgent: () => bridge.channel?.getSnapshot() ?? null,
  useLocalAgentChannel: () => bridge.channel,
}))

const partialSQL = "```sql\nSELECT 42;"
const noticeExample =
  '```agent-notice\n{"severity":"info","title":"Example","description":null}\n```'
const markdownExample = `\`\`\`\`markdown\n${noticeExample}\n\`\`\`\``

it.each([
  { name: "before any answer text", partial: "", stopReason: "max_tokens" },
  {
    name: "after truncated SQL",
    partial: partialSQL,
    stopReason: "max_tokens",
  },
  {
    name: "with an ordinary Markdown example",
    partial: markdownExample,
    stopReason: "end_turn",
  },
  {
    name: "after a delayed housekeeping completion",
    partial: "The sample is ready.",
    suffix: " The preview is included.",
    stopReason: "max_tokens",
  },
])(
  "renders persisted local-agent history $name",
  async ({ partial, stopReason, suffix }) => {
    const settings = {
      ...(JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ) as import("../../../src/providers/LocalStorageProvider/types").AiAssistantSettings),
      selectedModel: "local-agent",
    }
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
    try {
      deliver({
        v: "0.6.0",
        type: "agent_status",
        state: "ready",
        config: null,
        error: null,
      })
      const mounted = renderChat("openai", undefined, settings)
      await openChat()
      await sendMessage("Show a sample query")
      const prompt = sent.find((message) => message.type === "agent_prompt")
      if (!prompt) throw new Error("Expected a local agent prompt")
      const { v, conversationId, turnId } = prompt
      const ids = { v, conversationId, turnId }
      act(() => {
        deliver({
          ...ids,
          type: "agent_update",
          update: { kind: "thought_chunk", text: "Preparing a sample." },
        })
      })
      expect(getByHook("assistant-mode-thinking")).toBeVisible()
      await act(async () => {
        await Promise.resolve()
        if (suffix) {
          deliver({
            ...ids,
            type: "agent_update",
            update: {
              kind: "tool_call",
              toolCallId: "lookup",
              title: "tool_search",
              name: "tool_search",
              toolKind: null,
              status: "pending",
              content: null,
            },
          })
        }
        if (partial) {
          deliver({
            ...ids,
            type: "agent_update",
            update: {
              kind: "message_chunk",
              messageId: "reply",
              text: partial,
            },
          })
        }
        if (suffix) {
          deliver({
            ...ids,
            type: "agent_update",
            update: {
              kind: "tool_call_update",
              toolCallId: "lookup",
              status: "completed",
              title: null,
              error: null,
              content: null,
            },
          })
          deliver({
            ...ids,
            type: "agent_update",
            update: { kind: "message_chunk", messageId: "reply", text: suffix },
          })
        }
        deliver({
          ...ids,
          type: "agent_turn_end",
          result: { outcome: "completed", stopReason, usage: null },
        })
      })

      await waitFor(() =>
        expect(getByHook("chat-response-copy")).toBeInTheDocument(),
      )
      await userEvent.click(getByHook("chat-window-close"))
      mounted.unmount()
      const saved = (
        await aiConversationStore.getMessages(conversationId)
      ).find((message) => message.role === "assistant")
      if (partial === partialSQL) {
        expect(saved?.content).toMatch(
          /^```sql\nSELECT 42;\n+```agent-notice\n/,
        )
      } else if (suffix) {
        expect(saved?.content).toContain(partial + suffix)
      } else if (partial) {
        expect(saved?.content).toBe(partial)
      }
      renderChat("openai", undefined, settings)
      await openChat()
      await waitFor(() =>
        expect(getByHook("chat-response-copy")).toBeInTheDocument(),
      )

      if (stopReason === "max_tokens") {
        const notice = queryByHook("chat-notice")
        expect(notice).toHaveAttribute("role", "alert")
        expect(notice).toHaveTextContent("The agent reached its output limit")
      } else {
        expect(queryByHook("chat-notice")).toBeNull()
      }
      if (suffix) {
        expect(getByHook("chat-message-assistant")).toHaveTextContent(
          partial + suffix,
        )
      } else if (partial) {
        const code = getByHook("chat-message-code-block").querySelector("pre")
        expect(code?.textContent).toBe(
          partial === partialSQL ? "SELECT 42;" : noticeExample,
        )
      }
      await userEvent.click(getByHook("assistant-mode-processing-collapsed"))
      expect(getByHook("assistant-mode-thinking")).toBeVisible()
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      unregisterLocalAgentChannel(channel)
      bridge.channel = null
      channel.dispose()
    }
  },
)
