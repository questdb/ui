import { describe, expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentQuestionMessage,
} from "./protocol"
import {
  LocalAgentChannel,
  isCurrentLocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "./localAgentChannel"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const connect = () => {
  const sent: AgentInboundMessage[] = []
  let connected = true
  let deliver: (msg: AgentOutboundMessage) => void = () => undefined
  const client = {
    on: (_event: "agentMessage", handler: typeof deliver) => {
      deliver = handler
      return () => undefined
    },
    sendAgentMessage: (msg: AgentInboundMessage) => {
      if (!connected) return false
      sent.push(msg)
      return true
    },
  } as unknown as MCPBridgeClient
  const channel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Claude Code", cwd: "/tmp/workspace" },
    onNotebookRead: vi.fn(),
  })
  return {
    channel,
    sent,
    deliver: (msg: AgentOutboundMessage) => deliver(msg),
    setConnected: (value: boolean) => {
      connected = value
    },
  }
}

it("identifies the registered channel by instance, not by agent name", () => {
  const { channel } = connect()
  const { channel: other } = connect()
  expect(other.info.id).toBe(channel.info.id)
  registerLocalAgentChannel(channel)
  try {
    expect(isCurrentLocalAgentChannel(channel)).toBe(true)
    expect(isCurrentLocalAgentChannel(other)).toBe(false)
    expect(isCurrentLocalAgentChannel(null)).toBe(false)
  } finally {
    unregisterLocalAgentChannel(channel)
  }
  expect(isCurrentLocalAgentChannel(channel)).toBe(false)
})

const question = (requestId: string): AgentQuestionMessage => ({
  v: "0.6.0",
  type: "agent_question",
  requestId,
  conversationId: "c1",
  message: "Which database?",
  fields: [],
})

const startTurn = (
  channel: LocalAgentChannel,
  signal?: AbortSignal,
  conversationId = "c1",
) => {
  const onUpdate = vi.fn()
  const turn = channel.prompt({
    conversationId,
    text: "Show trades",
    notebookRead: null,
    signal,
    onUpdate,
    onToolStatus: vi.fn(),
  })
  return { turn, onUpdate }
}

const turnEnd = (turnId: string): AgentOutboundMessage => ({
  v: "0.6.0",
  type: "agent_turn_end",
  conversationId: "c1",
  turnId,
  result: { outcome: "completed", stopReason: "end_turn", usage: null },
})

it.each([1000, 6000])(
  "replays Stop on reconnect at %i ms and clears it on matching end",
  async (reconnectAt) => {
    vi.useFakeTimers()
    const { channel, sent, deliver, setConnected } = connect()
    try {
      const controller = new AbortController()
      const { turn } = startTurn(channel, controller.signal)
      const settled = vi.fn()
      void turn.then(settled)
      const [prompt] = sent
      if (prompt?.type !== "agent_prompt") throw new Error("Expected a prompt")
      controller.abort()
      setConnected(false)
      await vi.advanceTimersByTimeAsync(reconnectAt)
      expect(settled).toHaveBeenCalledTimes(reconnectAt < 5000 ? 0 : 1)
      deliver(turnEnd("older-turn"))
      setConnected(true)
      channel.resume()
      expect(sent.map((message) => message.type)).toEqual([
        "agent_prompt",
        "agent_cancel",
        "agent_cancel",
      ])
      await vi.advanceTimersByTimeAsync(Math.max(0, 5000 - reconnectAt))
      await expect(turn).resolves.toMatchObject({ stopReason: "cancelled" })
      deliver(turnEnd(prompt.turnId))
      channel.resume()
      expect(sent).toHaveLength(3)
    } finally {
      channel.dispose()
      vi.useRealTimers()
    }
  },
)

it.each([false, true])(
  "retires Stop when the next prompt is sent (reconnect first: %s)",
  async (reconnectFirst) => {
    vi.useFakeTimers()
    const { channel, sent, deliver, setConnected } = connect()
    try {
      const controller = new AbortController()
      const stopped = startTurn(channel, controller.signal)
      const [first] = sent
      if (first?.type !== "agent_prompt") throw new Error("Expected a prompt")
      const pending = question("stopped-question")
      deliver(pending)
      expect(channel.getSnapshot().questions).toEqual([pending])
      controller.abort()
      await vi.advanceTimersByTimeAsync(5000)
      await expect(stopped.turn).resolves.toMatchObject({
        stopReason: "cancelled",
      })
      expect(channel.getSnapshot().questions).toEqual([])
      if (reconnectFirst) {
        setConnected(false)
        await expect(startTurn(channel).turn).resolves.toMatchObject({
          outcome: "failed",
        })
        setConnected(true)
        channel.resume()
      }

      const next = startTurn(channel)
      const second = sent.at(-1)
      if (second?.type !== "agent_prompt")
        throw new Error("Expected a follow-up prompt")
      channel.resume()
      expect(sent.map((message) => message.type)).toEqual([
        "agent_prompt",
        "agent_cancel",
        ...(reconnectFirst ? ["agent_cancel"] : []),
        "agent_prompt",
      ])

      const nextQuestion = question("next-question")
      deliver(nextQuestion)
      deliver(turnEnd(first.turnId))
      deliver({
        v: first.v,
        type: "agent_question_closed",
        requestId: pending.requestId,
      })
      expect(channel.getSnapshot().questions).toEqual([nextQuestion])
      expect(
        channel.answerQuestion("next-question", { database: "questdb" }),
      ).toBe(true)
      expect(next.onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: "question:next-question" }),
      )
      deliver(turnEnd(second.turnId))
      await expect(next.turn).resolves.toMatchObject({ stopReason: "end_turn" })
    } finally {
      channel.dispose()
      vi.useRealTimers()
    }
  },
)

