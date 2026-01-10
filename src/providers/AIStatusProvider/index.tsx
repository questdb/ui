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
  isCustomProvider,
  parseCustomModelValue,
} from "../../utils/aiAssistantSettings"

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
  Compacting = "Compacting conversation",
}

export type StatusArgs = {
  conversationId?: string
  name?: string
  section?: string
  items?: Array<{ name: string; section?: string }>
}

export type StatusEntry = {
  type: AIOperationStatus
  args?: StatusArgs
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
}

export type AIStatusContextType =
  | (BaseAIStatusContextType & {
      isConfigured: true
      canUse: boolean
      currentModel: string
      apiKey: string
      baseUrl: string | null
    })
  | (BaseAIStatusContextType & {
      isConfigured: false
      canUse: false
      currentModel: string | null
      apiKey: string | null
      baseUrl: string | null
    })

interface AIStatusProviderProps {
  children: React.ReactNode
}

export const AIStatusProvider: React.FC<AIStatusProviderProps> = ({
  children,
}) => {
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
    // Handle custom providers
    if (isCustomProvider(provider)) {
      return aiAssistantSettings.customProviders?.[provider]?.apiKey || ""
    }
    // Handle built-in providers
    return aiAssistantSettings.providers?.[provider as "anthropic" | "openai"]?.apiKey || null
  }, [currentModel, aiAssistantSettings])

  const baseUrl = useMemo(() => {
    if (!currentModel) return null
    const provider = providerForModel(currentModel)
    // Only custom providers have a baseUrl
    if (isCustomProvider(provider)) {
      return aiAssistantSettings.customProviders?.[provider]?.baseUrl || null
    }
    return null
  }, [currentModel, aiAssistantSettings])

  const models = useMemo(() => {
    const allModels: string[] = []
    // Built-in provider models
    const anthropicModels =
      aiAssistantSettings.providers?.anthropic?.enabledModels || []
    const openaiModels =
      aiAssistantSettings.providers?.openai?.enabledModels || []
    allModels.push(...anthropicModels, ...openaiModels)
    // Custom provider models (format: "providerId:modelId")
    for (const [providerId, providerSettings] of Object.entries(
      aiAssistantSettings.customProviders || {},
    )) {
      const customModels = providerSettings.enabledModels.map(
        (modelId) => `${providerId}:${modelId}`,
      )
      allModels.push(...customModels)
    }
    return allModels
  }, [aiAssistantSettings])

  const setStatus = useCallback(
    (
      newStatus: AIOperationStatus | null,
      args?: StatusArgs,
      onUpdate?: (history: OperationHistory) => void,
    ) => {
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
        baseUrl,
        models,
        currentOperation,
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
        baseUrl,
        models,
        currentOperation,
      }

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  )
}
