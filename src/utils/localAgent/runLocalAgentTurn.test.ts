import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentTurnResult,
  AgentUpdate,
} from "./protocol"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import type { StatusCallback } from "../ai/aiAssistant"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "./localAgentChannel"
import { runLocalAgentTurn } from "./runLocalAgentTurn"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const CONVERSATION_ID = "conversation-1"

const createFakeBridge = () => {
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
  const turnId = () => {
    const prompt = sent.findLast((msg) => msg.type === "agent_prompt")
    return prompt?.type === "agent_prompt" ? prompt.turnId : "none"
  }
  return {
    client,
    sent,
    update: (update: AgentUpdate) =>
      deliver({
        v: "0.6.0",
        type: "agent_update",
        conversationId: CONVERSATION_ID,
        turnId: turnId(),
        update,
      }),
    endTurn: (result: AgentTurnResult, forTurn = turnId()) =>
      deliver({
        v: "0.6.0",
        type: "agent_turn_end",
        conversationId: CONVERSATION_ID,
        turnId: forTurn,
        result,
      }),
  }
}

const connectChannel = (client: MCPBridgeClient) => {
  const onNotebookRead = vi.fn()
  const channel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Claude Code", cwd: "/tmp/workspace" },
    onNotebookRead,
  })
  registerLocalAgentChannel(channel)
  return { channel, onNotebookRead }
}

const toolCall = (
  toolCallId: string,
  title: string,
): Extract<AgentUpdate, { kind: "tool_call" }> => ({
  kind: "tool_call",
  toolCallId,
  title,
  name: null,
  toolKind: "execute",
  status: "pending",
  content: null,
})

const startTurn = (abortSignal?: AbortSignal) => {
  const setStatus = vi.fn<Parameters<StatusCallback>, void>()
  const streaming = { onTextChunk: vi.fn(), onThinkingChunk: vi.fn() }
  const turn = runLocalAgentTurn({
    channel: activeChannel,
    conversationId: CONVERSATION_ID,
    userMessage: "Chart the trades table",
    notebookRead: { bufferId: 7, readSeq: 3 },
    setStatus,
    streaming,
    abortSignal,
  })
  return { turn, setStatus, streaming }
}

let activeChannel: LocalAgentChannel | null = null

afterEach(() => {
  if (activeChannel) unregisterLocalAgentChannel(activeChannel)
  activeChannel = null
})

