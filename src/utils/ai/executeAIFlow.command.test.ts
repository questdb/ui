import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentPromptImage,
} from "../localAgent/protocol"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../localAgent/localAgentChannel"
import { LOCAL_AGENT_MODEL } from "../localAgent/localAgentModel"
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
let channel: LocalAgentChannel | null = null

afterEach(() => {
  if (channel) unregisterLocalAgentChannel(channel)
  channel = null
})

// Earlier turns the agent has not seen: another model answered them.
const earlierTurns: ConversationMessage[] = [
  { id: "u1", role: "user", content: "List the tables", timestamp: 1 },
  { id: "a1", role: "assistant", content: "trades, quotes", timestamp: 2 },
]

const localConfig = {
  conversationId: CONVERSATION_ID,
  settings: { model: LOCAL_AGENT_MODEL, apiKey: "" },
  questClient: {} as never,
  hasSchemaAccess: false,
}

const runFlow = async (config: AIFlowConfig, onAgentReply?: () => void) => {
  const sent: AgentInboundMessage[] = []
  let deliver: (msg: AgentOutboundMessage) => void = () => undefined
  const client = {
    on: (_event: "agentMessage", handler: typeof deliver) => {
      deliver = handler
      return () => undefined
    },
    sendAgentMessage: (msg: AgentInboundMessage) => {
      sent.push(msg)
      if (msg.type === "agent_prompt") {
        queueMicrotask(() => {
          onAgentReply?.()
          deliver({
            v: "0.6.0",
            type: "agent_turn_end",
            conversationId: CONVERSATION_ID,
            turnId: msg.turnId,
            result: {
              outcome: "completed",
              stopReason: "end_turn",
              usage: null,
            },
          })
        })
      }
      return true
    },
  } as unknown as MCPBridgeClient
  channel = new LocalAgentChannel(client, {
    info: { id: "claude", label: "Claude Code", cwd: "/tmp/workspace" },
    onNotebookRead: vi.fn(),
  })
  registerLocalAgentChannel(channel)
  const updateMessage = vi.fn<
    Parameters<AIFlowCallbacks["updateMessage"]>,
    void
  >()
  const addMessage = vi.fn<Parameters<AIFlowCallbacks["addMessage"]>, void>()
  const persistMessages = vi.fn(() => Promise.resolve())
  const result = await executeAIFlow(config, {
    addMessage,
    updateMessage,
    setStatus: vi.fn(),
    setIsStreaming: vi.fn(),
    persistMessages,
  })
  const prompt = sent.find((msg) => msg.type === "agent_prompt")
  return {
    prompt: prompt?.type === "agent_prompt" ? prompt.prompt : [],
    updateMessage,
    addMessage,
    persistMessages,
    result,
  }
}

const runTurn = (
  message: string,
  agentCommand: boolean,
  images?: AgentPromptImage[],
  onAgentReply?: () => void,
) =>
  runFlow(
    createChatFlowConfig({
      ...localConfig,
      userMessage: message,
      agentCommand,
      images,
      conversationHistory: earlierTurns,
      isFirstMessage: false,
      notebookContext: {
        snapshot: null,
        digest: undefined,
        workspace: { active: null, notebooks: [] },
        readSeq: 0,
      } as never,
    }),
    onAgentReply,
  )

it("does not mark earlier chat turns as seen after a local schema explanation", async () => {
  const schema = "CREATE TABLE trades (price DOUBLE);"
  const quickAction = await runFlow(
    createSchemaExplainFlowConfig({
      ...localConfig,
      hasSchemaAccess: true,
      tableName: "trades",
      schema,
      kindLabel: "table",
      schemaDisplayData: { tableName: "trades", kind: "table" },
    }),
  )
  expect(quickAction.result.success).toBe(true)
  const schemaPrompt = quickAction.prompt[0]
  expect(schemaPrompt?.type === "text" && schemaPrompt.text).toContain(schema)
  expect(schemaPrompt?.type === "text" && schemaPrompt.text).not.toContain(
    "<earlier_conversation>",
  )

  const schemaMessages = quickAction.addMessage.mock.calls.map(([message]) => {
    const id = message.id ?? "schema-request"
    const updates = quickAction.updateMessage.mock.calls
      .filter(([, updatedId]) => updatedId === id)
      .map(([, , patch]) => patch)
    return updates.reduce<ConversationMessage>(
      (current, patch) => ({ ...current, ...patch }),
      { ...message, id },
    )
  })
  const followUp = await runFlow(
    createChatFlowConfig({
      ...localConfig,
      userMessage: "What tables did we list?",
      conversationHistory: [...earlierTurns, ...schemaMessages],
      isFirstMessage: false,
    }),
  )
  const prompt = followUp.prompt[0]
  expect(prompt?.type === "text" && prompt.text).toContain(
    "User: List the tables\nAssistant: trades, quotes",
  )
  expect(followUp.updateMessage).toHaveBeenCalledWith(
    CONVERSATION_ID,
    expect.any(String),
    { localAgentId: "claude" },
  )
})

it("stores the elapsed turn time on the anchor before persisting the reply", async () => {
  // Given
  const now = vi.spyOn(performance, "now").mockReturnValue(1_000)
  try {
    // When
    const { addMessage, updateMessage, persistMessages } = await runTurn(
      "List the trades",
      false,
      undefined,
      () => now.mockReturnValue(21_000),
    )

    // Then
    const anchor = addMessage.mock.calls.find(
      ([msg]) => msg.role === "assistant",
    )?.[0]
    expect(anchor?.id).toBeDefined()
    expect(updateMessage).toHaveBeenLastCalledWith(
      CONVERSATION_ID,
      anchor?.id,
      { turnDurationMs: 20_000 },
    )
    expect(updateMessage.mock.invocationCallOrder.at(-1)).toBeLessThan(
      persistMessages.mock.invocationCallOrder[0],
    )
  } finally {
    now.mockRestore()
  }
})

it("keeps empty display text when sending only an image", async () => {
  // Given
  const image = { mimeType: "image/png", data: "iVBORw0KGgo=" }

  // When
  const { prompt, addMessage } = await runTurn("", false, [image])

  // Then
  expect(prompt).toContainEqual({ type: "image", ...image })
  const saved = addMessage.mock.calls.find(([msg]) => msg.role === "user")?.[0]
  expect(saved?.content).toContain("<workspace>")
  expect(saved?.displayUserMessage).toBe("")
  expect(saved?.images).toEqual([image])
})

describe("an agent's command", () => {
  it("goes to the agent as the user wrote it, so the agent reads it as a command", async () => {
    // When
    const { prompt, updateMessage } = await runTurn(
      "/review the last edit",
      true,
    )

    // Then
    expect(prompt[0]).toEqual({ type: "text", text: "/review the last edit" })
    // The earlier turns still go with the agent's next message.
    expect(updateMessage).not.toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.anything(),
      expect.objectContaining({ localAgentId: "claude" }),
    )
  })

  it("is saved as a command, so a retry sends it as one again", async () => {
    // When
    const command = await runTurn("/review", true)
    const message = await runTurn("Show me the trades", false)

    // Then
    expect(command.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", agentCommand: true }),
    )
    expect(message.addMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentCommand: true }),
    )
  })

  it("leaves a message that is not a command with what goes before it", async () => {
    // When
    const { prompt } = await runTurn("Show me the trades", false)

    // Then
    const text = prompt[0]
    expect(text?.type === "text" && text.text).toContain(
      "<earlier_conversation>",
    )
  })
})
