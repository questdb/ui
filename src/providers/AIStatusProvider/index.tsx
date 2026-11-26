import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  useEffect,
  useMemo,
} from "react"
import { useLocalStorage } from "../LocalStorageProvider"
import {
  isAiAssistantConfigured,
  getSelectedModel,
  hasSchemaAccess,
  providerForModel,
  canUseAiAssistant,
  getAllEnabledModels,
  getApiKey,
} from "../../utils/ai"
import type { AiAssistantSettings } from "../LocalStorageProvider/types"
import {
  useLocalAgent,
  useLocalAgentSchemaAccess,
} from "../../utils/localAgent/LocalAgentContext"
import type { NoticeRecord } from "../../utils/localAgent/noticeTranscript"
import type { QuestionRecord } from "../../utils/localAgent/questionTranscript"
import { LOCAL_AGENT_MODEL } from "../../utils/localAgent/localAgentModel"

export const useAIStatus = () => {
  const context = useContext(AIStatusContext)
  if (!context) {
    throw new Error("useAIStatus must be used within AIStatusProvider")
  }
  return context
}

// The abort reason of an answer the user replaced with a new message. Its
// message ends without an error: the new message follows it.
export const STEERED_ABORT_REASON = "steered"

export const isBlockingAIStatus = (status: AIOperationStatus | null) => {
  return (
    status !== undefined &&
    status !== null &&
    status !== AIOperationStatus.Aborted
  )
}

const AIStatusContext = createContext<AIStatusContextType | undefined>(
  undefined,
)

export enum AIOperationStatus {
  Processing = "Processing request",
  RetrievingTables = "Reviewing tables",
  InvestigatingTable = "Investigating table",
  RetrievingDocumentation = "Reviewing docs",
  InvestigatingDocs = "Investigating docs",
  ValidatingQuery = "Validating query",
  RunningQuery = "Running query",
  GeneratingResponse = "Generating response",
  Aborted = "Operation has been cancelled",
  Compacting = "Compacting conversation",
  Thinking = "Thinking",
  BuildingNotebook = "Building notebook",
  DuplicatingNotebook = "Duplicating notebook",
  DeletingNotebook = "Deleting notebook",
  AddingCell = "Adding cell",
  UpdatingCell = "Updating cell",
  DeletingCell = "Deleting cell",
  RunningCell = "Running cell",
  // Layout = positional/structural; Chart = visualization settings.
  ConfiguringLayout = "Configuring layout",
  ConfiguringChart = "Configuring chart",
  ConfiguringHighlight = "Configuring highlight rules",
  // Auto-refresh applies to grids as well as charts — neutral wording.
  ConfiguringAutoRefresh = "Configuring auto-refresh",
  InspectingNotebook = "Inspecting notebook",
  UsingAgentTools = "Using agent tools",
  ReviewingToolCall = "Reviewing tool call",
  LoadingTools = "Loading tools",
  // An agent's to-do list for the task, updated as it works.
  Planning = "Plan",
}

export type StatusArgs = {
  name?: string
  section?: string
  tableOpType?: "schema" | "details"
  items?: Array<{ name: string; section?: string }>
  label?: string
  cellId?: string
  content?: string
  // Distinguishes separate Markdown sections at different reply offsets.
  markdownBlockOffset?: number
  // The agent's tool kind (execute, read, edit, …) for its own tool calls.
  toolKind?: string
  // The agent's id for one of its tool calls, which tells two runs of the
  // same command apart.
  callId?: string
  // What an agent's own tool printed, and the files it changed.
  output?: string
  diffs?: ToolDiff[]
  // An agent's to-do list, as it last sent it.
  plan?: PlanEntry[]
  // A transient status shows only while it is the latest one: the next
  // status replaces it instead of following it in the history.
  transient?: boolean
  // Why the step failed. Setting a status with it marks the step with the
  // same status and details as failed, and ended, instead of adding one.
  failed?: string
  // Setting a status with it marks the step with the same status and details
  // as ended, instead of adding one: its tool is done. A step without it
  // ends when the next one starts.
  ended?: boolean
  // Drops all but this many steps first: a retried answer starts over from
  // the steps it showed before its first attempt.
  truncateTo?: number
  // Updates the step with the same status and these details to the new
  // ones, instead of adding one: an agent's tool call gets its title as its
  // input streams in.
  replaces?: StatusArgs
}

export type PlanEntry = {
  content: string
  // pending, in_progress or completed; an agent may send others.
  status: string
}

export type ToolDiff = {
  path: string
  // Null for a new file.
  oldText: string | null
  newText: string
  // Too large to show; the texts are empty.
  truncated?: boolean
}

export type TranscriptBlock =
  | { kind: "question"; record: QuestionRecord }
  | { kind: "notice"; notice: NoticeRecord }

// Characters start to end of the content of the turn's message with this id.
export type ContentSlice = { messageId: string; start: number; end: number }

