import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
} from "../localAgent/protocol"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../localAgent/localAgentModel"
import { STEERED_ABORT_REASON } from "../../providers/AIStatusProvider"
import {
  createChatFlowConfig,
  executeAIFlow,
  type AIFlowCallbacks,
} from "./executeAIFlow"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const CONVERSATION_ID = "conversation-1"

const connectAgent = () => {
  const sent: AgentInboundMessage[] = []
  let deliver: (msg: AgentOutboundMessage) => void = () => undefined
  const client = {
    canSendAgentMessage: () => true,
    on: (_event: "agentMessage", handler: typeof deliver) => {
      deliver = handler
      return () => undefined
    },
    sendAgentMessage: (msg: AgentInboundMessage) => {
      sent.push(msg)
      return true
    },
  } as unknown as MCPBridgeClient
  const channel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Claude Code", cwd: "/tmp/workspace" },
    onNotebookRead: vi.fn(),
  })
  registerLocalAgentChannel(channel)
  const endTurn = (conversationId: string, stopReason = "cancelled") => {
    const prompt = sent.findLast(
      (msg) =>
        msg.type === "agent_prompt" && msg.conversationId === conversationId,
    )
    deliver({
      v: "0.6.0",
      type: "agent_turn_end",
      conversationId,
      turnId: prompt?.type === "agent_prompt" ? prompt.turnId : "none",
      result: { outcome: "completed", stopReason, usage: null },
    })
  }
  return { channel, endTurn, endStoppedTurn: () => endTurn(CONVERSATION_ID) }
}

const startFlow = (
  abort: AbortController,
  conversationId = CONVERSATION_ID,
) => {
  const callbacks = {
    addMessage: vi.fn(),
    updateMessage: vi.fn<Parameters<AIFlowCallbacks["updateMessage"]>, void>(),
    setStatus: vi.fn(),
    setIsStreaming: vi.fn(),
    persistMessages: vi.fn(() => Promise.resolve()),
  }
  const flow = executeAIFlow(
    createChatFlowConfig({
      conversationId,
      userMessage: "Show the latest trades",
      conversationHistory: [],
      isFirstMessage: false,
      settings: { model: LOCAL_AGENT_MODEL, apiKey: "" },
      localAgentChannel: channel,
      questClient: {} as never,
      hasSchemaAccess: false,
      abortSignal: abort.signal,
    }),
    callbacks,
  )
  return { flow, callbacks }
}

let channel: LocalAgentChannel | null = null

afterEach(() => {
  if (channel) unregisterLocalAgentChannel(channel)
  channel = null
})

describe("an answer replaced by a new message", () => {
  it("shows no error on an answer the user replaced with a new message", async () => {
    // Given
    const agent = connectAgent()
    channel = agent.channel
    const abort = new AbortController()
    const { flow, callbacks } = startFlow(abort)

    // When
    abort.abort(STEERED_ABORT_REASON)
    agent.endStoppedTurn()
    await flow

    // Then
    const updates = callbacks.updateMessage.mock.calls.map(
      (call) => (call as unknown[])[2] as { error?: string },
    )
    expect(updates.some((update) => update.error !== undefined)).toBe(false)
  })

  it("leaves the status and streaming state to a newer answer when a stopped one ends after it started", async () => {
    // Given an answer the user stopped, and a new one sent before it ended
    const agent = connectAgent()
    channel = agent.channel
    const stopped = new AbortController()
    const first = startFlow(stopped)
    stopped.abort()
    const second = startFlow(new AbortController())

    // When the stopped answer ends
    agent.endStoppedTurn()
    await first.flow

    // Then
    expect(first.callbacks.setIsStreaming).not.toHaveBeenCalledWith(false)
    expect(first.callbacks.setStatus).not.toHaveBeenCalledWith(null)
    expect(second.callbacks.setStatus).toHaveBeenCalled()
  })

  it("keeps a delayed limit notice on the stopped turn without reopening streaming", async () => {
    const agent = connectAgent()
    channel = agent.channel
    const abort = new AbortController()
    const first = startFlow(abort)
    abort.abort()
    const second = startFlow(new AbortController(), "conversation-2")
    agent.endTurn("conversation-2", "end_turn")
    await second.flow
    expect(second.callbacks.setIsStreaming).toHaveBeenLastCalledWith(false)

    agent.endTurn(CONVERSATION_ID, "max_tokens")
    await first.flow
    expect(first.callbacks.setIsStreaming).not.toHaveBeenCalled()
    const history = first.callbacks.updateMessage.mock.calls
      .filter(([id]) => id === CONVERSATION_ID)
      .findLast(([, , patch]) => patch.operationHistory)?.[2].operationHistory
    expect(history?.at(-1)?.content).toContain(
      "The agent reached its output limit",
    )
  })

  it("ends the streaming state, with the cancellation, when the user only stops", async () => {
    // Given
    const agent = connectAgent()
    channel = agent.channel
    const abort = new AbortController()
    const { flow, callbacks } = startFlow(abort)

    // When
    abort.abort()
    agent.endStoppedTurn()
    await flow

    // Then
    expect(callbacks.setIsStreaming).toHaveBeenCalledWith(false)
    expect(callbacks.updateMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.anything(),
      expect.objectContaining({ error: "Operation has been cancelled" }),
    )
  })
})
