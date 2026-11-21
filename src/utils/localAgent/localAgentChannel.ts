import type { StatusCallback } from "../ai/aiAssistant"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import { EXPECTED_MCP_VERSION } from "../mcp/protocolVersion"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type {
  AgentPromptImage,
  AgentCommand,
  AgentConfig,
  AgentInfo,
  AgentOutboundMessage,
  AgentQuestionMessage,
  AgentState,
  AgentTurnResult,
  AgentUpdate,
} from "./protocol"
import { questionTranscript } from "./questionTranscript"

const CANCEL_GRACE_MS = 5_000

const BRIDGE_DISCONNECTED: AgentTurnResult = {
  outcome: "failed",
  error: "The connection to the local agent bridge was lost.",
}

const TURN_IN_PROGRESS: AgentTurnResult = {
  outcome: "failed",
  error: "The agent is still answering the previous message.",
}

const CANCELLED: AgentTurnResult = {
  outcome: "completed",
  stopReason: "cancelled",
  usage: null,
}

export type NotebookRead = {
  bufferId: number
  readSeq: number
}

export type LocalAgentPrompt = {
  conversationId: string
  text: string
  images?: AgentPromptImage[]
  notebookRead: NotebookRead | null
  signal?: AbortSignal
  onUpdate: (update: AgentUpdate) => void
  onToolStatus: StatusCallback
}

export type LocalAgentPreferencesWire = {
  model: string | null
  effort: string | null
}

export type LocalAgentSnapshot = {
  info: AgentInfo
  state: AgentState
  error: string | null
  config: AgentConfig | null
  // Questions the agent waits on the user to answer.
  questions: AgentQuestionMessage[]
  // The commands the agent takes, like /review.
  commands: AgentCommand[]
  // Whether the agent reads images the user attaches.
  acceptsImages: boolean
}

export type LocalAgentChannelOptions = {
  info: AgentInfo
  onNotebookRead: (conversationId: string, read: NotebookRead) => void
}

type PendingTurn = {
  turnId: string
  onUpdate: (update: AgentUpdate) => void
  onToolStatus: StatusCallback
  settle: (result: AgentTurnResult) => void
  // Set once the user stops the turn; resolves when the turn has ended.
  stopping: Promise<void> | null
  startCancelGrace: () => void
}

// The console side of one paired agent bridge. It runs turns, keeps the
// agent's status and pending questions for the UI, and forwards preferences.
export class LocalAgentChannel {
  private turns = new Map<string, PendingTurn>()
  // The local Stop grace can expire before the bridge sees the cancel.
  private pendingCancels = new Map<string, string>()
  private disposed = false
  private preferences: LocalAgentPreferencesWire | null = null
  private snapshot: LocalAgentSnapshot
  private listeners = new Set<() => void>()
  private readonly unsubscribe: () => void

  constructor(
    private readonly client: MCPBridgeClient,
    private readonly options: LocalAgentChannelOptions,
  ) {
    this.snapshot = {
      info: options.info,
      state: "starting",
      error: null,
      config: null,
      questions: [],
      commands: [],
      acceptsImages: false,
    }
    this.unsubscribe = client.on("agentMessage", (msg) =>
      this.handleMessage(msg),
    )
  }

