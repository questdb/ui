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
import { createChatFlowConfig, executeAIFlow } from "./executeAIFlow"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const CONVERSATION_ID = "conversation-1"

const connectAgent = () => {
  const sent: AgentInboundMessage[] = []
  let deliver: (msg: AgentOutboundMessage) => void = () => undefined
  const client = {
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
  const endStoppedTurn = () => {
    const prompt = sent.findLast((msg) => msg.type === "agent_prompt")
    deliver({
      v: "0.6.0",
      type: "agent_turn_end",
      conversationId: CONVERSATION_ID,
      turnId: prompt?.type === "agent_prompt" ? prompt.turnId : "none",
      result: { outcome: "completed", stopReason: "cancelled", usage: null },
    })
  }
  return { channel, endStoppedTurn }
}

const startFlow = (abort: AbortController) => {
  const callbacks = {
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    setStatus: vi.fn(),
    setIsStreaming: vi.fn(),
    persistMessages: vi.fn(() => Promise.resolve()),
  }
  const flow = executeAIFlow(
    createChatFlowConfig({
      conversationId: CONVERSATION_ID,
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