export type StatusEntry = {
  type: AIOperationStatus
  args?: StatusArgs
  timestamp: number
  // When the step's tool finished, if the step reported it.
  endedAt?: number
  // A thinking step's thoughts, a query step's SQL, and the text of a
  // response step a chat saved before contentSlices.
  content?: string
  // The text a response step streamed, in its messages' content, so that
  // the reply is stored once.
  contentSlices?: ContentSlice[]
  // Only typed in-app events populate this; it is never parsed from Markdown.
  transcriptBlock?: TranscriptBlock
}

export type OperationHistory = StatusEntry[]

// Updates the latest step with this status and details; null if there is no
// such step. Only the very step: a failure without one becomes a failed step
// of its own.
const updateStep = (
  history: OperationHistory,
  status: AIOperationStatus,
  details: StatusArgs,
  update: (entry: StatusEntry) => StatusEntry,
): OperationHistory | null => {
  const sameDetails = JSON.stringify(details)
  const index = history.findLastIndex(
    (entry) =>
      entry.type === status && JSON.stringify(entry.args ?? {}) === sameDetails,
  )
  if (index === -1) return null
  return history.map((entry, i) => (i === index ? update(entry) : entry))
}

const endStep = (entry: StatusEntry): StatusEntry =>
  entry.endedAt === undefined ? { ...entry, endedAt: Date.now() } : entry

export const dropTransientTail = (
  history: OperationHistory,
): OperationHistory =>
  history[history.length - 1]?.args?.transient ? history.slice(0, -1) : history

type BaseAIStatusContextType = {
  status: AIOperationStatus | null
  isOperationBlocking: () => boolean
  setStatus: (
    status: AIOperationStatus | null,
    args?: StatusArgs,
    onUpdate?: (history: OperationHistory) => void,
  ) => void
  getOperationSignal: () => AbortSignal
  abortOperation: () => void
  // Stops the running answer because the user sent a new message instead.
  steerOperation: () => void
  hasSchemaAccess: boolean
  models: string[]
  currentOperation: OperationHistory
  clearOperation: () => void
  aiAssistantSettings: AiAssistantSettings
}

export type AIStatusContextType =
  | (BaseAIStatusContextType & {
      isConfigured: true
      canUse: true
      unavailableReason: null
      currentModel: string
      apiKey: string
    })
  | (BaseAIStatusContextType & {
      isConfigured: boolean
      canUse: false
      unavailableReason: string
      currentModel: string | null
      apiKey: string | null
    })

interface AIStatusProviderProps {
  children: React.ReactNode
}

