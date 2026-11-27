import { afterEach, expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentPromptMessage,
  AgentTurnResult,
} from "../localAgent/protocol"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../localAgent/localAgentModel"
import { priorConversationFor } from "../localAgent/priorConversation"
import type { ConversationMessage } from "../../providers/AIConversationProvider/types"
import {
  type AIFlowCallbacks,
  type AIFlowConfig,
  createChatFlowConfig,
  createSchemaExplainFlowConfig,
  executeAIFlow,
} from "./executeAIFlow"

vi.mock("../../modules/ConsoleEventTracker", () => ({
  trackEvent: () => Promise.resolve(),
}))

const CONVERSATION_ID = "conversation-1"

// Turns another model answered: the agent has not read them.
const apiTurns: ConversationMessage[] = [
  {
    id: "api-question",
    role: "user",
    content: "Which tables hold trades?",
    timestamp: 1,
  },
  {
    id: "api-answer",
    role: "assistant",
    content: "The trades table.",
    timestamp: 2,
  },
]
const apiHandOver = [
  "<earlier_conversation>",
  "The user talked to another assistant in this chat before switching to you. Earlier messages, oldest first:",
  "User: Which tables hold trades?",
  "Assistant: The trades table.",
  "</earlier_conversation>",
].join("\n")

let channel: LocalAgentChannel | null = null

afterEach(() => {
  if (channel) {
    unregisterLocalAgentChannel(channel)
    channel.dispose()
  }
  channel = null
  vi.useRealTimers()
})

// The bridge: it records what the console writes, and fails to write a prompt
// once `dropPrompts` is set.
const connectAgent = () => {
  const sent: AgentInboundMessage[] = []
  let deliver: (msg: AgentOutboundMessage) => void = () => undefined
  const bridge = { dropPrompts: false }
  const client = {
    canSendAgentMessage: () => true,
    on: (_event: "agentMessage", handler: typeof deliver) => {
      deliver = handler
      return () => undefined
    },
    sendAgentMessage: (msg: AgentInboundMessage) => {
      if (msg.type === "agent_prompt" && bridge.dropPrompts) return false
      sent.push(msg)
      return true
    },
  } as unknown as MCPBridgeClient
  const agentChannel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Claude Code", cwd: "/tmp/workspace" },
    onNotebookRead: vi.fn(),
  })
  channel = agentChannel
  registerLocalAgentChannel(agentChannel)
  const lastPrompt = () => {
    const prompt = sent.findLast((msg) => msg.type === "agent_prompt")
    if (prompt?.type !== "agent_prompt") throw new Error("Expected a prompt")
    return prompt
  }
  const end = (prompt: AgentPromptMessage, result: AgentTurnResult) =>
    deliver({
      v: "0.6.0",
      type: "agent_turn_end",
      conversationId: prompt.conversationId,
      turnId: prompt.turnId,
      result,
    })
  return { channel: agentChannel, bridge, lastPrompt, end }
}

type Agent = ReturnType<typeof connectAgent>

const COMPLETED: AgentTurnResult = {
  outcome: "completed",
  stopReason: "end_turn",
  usage: null,
}
const CANCELLED: AgentTurnResult = {
  outcome: "completed",
  stopReason: "cancelled",
  usage: null,
}
const REFUSED: AgentTurnResult = {
  outcome: "failed",
  error: "The agent is still answering the previous message.",
}

// The chat's transcript, kept as the conversation provider keeps it.
const chatOf = (history: ConversationMessage[]) => {
  const messages = [...history]
  const patch = (id: string, updates: Partial<ConversationMessage>) => {
    const index = messages.findIndex((message) => message.id === id)
    if (index >= 0) messages[index] = { ...messages[index], ...updates }
  }
  const callbacks: AIFlowCallbacks = {
    addMessage: (message) => {
      messages.push({ ...message, id: message.id ?? crypto.randomUUID() })
    },
    updateMessage: (_, id, updates) => patch(id, updates),
    markHistorySeen: (_, id, localAgentSessionId) =>
      patch(id, { localAgentSessionId }),
    setStatus: () => undefined,
    setIsStreaming: () => undefined,
    persistMessages: () => Promise.resolve(),
  }
  return { messages, callbacks }
}

type Chat = ReturnType<typeof chatOf>