describe("runLocalAgentTurn", () => {
  it("streams the agent reply and returns it as the explanation, without the tokens it counted", async () => {
    // Given
    const bridge = createFakeBridge()
    const { channel, onNotebookRead } = connectChannel(bridge.client)
    activeChannel = channel

    // When
    const { turn, streaming } = startTurn()
    bridge.update({ kind: "message_chunk", messageId: "m1", text: "Built " })
    bridge.update({ kind: "message_chunk", messageId: "m1", text: "it." })
    bridge.update({ kind: "message_chunk", messageId: "m2", text: "Done." })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5 },
    })

    // Then
    await expect(turn).resolves.toEqual({
      sql: null,
      explanation: "Built it.\n\nDone.",
    })
    expect(streaming.onTextChunk).toHaveBeenLastCalledWith("\n\nDone.")
    expect(onNotebookRead).toHaveBeenCalledWith(CONVERSATION_ID, {
      bufferId: 7,
      readSeq: 3,
    })
    expect(bridge.sent[0]).toMatchObject({
      type: "agent_prompt",
      conversationId: CONVERSATION_ID,
      prompt: [{ type: "text", text: "Chart the trades table" }],
    })
  })

  it("shows a QuestDB tool's status while the agent prepares it, then the console's own, and agent housekeeping as transient", async () => {
    // Given
    const bridge = createFakeBridge()
    const { channel } = connectChannel(bridge.client)
    activeChannel = channel

    // When
    const { turn, setStatus } = startTurn()
    bridge.update(toolCall("t1", "mcp.questdb_console.run_query"))
    bridge.update(toolCall("guardian_assessment:1", "Guardian Review"))
    const reportQuery = channel.captureToolStatus(
      bridge.client,
      CONVERSATION_ID,
    )
    reportQuery?.(AIOperationStatus.RunningQuery, { content: "SELECT 1" })
    bridge.update(toolCall("t2", "tool_search 'questdb_console'"))
    bridge.update(toolCall("t3", "pwd"))
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then
    const callId = setStatus.mock.calls[2]?.[1]?.callId
    expect(callId).toBeTypeOf("string")
    expect(setStatus.mock.calls).toEqual([
      [AIOperationStatus.RunningQuery, { transient: true }],
      [AIOperationStatus.ReviewingToolCall, { transient: true }],
      [AIOperationStatus.RunningQuery, { content: "SELECT 1", callId }],
      [AIOperationStatus.LoadingTools, { transient: true }],
      [
        AIOperationStatus.UsingAgentTools,
        { name: "pwd", toolKind: "execute", callId: "t3" },
      ],
      [null],
    ])
  })

  it("marks the agent's own tool call failed with what it reported", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, setStatus } = startTurn()
    bridge.update(toolCall("t1", "yarn test"))

    // When
    bridge.update({
      kind: "tool_call_update",
      toolCallId: "t1",
      title: null,
      status: "failed",
      error: "yarn: command not found",
      content: null,
    })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then
    expect(setStatus).toHaveBeenCalledWith(AIOperationStatus.UsingAgentTools, {
      name: "yarn test",
      toolKind: "execute",
      callId: "t1",
      failed: "yarn: command not found",
    })
  })

  it("ends the agent's own tool step once the tool is done", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, setStatus } = startTurn()
    bridge.update(toolCall("t1", "ls"))

    // When
    bridge.update({
      kind: "tool_call_update",
      toolCallId: "t1",
      title: null,
      status: "completed",
      error: null,
      content: null,
    })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then
    expect(setStatus).toHaveBeenCalledWith(AIOperationStatus.UsingAgentTools, {
      name: "ls",
      toolKind: "execute",
      callId: "t1",
      ended: true,
    })
  })

  it("names the agent's tool call after its title as the input streams in", async () => {
    // Given a shell call announced before its command arrived
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, setStatus } = startTurn()
    bridge.update(toolCall("t1", "bash"))

    // When its title grows into the command
    for (const title of [
      "cd /Users",
      "cd /Users/emreberk",
      "cd /Users/emreberk",
    ]) {
      bridge.update({
        kind: "tool_call_update",
        toolCallId: "t1",
        title,
        status: "pending",
        error: null,
        content: null,
      })
    }
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then each new title updates the step, from the one before it
    const step = (name: string) => ({
      name,
      toolKind: "execute",
      callId: "t1",
    })
    expect(setStatus.mock.calls).toEqual([
      [AIOperationStatus.UsingAgentTools, step("bash")],
      [
        AIOperationStatus.UsingAgentTools,
        { ...step("cd /Users"), replaces: step("bash") },
      ],
      [
        AIOperationStatus.UsingAgentTools,
        { ...step("cd /Users/emreberk"), replaces: step("cd /Users") },
      ],
      [null],
    ])
  })

  it("shows what the agent's own tool printed and changed, as it comes in", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, setStatus } = startTurn()
    bridge.update(toolCall("t1", "Edit notes.txt"))

    // When the output streams in, then the diff
    bridge.update({
      kind: "tool_call_update",
      toolCallId: "t1",
      title: null,
      status: "in_progress",
      error: null,
      content: [{ type: "text", text: "Replaced 1 block." }],
    })
    bridge.update({
      kind: "tool_call_update",
      toolCallId: "t1",
      title: null,
      status: "completed",
      error: null,
      content: [
        { type: "diff", path: "/tmp/notes.txt", oldText: "a", newText: "b" },
      ],
    })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then each update replaces what the step showed, and the step ends
    const step = { name: "Edit notes.txt", toolKind: "execute", callId: "t1" }
    const withOutput = { ...step, output: "Replaced 1 block." }
    const withDiff = {
      ...step,
      diffs: [{ path: "/tmp/notes.txt", oldText: "a", newText: "b" }],
    }
    expect(setStatus.mock.calls).toEqual([
      [AIOperationStatus.UsingAgentTools, step],
      [AIOperationStatus.UsingAgentTools, { ...withOutput, replaces: step }],
      [
        AIOperationStatus.UsingAgentTools,
        { ...withDiff, replaces: withOutput },
      ],
      [AIOperationStatus.UsingAgentTools, { ...withDiff, ended: true }],
      [AIOperationStatus.GeneratingResponse, { transient: true }],
      [null],
    ])
  })

  it("reports how full the agent's context gets, and returns the latest", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, streaming } = startTurn()
    const onContextUsage = vi.fn()
    Object.assign(streaming, { onContextUsage })

    // When
    bridge.update({ kind: "usage", used: 1_000, size: 10_000 })
    bridge.update({ kind: "usage", used: 9_000, size: 10_000 })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    const result = await turn

    // Then
    expect(onContextUsage).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      contextUsage: { used: 9_000, size: 10_000 },
    })
  })

  it("shows the agent's plan as one step, updated as the agent works", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, setStatus } = startTurn()
    const plan = (first: string, second: string) => ({
      kind: "plan" as const,
      entries: [
        { content: "Read the schema", status: first },
        { content: "Write the query", status: second },
      ],
    })

    // When
    bridge.update(plan("in_progress", "pending"))
    bridge.update(plan("completed", "in_progress"))
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then
    const step = (first: string, second: string) => ({
      plan: plan(first, second).entries,
      callId: "plan",
    })
    expect(setStatus.mock.calls.slice(0, 3)).toEqual([
      [AIOperationStatus.Planning, step("in_progress", "pending")],
      [
        AIOperationStatus.Planning,
        { ...step("in_progress", "pending"), ended: true },
      ],
      [
        AIOperationStatus.Planning,
        {
          ...step("completed", "in_progress"),
          replaces: step("in_progress", "pending"),
        },
      ],
    ])
  })

  it("keeps a notice in the reply where the agent sent it", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn, streaming } = startTurn()

    // When
    bridge.update({ kind: "message_chunk", messageId: "m1", text: "Before." })
    bridge.update({
      kind: "notice",
      severity: "warning",
      title: "Rate limit close",
      description: null,
    })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    const result = await turn

    // Then
    const reply = (result as { explanation: string }).explanation
    expect(reply).toMatch(/^Before\.\n\n[\s\S]*```agent-notice\n/)
    expect(reply).toContain('"title":"Rate limit close"')
    expect(streaming.onTextChunk).toHaveBeenCalledTimes(2)
  })

  it("says why a turn stopped short, after what the agent wrote", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const { turn } = startTurn()

    // When
    bridge.update({
      kind: "message_chunk",
      messageId: "m1",
      text: "The answer is",
    })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "max_tokens",
      usage: null,
    })
    const result = await turn

    // Then
    const reply = (result as { explanation: string }).explanation
    expect(reply.startsWith("The answer is")).toBe(true)
    expect(reply).toContain("The agent reached its output limit")
  })

  it("drops the leading blank lines of each thinking block", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel

    // When
    const { turn, streaming } = startTurn()
    bridge.update({ kind: "thought_chunk", text: "\n\n" })
    bridge.update({ kind: "thought_chunk", text: "\n**Plan**" })
    bridge.update({ kind: "thought_chunk", text: "\n\nRead the schema." })
    bridge.update({ kind: "message_chunk", messageId: "m1", text: "Ok." })
    bridge.update({ kind: "thought_chunk", text: "\n\nNext step." })
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })
    await turn

    // Then
    expect(streaming.onThinkingChunk.mock.calls).toEqual([
      ["**Plan**"],
      ["\n\nRead the schema."],
      ["Next step."],
    ])
  })

  it("sends a cancel to the bridge and resolves as aborted when the user stops the turn", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const abort = new AbortController()

    // When
    const { turn } = startTurn(abort.signal)
    abort.abort()
    bridge.endTurn({
      outcome: "completed",
      stopReason: "cancelled",
      usage: null,
    })

    // Then
    await expect(turn).resolves.toMatchObject({ type: "aborted" })
    expect(bridge.sent[1]).toMatchObject({
      type: "agent_cancel",
      conversationId: CONVERSATION_ID,
    })
  })

  it("sends a message written right after Stop once the agent has ended the stopped turn", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const abort = new AbortController()
    const stopped = startTurn(abort.signal)
    abort.abort()

    // When
    const next = startTurn()
    await Promise.resolve()

    // Then
    expect(bridge.sent.map((msg) => msg.type)).toEqual([
      "agent_prompt",
      "agent_cancel",
    ])

    // When
    bridge.endTurn({
      outcome: "completed",
      stopReason: "cancelled",
      usage: null,
    })
    await expect(stopped.turn).resolves.toMatchObject({ type: "aborted" })
    await vi.waitFor(() => expect(bridge.sent).toHaveLength(3))
    bridge.endTurn({
      outcome: "completed",
      stopReason: "end_turn",
      usage: null,
    })

    // Then
    expect(bridge.sent[2]).toMatchObject({ type: "agent_prompt" })
    await expect(next.turn).resolves.not.toMatchObject({ type: "aborted" })
  })

  it("fails the running turn when the bridge connection goes away", async () => {
    // Given
    const bridge = createFakeBridge()
    const { channel } = connectChannel(bridge.client)
    activeChannel = channel

    // When
    const { turn } = startTurn()
    channel.dispose()

    // Then
    await expect(turn).resolves.toMatchObject({
      type: "unknown",
      message: "The connection to the local agent bridge was lost.",
    })
  })

  it("clears the status when a turn fails before anything streamed", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel

    // When
    const { turn, setStatus } = startTurn()
    bridge.endTurn({ outcome: "failed", error: "Sign in to Claude Code" })

    // Then
    await expect(turn).resolves.toMatchObject({
      type: "unknown",
      message: "Sign in to Claude Code",
    })
    expect(setStatus).toHaveBeenLastCalledWith(null)
  })

  it("ignores the agent's work after the user stops and the end of an older turn", async () => {
    // Given
    const bridge = createFakeBridge()
    activeChannel = connectChannel(bridge.client).channel
    const abort = new AbortController()
    const { turn, setStatus, streaming } = startTurn(abort.signal)

    // When
    abort.abort()
    bridge.update(toolCall("t1", "pwd"))
    bridge.update({ kind: "message_chunk", messageId: "m1", text: "late" })
    bridge.endTurn(
      { outcome: "completed", stopReason: "end_turn", usage: null },
      "an-older-turn",
    )
    bridge.endTurn({
      outcome: "completed",
      stopReason: "cancelled",
      usage: null,
    })

    // Then
    await expect(turn).resolves.toMatchObject({ type: "aborted" })
    expect(setStatus).not.toHaveBeenCalled()
    expect(streaming.onTextChunk).not.toHaveBeenCalled()
  })

  it("asks the user to start the bridge when no local agent is connected", async () => {
    // When
    const { turn } = startTurn()

    // Then
    await expect(turn).resolves.toMatchObject({ type: "network" })
  })
})