export const AIStatusProvider: React.FC<AIStatusProviderProps> = ({
  children,
}) => {
  const { aiAssistantSettings } = useLocalStorage()
  const localAgent = useLocalAgent()
  const localAgentSchemaAccess = useLocalAgentSchemaAccess()
  const [status, setStatusState] = useState<AIOperationStatus | null>(null)
  const [currentOperation, setCurrentOperation] = useState<OperationHistory>([])
  const abortControllerRef = useRef(new AbortController())
  const getOperationSignal = useCallback(
    () => abortControllerRef.current.signal,
    [],
  )
  const statusRef = useRef<AIOperationStatus | null>(null)
  const currentOperationRef = useRef<OperationHistory>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isConfigured = useMemo(
    () => isAiAssistantConfigured(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const isLocalAgentSelected =
    aiAssistantSettings.selectedModel === LOCAL_AGENT_MODEL
  const hasSelectedLocalAgent = isLocalAgentSelected && localAgent !== null

  // While the selected local agent is offline, the configured API model
  // answers instead; the agent takes over again once it reconnects. The
  // bottom bar shows whether it is connected.
  const currentModel = useMemo(
    () =>
      hasSelectedLocalAgent
        ? LOCAL_AGENT_MODEL
        : getSelectedModel(aiAssistantSettings),
    [hasSelectedLocalAgent, aiAssistantSettings],
  )

  // A local agent reaches the schema through the bridge, so the bridge's
  // permission decides, not the API provider's.
  const hasSchemaAccessValue = hasSelectedLocalAgent
    ? localAgentSchemaAccess
    : hasSchemaAccess(aiAssistantSettings)

  const apiKey = useMemo(() => {
    if (hasSelectedLocalAgent) return ""
    if (!currentModel) return null
    const provider = providerForModel(currentModel, aiAssistantSettings)
    if (!provider) return null
    return getApiKey(provider, aiAssistantSettings)
  }, [hasSelectedLocalAgent, currentModel, aiAssistantSettings])

  const models = useMemo(
    () => getAllEnabledModels(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const setStatus = useCallback(
    (
      newStatus: AIOperationStatus | null,
      args?: StatusArgs,
      onUpdate?: (history: OperationHistory) => void,
    ) => {
      let truncated = false
      if (args?.truncateTo !== undefined) {
        truncated = true
        const { truncateTo, ...rest } = args
        currentOperationRef.current = currentOperationRef.current.slice(
          0,
          truncateTo,
        )
        args = Object.keys(rest).length > 0 ? rest : undefined
      }
      if (newStatus !== null && args?.replaces !== undefined) {
        const { replaces, ...next } = args
        const updated = updateStep(
          currentOperationRef.current,
          newStatus,
          replaces,
          (entry) => ({ ...entry, args: next }),
        )
        if (updated) {
          currentOperationRef.current = updated
          onUpdate?.([...updated])
          setCurrentOperation([...updated])
          return
        }
        args = next
      }
      if (
        newStatus !== null &&
        (args?.failed !== undefined || args?.ended === true)
      ) {
        const { failed, ended: _ended, ...details } = args
        const marked = updateStep(
          currentOperationRef.current,
          newStatus,
          details,
          (entry) =>
            endStep(
              failed === undefined
                ? entry
                : { ...entry, args: { ...entry.args, failed } },
            ),
        )
        if (marked) {
          currentOperationRef.current = marked
          onUpdate?.([...marked])
          setCurrentOperation([...marked])
          return
        }
        // Ending a step that is not shown changes nothing.
        if (failed === undefined) return
        args = { ...details, failed }
      }
      if (newStatus !== null) {
        const normalizedArgs = args || null
        const settledHistory = dropTransientTail(currentOperationRef.current)
        const lastEntry = settledHistory[settledHistory.length - 1]
        const isDuplicateConsecutiveStatus =
          !!lastEntry &&
          lastEntry.type === newStatus &&
          JSON.stringify(lastEntry.args ?? null) ===
            JSON.stringify(normalizedArgs)

        const startsNewOperation =
          statusRef.current === null ||
          (statusRef.current === AIOperationStatus.Aborted &&
            newStatus !== AIOperationStatus.Aborted)
        if (isDuplicateConsecutiveStatus && !startsNewOperation) {
          if (settledHistory === currentOperationRef.current && !truncated) {
            return
          }
          currentOperationRef.current = settledHistory
        } else {
          const statusPayload: StatusEntry = {
            type: newStatus,
            args: normalizedArgs ?? undefined,
            timestamp: Date.now(),
            ...(normalizedArgs?.content !== undefined && {
              content: normalizedArgs.content,
            }),
          }
          currentOperationRef.current = startsNewOperation
            ? [statusPayload]
            : [...settledHistory, statusPayload]
        }
        if (onUpdate) {
          onUpdate([...currentOperationRef.current])
        }
      }
      if (newStatus === null && isBlockingAIStatus(statusRef.current)) {
        // A normally settled turn is no longer the owner of Stop. Do not
        // abort its signal: a submitted follow-up may still be waiting on it.
        abortControllerRef.current = new AbortController()
      }
      setCurrentOperation([...currentOperationRef.current])
      statusRef.current = newStatus
      setStatusState(newStatus)
    },
    [],
  )

  const isOperationBlocking = useCallback(
    () => isBlockingAIStatus(statusRef.current),
    [],
  )

  const clearOperation = useCallback(() => {
    currentOperationRef.current = []
    setCurrentOperation([])
  }, [])

  const stopOperation = useCallback(
    (reason?: typeof STEERED_ABORT_REASON) => {
      if (isBlockingAIStatus(statusRef.current)) {
        abortControllerRef.current.abort(reason)
        abortControllerRef.current = new AbortController()
        setStatus(AIOperationStatus.Aborted)
      }
    },
    [setStatus],
  )
  const abortOperation = useCallback(() => stopOperation(), [stopOperation])
  const steerOperation = useCallback(
    () => stopOperation(STEERED_ABORT_REASON),
    [stopOperation],
  )

  useEffect(() => {
    if (status === AIOperationStatus.Aborted && timeoutRef.current === null) {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        if (statusRef.current !== AIOperationStatus.Aborted) return
        currentOperationRef.current = []
        setCurrentOperation([])
        setStatus(null)
      }, 2000)
    } else if (
      status !== AIOperationStatus.Aborted &&
      timeoutRef.current !== null
    ) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [status])

  useEffect(() => {
    return () => {
      abortControllerRef.current.abort()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const baseContext = {
    status,
    isOperationBlocking,
    setStatus,
    getOperationSignal,
    abortOperation,
    steerOperation,
    clearOperation,
    hasSchemaAccess: hasSchemaAccessValue,
    currentModel,
    apiKey,
    models,
    currentOperation,
    aiAssistantSettings,
  }
  const contextValue: AIStatusContextType =
    currentModel !== null &&
    apiKey !== null &&
    (hasSelectedLocalAgent || canUseAiAssistant(aiAssistantSettings))
      ? {
          ...baseContext,
          currentModel,
          apiKey,
          isConfigured: true,
          canUse: true,
          unavailableReason: null,
        }
      : {
          ...baseContext,
          isConfigured: isConfigured || hasSelectedLocalAgent,
          canUse: false,
          unavailableReason: isLocalAgentSelected
            ? "Your agent is not connected"
            : "AI Assistant is not configured",
        }

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  )
}
