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
import { useAIConversation } from "../AIConversationProvider"

export const useAIStatus = () => {
  const context = useContext(AIStatusContext)
  if (!context) {
    throw new Error("useAIStatus must be used within AIStatusProvider")
  }
  return context
}

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
  GeneratingResponse = "Generating response",
  Aborted = "Operation has been cancelled",
  Compacting = "Compacting conversation",
}

export type StatusArgs = {
  conversationId?: string
  name?: string
  section?: string
  tableOpType?: "schema" | "details"
  items?: Array<{ name: string; section?: string }>
}

export type StatusEntry = {
  type: AIOperationStatus
  args?: StatusArgs
  timestamp: number
}

export type OperationHistory = StatusEntry[]

type BaseAIStatusContextType = {
  status: AIOperationStatus | null
  setStatus: (
    status: AIOperationStatus | null,
    args?: StatusArgs,
    onUpdate?: (history: OperationHistory) => void,
  ) => void
  abortController: AbortController | null
  abortOperation: () => void
  hasSchemaAccess: boolean
  models: string[]
  currentOperation: OperationHistory
  clearOperation: () => void
  aiAssistantSettings: AiAssistantSettings
}

export type AIStatusContextType =
  | (BaseAIStatusContextType & {
      isConfigured: true
      canUse: boolean
      currentModel: string
      apiKey: string
    })
  | (BaseAIStatusContextType & {
      isConfigured: false
      canUse: false
      currentModel: string | null
      apiKey: string | null
    })

interface AIStatusProviderProps {
  children: React.ReactNode
}

export const AIStatusProvider: React.FC<AIStatusProviderProps> = ({
  children,
}) => {
  const { isStreaming } = useAIConversation()
  const { aiAssistantSettings } = useLocalStorage()
  const [status, setStatusState] = useState<AIOperationStatus | null>(null)
  const [currentOperation, setCurrentOperation] = useState<OperationHistory>([])
  const [abortController, setAbortController] = useState<AbortController>(
    new AbortController(),
  )
  const isStreamingRef = useRef(isStreaming)
  const abortControllerRef = useRef<AbortController | null>(null)
  const statusRef = useRef<AIOperationStatus | null>(null)
  const currentOperationRef = useRef<OperationHistory>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isConfigured = useMemo(
    () => isAiAssistantConfigured(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const canUse = useMemo(
    () => canUseAiAssistant(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const currentModel = useMemo(
    () => getSelectedModel(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const hasSchemaAccessValue = useMemo(
    () => hasSchemaAccess(aiAssistantSettings),
    [aiAssistantSettings],
  )

  const apiKey = useMemo(() => {
    if (!currentModel) return null
    const provider = providerForModel(currentModel, aiAssistantSettings)
    if (!provider) return null
    return getApiKey(provider, aiAssistantSettings)
  }, [currentModel, aiAssistantSettings])

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
      if (newStatus !== null) {
        const statusPayload: StatusEntry = {
          type: newStatus,
          args: args || undefined,
          timestamp: Date.now(),
        }
        if (
          statusRef.current === null ||
          (statusRef.current === AIOperationStatus.Aborted &&
            newStatus !== AIOperationStatus.Aborted)
        ) {
          currentOperationRef.current = [statusPayload]
        } else {
          currentOperationRef.current.push(statusPayload)
        }
        if (onUpdate) {
          onUpdate([...currentOperationRef.current])
        }
      }
      setCurrentOperation([...currentOperationRef.current])
      statusRef.current = newStatus
      setStatusState(newStatus)
    },
    [],
  )

  const clearOperation = useCallback(() => {
    currentOperationRef.current = []
    setCurrentOperation([])
  }, [])

  const abortOperation = useCallback(() => {
    if (
      abortControllerRef.current &&
      statusRef.current !== null &&
      statusRef.current !== AIOperationStatus.Aborted
    ) {
      abortControllerRef.current?.abort()
      setAbortController(new AbortController())
      setStatus(AIOperationStatus.Aborted)
    }
  }, [setStatus])

  useEffect(() => {
    if (status === AIOperationStatus.Aborted && timeoutRef.current === null) {
      timeoutRef.current = setTimeout(() => {
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
    abortControllerRef.current = abortController
  }, [abortController])

  useEffect(() => {
    if (!isStreamingRef.current && isStreaming) {
      setStatus(AIOperationStatus.GeneratingResponse)
    } else if (isStreamingRef.current && !isStreaming) {
      if (statusRef.current !== AIOperationStatus.Aborted) {
        setStatus(null)
      }
    }
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const contextValue: AIStatusContextType = isConfigured
    ? {
        status,
        setStatus,
        abortController,
        abortOperation,
        clearOperation,
        isConfigured: true,
        canUse,
        hasSchemaAccess: hasSchemaAccessValue,
        currentModel: currentModel!,
        apiKey: apiKey!,
        models,
        currentOperation,
        aiAssistantSettings,
      }
    : {
        status,
        setStatus,
        abortController,
        abortOperation,
        clearOperation,
        isConfigured: false,
        canUse: false,
        hasSchemaAccess: hasSchemaAccessValue,
        currentModel,
        apiKey,
        models,
        currentOperation,
        aiAssistantSettings,
      }

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  )
}
