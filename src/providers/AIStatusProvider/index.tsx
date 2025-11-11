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
  Processing = "Processing the request",
  RetrievingTables = "Retrieving tables",
  InvestigatingTableSchema = "Investigating table schema",
  RetrievingDocumentation = "Retrieving docs",
  InvestigatingFunctions = "Investigating functions",
  InvestigatingOperators = "Investigating operators",
  InvestigatingKeywords = "Investigating keywords",
  FormattingResponse = "Formatting response",
  Aborted = "Operation has been cancelled",
}

type BaseAIStatusContextType = {
  status: AIOperationStatus | null
  setStatus: (status: AIOperationStatus | null) => void
  abortController: AbortController | null
  abortOperation: () => void
  hasSchemaAccess: boolean
  models: string[]
  aiAssistantPromo: boolean
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
  const [status, setStatus] = useState<AIOperationStatus | null>(null)
  const [abortController, setAbortController] = useState<AbortController>(
    new AbortController(),
  )
  const abortControllerRef = useRef<AbortController | null>(null)
  const statusRef = useRef<AIOperationStatus | null>(null)

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

  const aiAssistantPromo = useMemo(
    () => aiAssistantSettings.aiAssistantPromo !== false,
    [aiAssistantSettings],
  )

  const abortOperation = useCallback(() => {
    if (abortControllerRef.current && statusRef.current !== null) {
      abortControllerRef.current?.abort()
      setAbortController(new AbortController())
      setStatus(AIOperationStatus.Aborted)
      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined,
      })
    }
  }, [status, editorRef])

  useEffect(() => {
    abortControllerRef.current = abortController
  }, [abortController])

  useEffect(() => {
    statusRef.current = status
  }, [status])

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
        isConfigured: true,
        canUse,
        hasSchemaAccess: hasSchemaAccessValue,
        currentModel: currentModel!,
        apiKey: apiKey!,
        models,
        aiAssistantPromo,
      }
    : {
        status,
        setStatus,
        abortController,
        abortOperation,
        isConfigured: false,
        canUse: false,
        hasSchemaAccess: hasSchemaAccessValue,
        currentModel,
        apiKey,
        models,
        aiAssistantPromo,
      }

  return (
    <AIStatusContext.Provider value={contextValue}>
      {children}
    </AIStatusContext.Provider>
  )
}
