import type { StatusCallback } from "../ai/aiAssistant"
import type { MCPBridgeClient } from "../mcp/MCPBridgeClient"
import { AIOperationStatus } from "../../providers/AIStatusProvider"
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
import { buildQuestionRecord, type QuestionRecord } from "./questionTranscript"

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

const ignoreStatus: StatusCallback = () => undefined

export type NotebookRead = {
  bufferId: number
  readSeq: number
}

export type LocalAgentUpdate =
  | AgentUpdate
  | { kind: "question_record"; record: QuestionRecord }

export type LocalAgentPrompt = {
  conversationId: string
  text: string
  images?: AgentPromptImage[]
  notebookRead: NotebookRead | null
  signal?: AbortSignal
  onSent?: () => void
  onUpdate: (update: LocalAgentUpdate) => void
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
  // The first reported model is the baseline for prompts queued before it.
  initialModelConfig?: NonNullable<AgentConfig["model"]>
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

type StoppedTurn = {
  turnId: string
  // Already aborted: whatever the stopped turn still asks for is cancelled.
  toolSignal: AbortSignal
}

type PendingTurn = {
  turnId: string
  onUpdate: LocalAgentPrompt["onUpdate"]
  onToolStatus: StatusCallback
  toolSignal: AbortSignal
  settle: (result: AgentTurnResult) => void
  // Set once the user stops the turn; resolves when the turn has ended.
  stopping: Promise<void> | null
  startCancelGrace: () => void
}

// The console side of one paired agent bridge. It runs turns, keeps the
// agent's status and pending questions for the UI, and forwards preferences.
export class LocalAgentChannel {
  // An opaque history marker for this channel's lifetime, including reconnects.
  readonly sessionId = crypto.randomUUID()
  private turns = new Map<string, PendingTurn>()
  // The local Stop grace can expire before the bridge sees the cancel.
  private pendingCancels = new Map<string, StoppedTurn>()
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

  // Transport readiness is separate from agent state and channel identity.
  // The bridge publishes connected only after the hello acknowledgement.
  isTransportReady = (): boolean =>
    !this.disposed && this.client.canSendAgentMessage()

  subscribeToTransport = (listener: () => void): (() => void) =>
    this.client.on("status", listener)

  prompt({
    conversationId,
    text,
    images = [],
    notebookRead,
    signal,
    onSent,
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
          onSent,
          onUpdate,
          onToolStatus,
        }),
      )
    }
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
    onSent?.()
    if (notebookRead) this.options.onNotebookRead(conversationId, notebookRead)
    // Cancels on the wire target the conversation. Once the new prompt is
    // written, no subsequent reconnect may send its predecessor's cancel.
    this.pendingCancels.delete(conversationId)

    return new Promise((resolve) => {
      let cancelTimer: ReturnType<typeof setTimeout> | undefined
      let stopped = () => {}
      const toolAborter = new AbortController()
      const cancel = () => {
        turn.stopping = new Promise((resolve) => {
          stopped = resolve
        })
        toolAborter.abort(signal?.reason)
        this.pendingCancels.set(conversationId, {
          turnId,
          toolSignal: toolAborter.signal,
        })
        this.clearQuestions(conversationId)
        this.sendCancel(conversationId, turnId)
      }
      const turn: PendingTurn = {
        turnId,
        onUpdate,
        onToolStatus,
        toolSignal: toolAborter.signal,
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
          toolAborter.abort()
          resolve(result)
          stopped()
        },
      }
      this.turns.set(conversationId, turn)
      if (signal?.aborted) cancel()
      else signal?.addEventListener("abort", cancel, { once: true })
    })
  }

  // Capture the exact turn at receipt, not when the tool eventually reports
  // progress. Ownership is for status and cancellation, not authorization.
  captureToolRequest(client: MCPBridgeClient, conversationId: string) {
    if (this.disposed || client !== this.client) return undefined
    // A request that arrives after Stop still belongs to the stopped turn,
    // also once the local grace ended before the agent confirmed the cancel.
    const stopped = this.pendingCancels.get(conversationId)
    if (stopped) return { setStatus: ignoreStatus, signal: stopped.toolSignal }
    const turn = this.liveTurnOf(conversationId)
    if (!turn) return undefined
    let queryId: string | undefined
    const setStatus: StatusCallback = (status, args) => {
      if (this.liveTurnOf(conversationId) !== turn) return
      // Equal SQL may be run more than once in the same turn. Key each
      // console query's progress and outcome without retaining the wire ID.
      if (status === AIOperationStatus.RunningQuery) {
        queryId ??= crypto.randomUUID()
        args = { ...args, callId: queryId }
      }
      turn.onToolStatus(status, args)
    }
    return { setStatus, signal: turn.toolSignal }
  }

  resume(): void {
    if (this.disposed) return
    if (this.preferences) this.sendPreferences(this.preferences)
    for (const [conversationId, { turnId }] of this.pendingCancels) {
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
      kind: "question_record",
      record: buildQuestionRecord(question, answers),
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
    const questions = this.snapshot.questions.filter(
      (question) => question.requestId !== requestId,
    )
    if (questions.length !== this.snapshot.questions.length) {
      this.update({ questions })
    }
  }

  private handleMessage(msg: AgentOutboundMessage): void {
    switch (msg.type) {
      case "agent_status": {
        const initialModelConfig =
          this.snapshot.initialModelConfig ?? msg.config?.model
        this.update({
          state: msg.state,
          error: msg.error,
          config: msg.config,
          ...(initialModelConfig && { initialModelConfig }),
          commands: msg.commands ?? [],
          acceptsImages: msg.acceptsImages === true,
        })
        return
      }
      case "agent_update":
        this.turnOf(msg.conversationId, msg.turnId)?.onUpdate(msg.update)
        return
      case "agent_turn_end":
        if (
          this.pendingCancels.get(msg.conversationId)?.turnId === msg.turnId
        ) {
          this.pendingCancels.delete(msg.conversationId)
        }
        this.settleTurn(msg.conversationId, msg.turnId, msg.result)
        return
      case "agent_question": {
        // Questions have no wire turn ID. A stopping turn can no longer ask.
        if (!this.liveTurnOf(msg.conversationId)) return
        this.update({
          questions: [
            ...this.snapshot.questions.filter(
              (question) => question.requestId !== msg.requestId,
            ),
            msg,
          ],
        })
        return
      }
      case "agent_question_closed":
        this.removeQuestion(msg.requestId)
        return
    }
  }

  // The conversation's running turn, unless the user stopped it.
  private liveTurnOf(conversationId: string) {
    const turn = this.turns.get(conversationId)
    return turn?.stopping ? undefined : turn
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
    this.clearQuestions(conversationId)
  }

  private clearQuestions(conversationId: string): void {
    const questions = this.snapshot.questions.filter(
      (question) => question.conversationId !== conversationId,
    )
    if (questions.length !== this.snapshot.questions.length) {
      this.update({ questions })
    }
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

export const isCurrentLocalAgentChannel = (
  channel: LocalAgentChannel | null | undefined,
): channel is LocalAgentChannel => channel != null && channel === activeChannel
