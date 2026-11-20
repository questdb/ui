// Agent mode wire protocol between the Web Console and the bridge. These frames
// travel on the same WebSocket as the MCP tool frames and carry the bridge
// semver in `v`. The Web Console owns this file
// (src/utils/localAgent/protocol.ts); the bridge keeps a byte-identical copy
// in src/agentProtocol.ts, refreshed by its `yarn sync-tools`.

export type AgentInfo = {
  id: string
  label: string
  cwd: string
}

export type AgentConfigChoice = {
  value: string
  name: string
  description: string | null
  group: string | null
}

export type AgentConfigSetting = {
  id: string
  current: string
  choices: AgentConfigChoice[]
}

export type AgentConfig = {
  model: AgentConfigSetting | null
  effort: AgentConfigSetting | null
}

// A command the agent takes in a message, like /review or /compact.
export type AgentCommand = {
  name: string
  description: string
  // What to write after it, like "[instructions]"; null when it takes none.
  hint: string | null
}

export type AgentState = "starting" | "ready" | "error"

// ---- Console → bridge -------------------------------------------------------

export type AgentPromptMessage = {
  v: string
  type: "agent_prompt"
  conversationId: string
  // Chosen by the console; every update and the end of the turn carry it, so
  // a late message of a cancelled turn never lands in the next one.
  turnId: string
  prompt: AgentPromptBlock[]
}

// An image the user attached, as base64; only for agents that read images.
export type AgentPromptImage = { mimeType: string; data: string }

export type AgentPromptBlock =
  | { type: "text"; text: string }
  | ({ type: "image" } & AgentPromptImage)

export type AgentCancelMessage = {
  v: string
  type: "agent_cancel"
  conversationId: string
}

// The user's answers to an agent's question, by field id: a string for a
// single choice or text, a list for a multiple choice. Null skips the question.
export type AgentQuestionAnswerMessage = {
  v: string
  type: "agent_question_answer"
  requestId: string
  answers: Record<string, string | string[]> | null
}

// The console's current agent preferences. Sent after every hello_ack and
// whenever the user changes one. Null keeps the agent's own default.
export type AgentSettingsMessage = {
  v: string
  type: "agent_settings"
  model: string | null
  effort: string | null
}

export type AgentRestartMessage = {
  v: string
  type: "agent_restart"
}

export type AgentInboundMessage =
  | AgentPromptMessage
  | AgentCancelMessage
  | AgentQuestionAnswerMessage
  | AgentSettingsMessage
  | AgentRestartMessage

// ---- Bridge → console -------------------------------------------------------

export type AgentToolCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"

// What a tool call produced, as far as the chat shows it: its text output,
// or a file it changed. Long ones are cut.
export type AgentToolContent =
  | { type: "text"; text: string }
  | {
      type: "diff"
      path: string
      // Null for a new file.
      oldText: string | null
      newText: string
      // Too large to show; the texts are empty.
      truncated?: boolean
    }

export type AgentUpdate =
  | { kind: "message_chunk"; messageId: string | null; text: string }
  | { kind: "thought_chunk"; text: string }
  | {
      kind: "tool_call"
      toolCallId: string
      title: string
      name: string | null
      toolKind: string | null
      status: AgentToolCallStatus | null
      content: AgentToolContent[] | null
    }
  | {
      kind: "tool_call_update"
      toolCallId: string
      title: string | null
      status: AgentToolCallStatus | null
      // What the tool reported, for a failed call.
      error: string | null
      // Replaces what the call showed before; null leaves it.
      content: AgentToolContent[] | null
    }
  // How full the agent's context is, in tokens.
  | { kind: "usage"; used: number; size: number }
  | { kind: "plan"; entries: { content: string; status: string }[] }
  // Something the agent wants the user to know during its turn: a warning
  // about its configuration, a rerouted model, a compacted context.
  | {
      kind: "notice"
      severity: AgentNoticeSeverity
      title: string
      description: string | null
    }

export type AgentNoticeSeverity = "info" | "warning" | "error"

export type AgentUpdateMessage = {
  v: string
  type: "agent_update"
  conversationId: string
  turnId: string
  update: AgentUpdate
}

export type AgentTokenUsage = {
  inputTokens: number
  outputTokens: number
}

export type AgentTurnResult =
  | { outcome: "completed"; stopReason: string; usage: AgentTokenUsage | null }
  | { outcome: "failed"; error: string }

export type AgentTurnEndMessage = {
  v: string
  type: "agent_turn_end"
  conversationId: string
  turnId: string
  result: AgentTurnResult
}

export type AgentQuestionOption = {
  value: string
  label: string
  description: string | null
}

// One field of an agent's question: a single or multiple choice, or text.
// A required field must be answered before the user can send the answers.
export type AgentQuestionField =
  | {
      id: string
      kind: "choice"
      title: string | null
      prompt: string | null
      options: AgentQuestionOption[]
      multiple: boolean
      required: boolean
      // The answer field for the user's own answer instead of, or for a
      // multiple choice besides, the options; null when the agent offers none.
      otherFieldId: string | null
    }
  | {
      id: string
      kind: "text"
      title: string | null
      prompt: string | null
      required: boolean
    }

// A question the agent asks the user in the middle of a turn, like which of a
// few options to take. The agent's tools are approved without asking.
export type AgentQuestionMessage = {
  v: string
  type: "agent_question"
  requestId: string
  conversationId: string
  message: string
  fields: AgentQuestionField[]
  // A page the agent asks the user to open, like a sign-in for a service it
  // connects to; the question then has no fields. Answering it, with no
  // answers, means the user opened it.
  url?: string | null
}

// The agent no longer waits for the answer, e.g. because the turn ended.
export type AgentQuestionClosedMessage = {
  v: string
  type: "agent_question_closed"
  requestId: string
}

export type AgentStatusMessage = {
  v: string
  type: "agent_status"
  state: AgentState
  config: AgentConfig | null
  error: string | null
  // The commands the agent takes; absent from bridges that do not report them.
  commands?: AgentCommand[]
  // Whether the agent reads images the user attaches.
  acceptsImages?: boolean
}

export type AgentOutboundMessage =
  | AgentUpdateMessage
  | AgentTurnEndMessage
  | AgentQuestionMessage
  | AgentQuestionClosedMessage
  | AgentStatusMessage