  get info(): AgentInfo {
    return this.options.info
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LocalAgentSnapshot => this.snapshot

  prompt({
    conversationId,
    text,
    images = [],
    notebookRead,
    signal,
    onUpdate,
    onToolStatus,
  }: LocalAgentPrompt): Promise<AgentTurnResult> {
    if (signal?.aborted) return Promise.resolve(CANCELLED)
    if (this.disposed) return Promise.resolve(BRIDGE_DISCONNECTED)
    const previous = this.turns.get(conversationId)
    if (previous) {
      // A message sent right after Stop waits for the agent to end the
      // stopped turn: the agent answers one prompt at a time per session.
      if (!previous.stopping) return Promise.resolve(TURN_IN_PROGRESS)
      return previous.stopping.then(() =>
        this.prompt({
          conversationId,
          text,
          images,
          notebookRead,
          signal,
          onUpdate,
          onToolStatus,
        }),
      )
    }
    if (notebookRead) this.options.onNotebookRead(conversationId, notebookRead)

    const turnId = crypto.randomUUID()
    const sent = this.client.sendAgentMessage({
      v: EXPECTED_MCP_VERSION,
      type: "agent_prompt",
      conversationId,
      turnId,
      prompt: [
        { type: "text", text },
        ...images.map((image) => ({ type: "image" as const, ...image })),
      ],
    })
    if (!sent) return Promise.resolve(BRIDGE_DISCONNECTED)
    // Cancels on the wire target the conversation. Once the new prompt is
    // written, no subsequent reconnect may send its predecessor's cancel.
    this.pendingCancels.delete(conversationId)

    return new Promise((resolve) => {
      let cancelTimer: ReturnType<typeof setTimeout> | undefined
      let stopped = () => {}
      const cancel = () => {
        turn.stopping = new Promise((resolve) => {
          stopped = resolve
        })
        this.pendingCancels.set(conversationId, turnId)
        this.sendCancel(conversationId, turnId)
      }
      const turn: PendingTurn = {
        turnId,
        onUpdate,
        onToolStatus,
        stopping: null,
        startCancelGrace: () => {
          // Replay never extends the grace that started on the first write.
          cancelTimer ??= setTimeout(
            () => this.settleTurn(conversationId, turnId, CANCELLED),
            CANCEL_GRACE_MS,
          )
        },
        settle: (result) => {
          clearTimeout(cancelTimer)
          signal?.removeEventListener("abort", cancel)
          resolve(result)
          stopped()
        },
      }
      this.turns.set(conversationId, turn)
      if (signal?.aborted) cancel()
      else signal?.addEventListener("abort", cancel, { once: true })
    })
  }

  // The console runs every QuestDB tool call itself; the status it reports
  // goes to the turn of the conversation that made the call.
  reportToolStatus(
    conversationId: string,
    ...status: Parameters<StatusCallback>
  ): void {
    this.turns.get(conversationId)?.onToolStatus(...status)
  }

  resume(): void {
    if (this.disposed) return
    if (this.preferences) this.sendPreferences(this.preferences)
    for (const [conversationId, turnId] of this.pendingCancels) {
      this.sendCancel(conversationId, turnId)
    }
  }

  sendPreferences(preferences: LocalAgentPreferencesWire): void {
    this.preferences = preferences
    this.client.sendAgentMessage({
      v: EXPECTED_MCP_VERSION,
      type: "agent_settings",
      ...preferences,
    })
  }

  restart(): void {
    void trackEvent(ConsoleEvent.LOCAL_AGENT_RESTART, {
      agent: this.options.info.id,
    })
    this.client.sendAgentMessage({
      v: EXPECTED_MCP_VERSION,
      type: "agent_restart",
    })
  }

  // Null skips the question.
  answerQuestion(
    requestId: string,
    answers: Record<string, string | string[]> | null,
  ): boolean {
    const question = this.snapshot.questions.find(
      (pending) => pending.requestId === requestId,
    )
    if (!question) return false
    const sent = this.client.sendAgentMessage({
      v: EXPECTED_MCP_VERSION,
      type: "agent_question_answer",
      requestId,
      answers,
    })
    if (!sent) return false
    void trackEvent(ConsoleEvent.LOCAL_AGENT_QUESTION, {
      agent: this.options.info.id,
      outcome: answers ? "answered" : "skipped",
    })
    // The chat keeps the question and the answer in the agent's reply.
    this.turns.get(question.conversationId)?.onUpdate({
      kind: "message_chunk",
      messageId: `question:${requestId}`,
      text: questionTranscript(question, answers),
    })
    this.removeQuestion(requestId)
    return true
  }

  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    this.pendingCancels.clear()
    for (const [conversationId, turn] of Array.from(this.turns)) {
      this.settleTurn(conversationId, turn.turnId, BRIDGE_DISCONNECTED)
    }
    this.listeners.clear()
  }

  private sendCancel(conversationId: string, turnId: string): void {
    const sent = this.client.sendAgentMessage({
      v: EXPECTED_MCP_VERSION,
      type: "agent_cancel",
      conversationId,
    })
    // An accepted write starts local grace but is not an acknowledgement.
    if (sent) this.turnOf(conversationId, turnId)?.startCancelGrace()
  }

  private update(patch: Partial<LocalAgentSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of Array.from(this.listeners)) listener()
  }

  private removeQuestion(requestId: string): void {
    this.update({
      questions: this.snapshot.questions.filter(
        (question) => question.requestId !== requestId,
      ),
    })
  }

  private handleMessage(msg: AgentOutboundMessage): void {
    switch (msg.type) {
      case "agent_status":
        this.update({
          state: msg.state,
          error: msg.error,
          config: msg.config,
          commands: msg.commands ?? [],
          acceptsImages: msg.acceptsImages === true,
        })
        return
      case "agent_update":
        this.turnOf(msg.conversationId, msg.turnId)?.onUpdate(msg.update)
        return
      case "agent_turn_end":
        if (this.pendingCancels.get(msg.conversationId) === msg.turnId) {
          this.pendingCancels.delete(msg.conversationId)
        }
        this.settleTurn(msg.conversationId, msg.turnId, msg.result)
        return
      case "agent_question":
        this.update({
          questions: [
            ...this.snapshot.questions.filter(
              (question) => question.requestId !== msg.requestId,
            ),
            msg,
          ],
        })
        return
      case "agent_question_closed":
        this.removeQuestion(msg.requestId)
        return
    }
  }

  private turnOf(conversationId: string, turnId: string) {
    const turn = this.turns.get(conversationId)
    return turn?.turnId === turnId ? turn : undefined
  }

  private settleTurn(
    conversationId: string,
    turnId: string,
    result: AgentTurnResult,
  ): void {
    const turn = this.turnOf(conversationId, turnId)
    if (!turn) return
    this.turns.delete(conversationId)
    turn.settle(result)
  }
}

let activeChannel: LocalAgentChannel | null = null

export const registerLocalAgentChannel = (channel: LocalAgentChannel): void => {
  activeChannel = channel
}

export const unregisterLocalAgentChannel = (
  channel: LocalAgentChannel,
): void => {
  if (activeChannel === channel) activeChannel = null
}

export const getLocalAgentChannel = (): LocalAgentChannel | null =>
  activeChannel