it("does not replay a Stop after the channel is disposed", async () => {
  vi.useFakeTimers()
  const { channel, sent } = connect()
  try {
    const controller = new AbortController()
    const { turn } = startTurn(channel, controller.signal)
    controller.abort()
    await vi.advanceTimersByTimeAsync(5000)
    await expect(turn).resolves.toMatchObject({ stopReason: "cancelled" })

    channel.dispose()
    channel.resume()
    expect(sent.map((message) => message.type)).toEqual([
      "agent_prompt",
      "agent_cancel",
    ])
  } finally {
    vi.useRealTimers()
  }
})

it("does not send a deferred follow-up through a disposed channel", async () => {
  const { channel, sent } = connect()
  const controller = new AbortController()
  const stopped = startTurn(channel, controller.signal)
  controller.abort()
  const next = startTurn(channel)

  channel.dispose()

  await expect(stopped.turn).resolves.toMatchObject({ outcome: "failed" })
  expect(sent.map((message) => message.type)).toEqual([
    "agent_prompt",
    "agent_cancel",
  ])
  await expect(next.turn).resolves.toMatchObject({ outcome: "failed" })
})

describe("LocalAgentChannel questions", () => {
  it("keeps the agent's questions until they are answered or the agent stops waiting", () => {
    // Given
    const { channel, sent, deliver } = connect()
    startTurn(channel)
    deliver(question("q1"))
    deliver(question("q2"))

    // When
    channel.answerQuestion("q1", { database: "questdb" })
    deliver({ v: "0.6.0", type: "agent_question_closed", requestId: "q2" })

    // Then
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({
      type: "agent_question_answer",
      requestId: "q1",
      answers: { database: "questdb" },
    })
    expect(channel.getSnapshot().questions).toEqual([])
  })

  it("keeps an undelivered answer pending so the user can retry after reconnecting", () => {
    // Given
    const { channel, deliver, sent, setConnected } = connect()
    startTurn(channel)
    const pending = question("q1")
    deliver(pending)
    setConnected(false)

    // When
    const firstAttempt = channel.answerQuestion("q1", { database: "questdb" })

    // Then
    expect(channel.getSnapshot().questions).toEqual([pending])
    expect(firstAttempt).toBe(false)
    expect(sent).toHaveLength(1)

    setConnected(true)
    expect(channel.answerQuestion("q1", { database: "questdb" })).toBe(true)
    expect(sent).toHaveLength(2)
    expect(channel.getSnapshot().questions).toHaveLength(0)
  })

  it("clears only the ending turn's questions and ignores questions without a live turn", async () => {
    const { channel, deliver, sent } = connect()
    const { turn } = startTurn(channel)
    startTurn(channel, undefined, "c2")
    const [prompt] = sent
    if (prompt?.type !== "agent_prompt") throw new Error("Expected a prompt")
    const first = question("q1")
    const other = { ...question("q2"), conversationId: "c2" }
    deliver(first)
    deliver(other)
    expect(channel.getSnapshot().questions).toEqual([first, other])

    deliver(turnEnd(prompt.turnId))
    await expect(turn).resolves.toMatchObject({ stopReason: "end_turn" })
    expect(channel.getSnapshot().questions).toEqual([other])
    deliver(question("late-question"))
    expect(channel.getSnapshot().questions).toEqual([other])
    expect(channel.answerQuestion("late-question", null)).toBe(false)
    channel.dispose()
    expect(channel.getSnapshot().questions).toEqual([])
  })

  it("adds the question and the answer to the reply of the turn that asked", () => {
    // Given a running turn that asked a question
    const { channel, deliver } = connect()
    const onUpdate = vi.fn()
    void channel.prompt({
      conversationId: "c1",
      text: "Set up the database",
      notebookRead: null,
      onUpdate,
      onToolStatus: vi.fn(),
    })
    deliver({
      ...question("q1"),
      fields: [
        {
          id: "database",
          kind: "choice",
          title: null,
          prompt: null,
          options: [{ value: "questdb", label: "QuestDB", description: null }],
          multiple: false,
          required: true,
          otherFieldId: null,
        },
      ],
    })

    // When
    channel.answerQuestion("q1", { database: "questdb" })

    // Then
    const [update] = onUpdate.mock.calls[0] as [
      { kind: string; messageId: string; text: string },
    ]
    expect(update).toMatchObject({
      kind: "question_record",
      messageId: "question:q1",
    })
    expect(update.text).toContain('"answer":"QuestDB"')
  })
})
