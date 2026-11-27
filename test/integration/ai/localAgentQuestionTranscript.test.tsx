// @vitest-environment jsdom
import React from "react"
import { act, screen, waitFor } from "@testing-library/react"
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
import { aiConversationStore } from "../../../src/store/aiConversations"
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
    deliver,
    dispose: () => {
      unregisterLocalAgentChannel(channel)
      bridge.channel = null
      channel.dispose()
    },
  }
}

it.each([
  ["question", "same message"],
  ["link", "same message"],
  ["question", "new message"],
  ["link", "new message"],
])(
  "renders the answered %s separately from the %s Markdown, live and after reopening",
  async (request, resume) => {
    const settings = localAgentSettings
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const { sent, deliver, dispose } = mockAgent()
    try {
      const mounted = renderChat("openai", undefined, settings)
      await openChat()
      await sendMessage("Show a sample query")
      const prompt = sent.find((message) => message.type === "agent_prompt")
      if (!prompt) throw new Error("Expected a local agent prompt")
      const { v, conversationId, turnId } = prompt
      const sameMessage = resume === "same message"
      const prefix = sameMessage ? "```sql\nSELECT 42" : "```sql\nSELECT 42;"
      const suffix = sameMessage ? "\n  + 1;\n```" : "Here is your sample."
      const stream = (text: string, messageId = "reply") =>
        deliver({
          v,
          conversationId,
          turnId,
          type: "agent_update",
          update: { kind: "message_chunk", messageId, text },
        })
      const link = request === "link"
      const url = "https://example.invalid/setup?state=sample"
      const question = link
        ? "Open the setup page at example.invalid"
        : choice.prompt
      act(() => {
        stream(prefix)
        deliver({
          v,
          conversationId,
          type: "agent_question",
          requestId: "request-1",
          message: link ? `Open the setup page at ${url}` : (question ?? ""),
          ...(link && { url }),
          fields: link ? [] : [choice],
        })
      })

      await userEvent.click(
        getByHook(link ? "chat-link-open" : "chat-question-option"),
      )
      if (link) {
        expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer")
        expect(sent.at(-1)?.type).not.toBe("agent_question_answer")
        expect(queryByHook("chat-question-record")).not.toBeInTheDocument()
        expect(getByHook("chat-link-copy")).toBeEnabled()
        await userEvent.click(getByHook("chat-link-confirm"))
      }
      expect(sent.at(-1)).toEqual({
        v,
        type: "agent_question_answer",
        requestId: "request-1",
        answers: link ? {} : { style: "compact" },
      })

      const answer = link ? "Opened example.invalid" : "Compact"
      const expectVisibleTranscript = (resumed: boolean) => {
        const card = getByHook("chat-question-record")
        expect(card).toBeVisible()
        expect(card).toHaveTextContent(answer)
        expect(
          getByHook("chat-message-code-block").querySelector("pre")
            ?.textContent,
        ).toBe(
          sameMessage
            ? resumed
              ? "SELECT 42\n  + 1;"
              : "SELECT 42"
            : "SELECT 42;",
        )
        if (resumed && !sameMessage)
          expect(screen.getByText(suffix)).toBeVisible()
      }
      await waitFor(() => expectVisibleTranscript(false))
      act(() => {
        stream(suffix, sameMessage ? "reply" : "follow-up")
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
      expectVisibleTranscript(true)
      await userEvent.click(getByHook("chat-window-close"))
      mounted.unmount()

      const record = {
        questions: [{ question, answer }],
        skipped: false,
        ...(link && { link: true }),
      }
      const recordText = link
        ? `${question}\n${answer}`
        : `Question: ${question}\nAnswer: ${answer}`
      await waitFor(async () => {
        const saved = (
          await aiConversationStore.getMessages(conversationId)
        ).find((message) => message.role === "assistant")
        expect(saved?.operationHistory).toContainEqual(
          expect.objectContaining({
            transcriptBlock: { kind: "question", record },
          }),
        )
        expect(saved?.content).toBe(
          sameMessage
            ? `${prefix}${suffix}\n\n${recordText}`
            : `${prefix}\n\n${recordText}\n\n${suffix}`,
        )
      })

      renderChat("openai", undefined, settings)
      await openChat()
      await waitFor(() => expectVisibleTranscript(true))
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  },
)

it("restores only the active question draft after the drawer temporarily closes", async () => {
  const { sent, deliver, dispose } = mockAgent()
  try {
    renderChat("openai", undefined, localAgentSettings)
    await openChat()
    await sendMessage("Choose a display style")
    const prompt = sent.find((message) => message.type === "agent_prompt")
    if (!prompt) throw new Error("Expected a local agent prompt")
    const { v, conversationId, turnId } = prompt
    const fields: AgentQuestionField[] = [
      choice,
      {
        id: "label",
        kind: "text",
        title: "Label",
        prompt: "What label?",
        required: true,
      },
    ]
    const ask = (requestId: string) =>
      act(() =>
        deliver({
          v,
          conversationId,
          type: "agent_question",
          requestId,
          message: "Display preferences",
          fields,
        }),
      )
    ask("request-1")
    await userEvent.click(getByHook("chat-question-option"))
    await userEvent.type(getByHook("chat-question-text-answer"), "Sample label")
    const original = getByHook("chat-question-card")
    await userEvent.click(getByHook("chat-window-close"))
    expect(original).not.toBeInTheDocument()
    await openChat()
    expect(getByHook("chat-question-text-answer")).toHaveValue("Sample label")
    await userEvent.click(getByHook("chat-question-review-tab"))
    expect(
      screen.getByRole("button", { name: /Which display style\? Compact/ }),
    ).toBeVisible()
    expect(
      sent.some((message) => message.type === "agent_question_answer"),
    ).toBe(false)

    act(() =>
      deliver({ v, type: "agent_question_closed", requestId: "request-1" }),
    )
    ask("request-2")
    await userEvent.click(getByHook("chat-question-review-tab"))
    expect(screen.getAllByText("Not answered")).toHaveLength(2)
    expect(getByHook("chat-question-send")).toBeDisabled()
    act(() =>
      deliver({
        v,
        conversationId,
        turnId,
        type: "agent_turn_end",
        result: { outcome: "completed", stopReason: "end_turn", usage: null },
      }),
    )
  } finally {
    dispose()
  }
})

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
          message: link ? `Open the setup page at ${url}` : "Please answer.",
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