const chatTurn = (
  chat: Chat,
  request: string,
  { signal, agentCommand }: { signal?: AbortSignal; agentCommand?: boolean },
): AIFlowConfig =>
  createChatFlowConfig({
    conversationId: CONVERSATION_ID,
    userMessage: request,
    agentCommand,
    conversationHistory: [...chat.messages],
    isFirstMessage: false,
    settings: { model: LOCAL_AGENT_MODEL, apiKey: "" },
    localAgentChannel: channel,
    questClient: {} as never,
    hasSchemaAccess: false,
    abortSignal: signal,
  })

// Sends a turn, then lets the bridge reply with `result`.
const answered = async (
  agent: Agent,
  chat: Chat,
  config: AIFlowConfig,
  result: AgentTurnResult,
) => {
  const flow = executeAIFlow(config, chat.callbacks)
  agent.end(agent.lastPrompt(), result)
  await flow
}

// The user stops a turn before the agent's first update. The local grace
// settles it when the agent does not end it within 5 s.
const stopped = async (
  agent: Agent,
  chat: Chat,
  request: string,
  agentEnds: "before the grace" | "after the grace" | "never",
) => {
  vi.useFakeTimers()
  const abort = new AbortController()
  const flow = executeAIFlow(
    chatTurn(chat, request, { signal: abort.signal }),
    chat.callbacks,
  )
  const prompt = agent.lastPrompt()
  abort.abort()
  if (agentEnds === "before the grace") agent.end(prompt, CANCELLED)
  await vi.advanceTimersByTimeAsync(5_000)
  await flow
  if (agentEnds === "after the grace") agent.end(prompt, CANCELLED)
}

it.each<{
  name: string
  run: (agent: Agent, chat: Chat) => Promise<void>
  readHistory: boolean
}>([
  {
    name: "a turn the bridge accepted",
    run: (agent, chat) =>
      answered(agent, chat, chatTurn(chat, "Count trades", {}), COMPLETED),
    readHistory: true,
  },
  {
    name: "a turn stopped before its first update, which the agent ends before the grace",
    run: (agent, chat) =>
      stopped(agent, chat, "Count trades", "before the grace"),
    readHistory: true,
  },
  {
    name: "a turn stopped before its first update, which the agent ends after the grace",
    run: (agent, chat) =>
      stopped(agent, chat, "Count trades", "after the grace"),
    readHistory: true,
  },
  {
    name: "a turn stopped before its first update, which the agent never ends",
    run: (agent, chat) => stopped(agent, chat, "Count trades", "never"),
    readHistory: false,
  },
  {
    name: "a turn the bridge refused while a stopped turn still ran",
    run: async (agent, chat) => {
      await stopped(agent, chat, "Count trades", "never")
      await answered(agent, chat, chatTurn(chat, "Chart trades", {}), REFUSED)
    },
    readHistory: false,
  },
  {
    name: "a turn whose prompt could not be written",
    run: async (agent, chat) => {
      agent.bridge.dropPrompts = true
      await executeAIFlow(chatTurn(chat, "Count trades", {}), chat.callbacks)
    },
    readHistory: false,
  },
  {
    name: "an agent command",
    run: (agent, chat) =>
      answered(
        agent,
        chat,
        chatTurn(chat, "/review", { agentCommand: true }),
        COMPLETED,
      ),
    readHistory: false,
  },
  {
    name: "a schema explanation",
    run: (agent, chat) =>
      answered(
        agent,
        chat,
        createSchemaExplainFlowConfig({
          conversationId: CONVERSATION_ID,
          settings: { model: LOCAL_AGENT_MODEL, apiKey: "" },
          localAgentChannel: channel,
          questClient: {} as never,
          hasSchemaAccess: true,
          tableName: "trades",
          schema: "CREATE TABLE trades (price DOUBLE);",
          kindLabel: "table",
          schemaDisplayData: { tableName: "trades", kind: "table" },
        }),
        COMPLETED,
      ),
    readHistory: false,
  },
])(
  "hands the agent's next prompt the earlier history only until it read it, never its own turn, after $name",
  async ({ run, readHistory }) => {
    // Given a chat another model answered, and a turn addressed to the agent
    const agent = connectAgent()
    const chat = chatOf(apiTurns)

    // When the turn ends
    await run(agent, chat)

    // Then the agent's next prompt carries the earlier history while the
    // agent has not read it, and never the agent's own turns
    expect(priorConversationFor(chat.messages, agent.channel.sessionId)).toBe(
      readHistory ? null : apiHandOver,
    )
  },
)
