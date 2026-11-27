// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { decompressSync, strFromU8 } from "fflate"
import { expect, it, vi } from "vitest"
import {
  fixtures,
  getByHook,
  openChat,
  renderChat,
  sendMessage,
} from "./support/chatHarness"
import type { AiAssistantSettings } from "../../../src/providers/LocalStorageProvider/types"
import type { ConversationMessage } from "../../../src/providers/AIConversationProvider/types"
import { AIOperationStatus } from "../../../src/providers/AIStatusProvider"
import { db } from "../../../src/store/db"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../../../src/utils/localAgent/localAgentChannel"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentUpdate,
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

const lines = (name: string) =>
  Array.from({ length: 40 }, (_, line) => `${name} line ${line}`).join("\n")
const OUTPUT = lines("app.log")
const OLD_TEXT = lines("old app.ts")
const NEW_TEXT = lines("new app.ts")
const IMAGE = `iVBORw0KGgo${"QUJD".repeat(256)}`
const REPLY_TEXT = "Here is the chart of the trades:"
const REPLY = `${REPLY_TEXT}\n\n![chart](data:image/png;base64,${IMAGE})`

// The chat's compressed transcript, as IndexedDB holds it.
const savedTranscript = async (conversationId: string) => {
  const row = await db.ai_conversation_messages.get(conversationId)
  return row ? strFromU8(decompressSync(row.data)) : ""
}
const occurrences = (text: string, part: string) =>
  text.split(JSON.stringify(part).slice(1, -1)).length - 1

it("keeps an agent turn's image, tool output and diff out of the saved transcript, with its reply once, and reopens the chat with them", async () => {
  const { sent, deliver, dispose } = mockAgent()
  try {
    // Given
    const mounted = renderChat("openai", undefined, localAgentSettings)
    await openChat()
    await sendMessage("Chart the trades")
    const prompt = sent.find((message) => message.type === "agent_prompt")
    if (!prompt) throw new Error("Expected a local agent prompt")
    const { v, conversationId, turnId } = prompt
    const update = (agentUpdate: AgentUpdate) =>
      deliver({
        v,
        conversationId,
        turnId,
        type: "agent_update",
        update: agentUpdate,
      })

    // When
    await act(async () => {
      await Promise.resolve()
      update({
        kind: "tool_call",
        toolCallId: "run",
        title: "cat app.log",
        name: "Bash",
        toolKind: "execute",
        status: "in_progress",
        content: [{ type: "text", text: OUTPUT }],
      })
      update({
        kind: "tool_call_update",
        toolCallId: "run",
        title: null,
        status: "completed",
        error: null,
        content: null,
      })
      update({
        kind: "tool_call",
        toolCallId: "edit",
        title: "Edit src/app.ts",
        name: "Edit",
        toolKind: "edit",
        status: "in_progress",
        content: [
          {
            type: "diff",
            path: "src/app.ts",
            oldText: OLD_TEXT,
            newText: NEW_TEXT,
          },
        ],
      })
      update({
        kind: "tool_call_update",
        toolCallId: "edit",
        title: null,
        status: "completed",
        error: null,
        content: null,
      })
      update({ kind: "message_chunk", messageId: "reply", text: REPLY })
    })
    act(() => {
      deliver({
        v,
        conversationId,
        turnId,
        type: "agent_turn_end",
        result: { outcome: "completed", stopReason: "end_turn", usage: null },
      })
    })

    // Then
    await waitFor(async () =>
      expect(await savedTranscript(conversationId)).toContain(REPLY_TEXT),
    )
    const transcript = await savedTranscript(conversationId)
    for (const payload of [OUTPUT, OLD_TEXT, NEW_TEXT, IMAGE])
      expect(occurrences(transcript, payload)).toBe(0)
    expect(occurrences(transcript, REPLY_TEXT)).toBe(1)
    const answer = (JSON.parse(transcript) as ConversationMessage[]).find(
      (message) => message.role === "assistant",
    )
    const responseSteps = answer?.operationHistory?.filter(
      (step) => step.type === AIOperationStatus.GeneratingResponse,
    )
    expect(responseSteps).toEqual([
      expect.objectContaining({
        contentSlices: [{ messageId: answer?.id, start: 0, end: REPLY.length }],
      }),
    ])
    expect(responseSteps?.[0]).not.toHaveProperty("content")

    // When
    mounted.unmount()
    renderChat("openai", undefined, localAgentSettings)
    await openChat()

    // Then
    const image = await screen.findByRole("img", { name: "chart" })
    expect(image).toHaveAttribute("src", `data:image/png;base64,${IMAGE}`)
    expect(getByHook("chat-response-content")).toHaveTextContent(REPLY_TEXT)
    await userEvent.click(
      screen.getByRole("button", { name: "Show what cat app.log did" }),
    )
    expect(getByHook("agent-tool-output").textContent).toBe(OUTPUT)
    await userEvent.click(
      screen.getByRole("button", { name: "Show what Edit src/app.ts did" }),
    )
    const diff = getByHook("agent-tool-diff")
    expect(diff).toHaveTextContent("app.ts")
    expect(
      Array.from(diff.querySelectorAll("pre"), (pre) => pre.textContent),
    ).toEqual([OLD_TEXT, NEW_TEXT])
  } finally {
    dispose()
  }
})
