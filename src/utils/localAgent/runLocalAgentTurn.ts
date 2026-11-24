import type {
  AiAssistantAPIError,
  GeneratedSQL,
  StatusCallback,
  StreamingCallback,
} from "../ai/aiAssistant"
import type {
  AgentPromptImage,
  AgentToolContent,
  AgentUpdate,
} from "./protocol"
import type { ContextUsage } from "../ai/aiAssistant"
import { stopReasonNotice } from "./noticeTranscript"
import { questionRecordText } from "./questionTranscript"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
import { classifyAgentToolCall, questdbToolName } from "./agentToolCalls"
import { toolStatusOf } from "../tools/toolStatus"
import type { StatusArgs } from "../../providers/AIStatusProvider"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  isCurrentLocalAgentChannel,
  type LocalAgentChannel,
  type LocalAgentUpdate,
  type NotebookRead,
} from "./localAgentChannel"

type LocalAgentTurnParams = {
  channel: LocalAgentChannel | null
  conversationId: string
  userMessage: string
  images?: AgentPromptImage[]
  notebookRead: NotebookRead | null
  setStatus: StatusCallback
  streaming: StreamingCallback
  onPromptSent?: () => void
  abortSignal?: AbortSignal
}

const NOT_CONNECTED: AiAssistantAPIError = {
  type: "network",
  message:
    "The local agent is not connected. Start the QuestDB MCP server with the `serve` command and pair this console.",
}

const ABORTED: AiAssistantAPIError = {
  type: "aborted",
  message: "Operation has been cancelled",
}

// After the user stops a turn the agent may still report work for a moment;
// none of it may reopen the status the stop just closed.
// A step with what its call reported: content replaces what it showed, and
// null content leaves it.
const withToolContent = (
  step: StatusArgs,
  content: AgentToolContent[] | null,
): StatusArgs => {
  if (content === null) return step
  const { output: _output, diffs: _diffs, ...rest } = step
  const output = content
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .join("\n\n")
  const diffs = content.flatMap((item) =>
    item.type === "diff"
      ? [
          {
            path: item.path,
            oldText: item.oldText,
            newText: item.newText,
            ...(item.truncated && { truncated: true }),
          },
        ]
      : [],
  )
  return {
    ...rest,
    ...(output && { output }),
    ...(diffs.length > 0 && { diffs }),
  }
}

