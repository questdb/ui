// @vitest-environment jsdom
import { act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import {
  fixtures,
  getByHook,
  openChat,
  renderChat,
  sendMessage,
} from "./support/chatHarness"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import { aiConversationStore } from "../../../src/store/aiConversations"
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

const choice: AgentQuestionField = {
  id: "style",
  kind: "choice",
  title: null,
  prompt: "Which display style?",
  options: [{ value: "compact", label: "Compact", description: null }],
  multiple: false,
  required: true,
  otherFieldId: null,
}

it.each(["question", "link"])(
  "renders the answered %s separately from earlier unfinished Markdown, live and after reopening",
  async (request) => {
    const settings = {
      ...(JSON.parse(
        fixtures.getOpenAIConfiguredSettings()["ai.assistant.settings"],
      ) as AiAssistantSettings),
      selectedModel: "local-agent",
    }
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const sent: AgentInboundMessage[] = []
    let deliver!: (message: AgentOutboundMessage) => void
    const client = {
      on: (_event: "agentMessage", handler: typeof deliver) => {
        deliver = handler
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
      const prefix = "```sql\nSELECT 42;"
      const suffix = "Here is your sample."
      const stream = (text: string) =>
        deliver({
          v,
          conversationId,
          turnId,
          type: "agent_update",
          update: { kind: "message_chunk", messageId: "reply", text },
        })
      const link = request === "link"
      const url = "https://example.invalid/setup"
      const question = link ? "Open the setup page" : choice.prompt
      act(() => {
        stream(prefix)
        deliver({
          v,
          conversationId,
          type: "agent_question",
          requestId: "request-1",
          message: question ?? "",
          ...(link && { url }),
          fields: link ? [] : [choice],
        })
      })

      await userEvent.click(
        getByHook(link ? "chat-link-open" : "chat-question-option"),
      )
      expect(sent.at(-1)).toEqual({
        v,
        type: "agent_question_answer",
        requestId: "request-1",
        answers: link ? {} : { style: "compact" },
      })
      if (link)
        expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer")

      const answer = link ? "Opened example.invalid" : "Compact"
      const expectVisibleTranscript = () => {
        const card = getByHook("chat-question-record")
        expect(card).toBeVisible()
        expect(card).toHaveTextContent(answer)
        expect(
          getByHook("chat-message-code-block").querySelector("pre")
            ?.textContent,
        ).toBe("SELECT 42;")
      }
      await waitFor(expectVisibleTranscript)
      act(() => {
        stream(suffix)
        deliver({
          v,
          conversationId,
          turnId,
          type: "agent_turn_end",
          result: { outcome: "completed", stopReason: "end_turn", usage: null },
        })
      })
      await waitFor(() =>
        expect(getByHook("chat-response-copy")).toBeInTheDocument(),
      )
      await userEvent.click(getByHook("chat-window-close"))
      mounted.unmount()

      const json = JSON.stringify({
        questions: [{ question, answer }],
        skipped: false,
        ...(link && { link: true }),
      })
      await waitFor(async () => {
        const saved = (
          await aiConversationStore.getMessages(conversationId)
        ).find((message) => message.role === "assistant")
        expect(saved?.content).toBe(
          `${prefix}\n\n\`\`\`agent-question\n${json}\n\`\`\`\n\n${suffix}`,
        )
      })

      renderChat("openai", undefined, settings)
      await openChat()
      await waitFor(expectVisibleTranscript)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      unregisterLocalAgentChannel(channel)
      bridge.channel = null
      channel.dispose()
    }
  },
)
