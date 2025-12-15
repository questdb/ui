import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  useEffect,
  useMemo,
} from "react"
import { useEditor } from "../EditorProvider"
import { useLocalStorage } from "../LocalStorageProvider"
import {
  isAiAssistantConfigured,
  getSelectedModel,
  hasSchemaAccess,
  providerForModel,
  canUseAiAssistant,
} from "../../utils/aiAssistantSettings"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"

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
  InvestigatingTableSchema = "Investigating table schema",
  RetrievingDocumentation = "Reviewing docs",
  InvestigatingDocs = "Investigating docs",
  ValidatingQuery = "Validating generated query",
  Aborted = "Operation has been cancelled",
}

export type StatusArgs =
  | ({ queryKey?: QueryKey } & (
      | { type: "generate" }
      | { type: "fix" }
      | { type: "explain" }
      | { type: "followup" }
      | { name: string }
      | { name: string; section: string }
      | { items: Array<{ name: string; section?: string }> }
    ))
  | null

export type StatusEntry = {
  type: AIOperationStatus
  args?: StatusArgs
}

export type OperationHistory = StatusEntry[]

type BaseAIStatusContextType = {
  status: AIOperationStatus | null
  setStatus: (status: AIOperationStatus | null, args?: StatusArgs) => void
  abortController: AbortController | null
  abortOperation: () => void
  hasSchemaAccess: boolean
  models: string[]
  currentOperation: OperationHistory
  activeQueryKey: QueryKey | null
  clearOperation: () => void
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
  const { editorRef } = useEditor()
  const { aiAssistantSettings } = useLocalStorage()
  const [status, setStatusState] = useState<AIOperationStatus | null>(null)
  const [currentOperation, setCurrentOperation] = useState<OperationHistory>([])
  const [abortController, setAbortController] = useState<AbortController>(
    new AbortController(),
  )
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
    const provider = providerForModel(currentModel)
    return aiAssistantSettings.providers?.[provider]?.apiKey || null
  }, [currentModel, aiAssistantSettings])

  const models = useMemo(() => {
    const allModels: string[] = []
    const anthropicModels =
      aiAssistantSettings.providers?.anthropic?.enabledModels || []
    const openaiModels =
      aiAssistantSettings.providers?.openai?.enabledModels || []
    allModels.push(...anthropicModels, ...openaiModels)
    return allModels
  }, [aiAssistantSettings])

  const setStatus = useCallback(
    (newStatus: AIOperationStatus | null, args?: StatusArgs) => {
      if (newStatus !== null) {
        const statusPayload = {
          type: newStatus,
          args: args || undefined,
        }
        if (
          statusRef.current === null ||
          statusRef.current === AIOperationStatus.Aborted
        ) {
          currentOperationRef.current = [statusPayload]
        } else {
          currentOperationRef.current.push(statusPayload)
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
  }, [status, editorRef, setStatus])

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
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const activeQueryKey =
    currentOperation.find((entry) => entry.args?.queryKey)?.args?.queryKey ??
    null

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
        activeQueryKey,
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
        activeQueryKey,
      }

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  )
}