const createUpdateHandler = (
  setStatus: StatusCallback,
  streaming: StreamingCallback,
  abortSignal: AbortSignal | undefined,
  sessionId: string,
) => {
  let reply = ""
  const questionRecords: string[] = []
  const transcript = () =>
    [reply, ...questionRecords].filter(Boolean).join("\n\n")
  let lastMessageId: string | null = null
  let isThinking = false
  const reportedToolCalls = new Set<string>()
  // The step each of the agent's own tool calls shows, to update it.
  const ownToolSteps = new Map<string, StatusArgs>()
  let contextUsage: ContextUsage | null = null
  // The agent's plan, as one step updated in place.
  let planStep: StatusArgs | null = null

  const handlePlan = (entries: { content: string; status: string }[]) => {
    if (abortSignal?.aborted) return
    const step: StatusArgs = { plan: entries, callId: "plan" }
    if (planStep) {
      setStatus(AIOperationStatus.Planning, { ...step, replaces: planStep })
    } else {
      handleStatus(AIOperationStatus.Planning, step)
      setStatus(AIOperationStatus.Planning, { ...step, ended: true })
    }
    planStep = step
  }

  const handleStatus: StatusCallback = (status, args) => {
    if (abortSignal?.aborted) return
    isThinking = false
    setStatus(status, args)
  }

  const handleMessageChunk = (messageId: string | null, text: string) => {
    const newMessage = messageId !== lastMessageId
    const followsRecord = newMessage && questionRecords.length > 0
    // Keep records after their whole ACP message, even when it resumes after
    // an answer. A different ACP message can start a separate Markdown block.
    if (followsRecord) {
      reply = transcript()
      questionRecords.length = 0
    }
    const chunk = newMessage && reply ? `\n\n${text}` : text
    isThinking = false
    lastMessageId = messageId
    reply += chunk
    if (followsRecord) streaming.onTextChunk(chunk, { startSection: true })
    else streaming.onTextChunk(chunk)
  }

  const handleThoughtChunk = (text: string) => {
    const chunk = isThinking ? text : text.trimStart()
    if (!chunk) return
    isThinking = true
    streaming.onThinkingChunk?.(chunk)
  }

  const handleToolCall = (
    toolCall: Extract<AgentUpdate, { kind: "tool_call" }>,
  ) => {
    if (reportedToolCalls.has(toolCall.toolCallId)) return
    reportedToolCalls.add(toolCall.toolCallId)
    switch (classifyAgentToolCall(toolCall)) {
      case "questdb": {
        // Shown while the agent prepares the call; the console's own status
        // for it replaces this once the call arrives.
        const status = toolStatusOf(questdbToolName(toolCall) ?? "")
        if (status) handleStatus(status, { transient: true })
        return
      }
      case "review":
        handleStatus(AIOperationStatus.ReviewingToolCall, { transient: true })
        return
      case "lookup":
        handleStatus(AIOperationStatus.LoadingTools, { transient: true })
        return
      case "own": {
        const step: StatusArgs = withToolContent(
          {
            name: toolCall.title,
            ...(toolCall.toolKind && { toolKind: toolCall.toolKind }),
            callId: toolCall.toolCallId,
          },
          toolCall.content,
        )
        ownToolSteps.set(toolCall.toolCallId, step)
        handleStatus(AIOperationStatus.UsingAgentTools, step)
        return
      }
    }
  }

  // A finished tool ends its step: until the agent's next step, "Working"
  // shows. QuestDB tools fail through the console's dispatch, which marks
  // them; the agent's own tools are marked here.
  const handleToolCallUpdate = (
    update: Extract<AgentUpdate, { kind: "tool_call_update" }>,
  ) => {
    // Agents stream a call's input after announcing it: a shell call starts
    // as "bash" and its title grows into the command. Its output and the
    // files it changes come the same way. The step follows them.
    const announced = ownToolSteps.get(update.toolCallId)
    if (announced && !abortSignal?.aborted) {
      const step = withToolContent(
        update.title ? { ...announced, name: update.title } : announced,
        update.content,
      )
      if (JSON.stringify(step) !== JSON.stringify(announced)) {
        ownToolSteps.set(update.toolCallId, step)
        setStatus(AIOperationStatus.UsingAgentTools, {
          ...step,
          replaces: announced,
        })
      }
    }
    if (update.status !== "completed" && update.status !== "failed") return
    if (!reportedToolCalls.has(update.toolCallId)) return
    reportedToolCalls.delete(update.toolCallId)
    if (abortSignal?.aborted) return
    const step = ownToolSteps.get(update.toolCallId)
    ownToolSteps.delete(update.toolCallId)
    if (step) {
      setStatus(
        AIOperationStatus.UsingAgentTools,
        update.status === "failed"
          ? { ...step, failed: update.error ?? "" }
          : { ...step, ended: true },
      )
    }
    handleStatus(AIOperationStatus.GeneratingResponse, { transient: true })
  }

  const handleUpdate = (update: LocalAgentUpdate): void => {
    if (abortSignal?.aborted) return
    switch (update.kind) {
      case "message_chunk":
        handleMessageChunk(update.messageId, update.text)
        return
      case "question_record":
        questionRecords.push(questionRecordText(update.record))
        streaming.onQuestionRecord?.(update.record, transcript)
        return
      case "thought_chunk":
        handleThoughtChunk(update.text)
        return
      case "tool_call":
        handleToolCall(update)
        return
      case "tool_call_update":
        handleToolCallUpdate(update)
        return
      case "plan":
        handlePlan(update.entries)
        return
      case "usage":
        contextUsage = { used: update.used, size: update.size, sessionId }
        streaming.onContextUsage?.(contextUsage)
        return
      case "notice": {
        // This is a structured bridge event, but its wire fields still need
        // to be safe to pass directly to the transcript renderer.
        const { severity, title, description } = update
        if (
          (severity === "info" ||
            severity === "warning" ||
            severity === "error") &&
          typeof title === "string"
        ) {
          streaming.onNotice?.({
            severity,
            title,
            description: typeof description === "string" ? description : null,
          })
        }
        return
      }
      default:
        return
    }
  }

  return {
    handleUpdate,
    handleStatus,
    reply: transcript,
    contextUsage: () => contextUsage,
  }
}

export const runLocalAgentTurn = async ({
  channel,
  conversationId,
  userMessage,
  images,
  notebookRead,
  setStatus,
  streaming,
  onPromptSent,
  abortSignal,
}: LocalAgentTurnParams): Promise<GeneratedSQL | AiAssistantAPIError> => {
  if (!isCurrentLocalAgentChannel(channel)) return NOT_CONNECTED

  const startedAt = Date.now()
  const { handleUpdate, handleStatus, reply, contextUsage } =
    createUpdateHandler(setStatus, streaming, abortSignal, channel.sessionId)
  const result = await channel.prompt({
    conversationId,
    text: userMessage,
    images,
    notebookRead,
    signal: abortSignal,
    onSent: onPromptSent,
    onUpdate: handleUpdate,
    onToolStatus: handleStatus,
  })

  void trackEvent(ConsoleEvent.LOCAL_AGENT_TURN, {
    agent: channel.info.id,
    outcome: result.outcome === "failed" ? "failed" : result.stopReason,
    durationMs: Date.now() - startedAt,
  })

  if (result.outcome === "completed") {
    const notice = stopReasonNotice(result.stopReason)
    if (notice) streaming.onNotice?.(notice)
  }
  if (
    abortSignal?.aborted ||
    (result.outcome === "completed" && result.stopReason === "cancelled")
  ) {
    return ABORTED
  }
  if (result.outcome === "failed") {
    setStatus(null)
    return { type: "unknown", message: result.error }
  }
  setStatus(null)
  // An agent's answer shows how full its context is. Agents count tokens
  // each their own way, so those are not shown.
  const usage = contextUsage()
  return {
    sql: null,
    explanation: reply(),
    ...(usage && { contextUsage: usage }),
  }
}
