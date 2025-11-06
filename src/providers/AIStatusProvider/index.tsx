import React, { createContext, useCallback, useContext, useState, useRef, useEffect } from 'react'
import { useEditor } from '../EditorProvider'

export const useAIStatus = () => {
  const context = useContext(AIStatusContext)
  if (!context) {
    throw new Error('useAIStatus must be used within AIStatusProvider')
  }
  return context
}

export const isBlockingAIStatus = (status: AIOperationStatus | null) => {
  return status !== undefined && status !== null && status !== AIOperationStatus.Aborted
}

const AIStatusContext = createContext<AIStatusContextType | undefined>(undefined)

export enum AIOperationStatus {
  Processing = 'Processing the request',
  RetrievingTables = 'Retrieving tables',
  InvestigatingTableSchema = 'Investigating table schema',
  RetrievingDocumentation = 'Retrieving docs',
  InvestigatingFunctions = 'Investigating functions',
  InvestigatingOperators = 'Investigating operators',
  InvestigatingKeywords = 'Investigating keywords',
  FormattingResponse = 'Formatting response',
  Aborted = 'Operation has been cancelled'
}

export interface AIStatusContextType {
  status: AIOperationStatus | null
  setStatus: (status: AIOperationStatus | null) => void
  abortController: AbortController | null
  abortOperation: () => void
}

interface AIStatusProviderProps {
  children: React.ReactNode
}

export const AIStatusProvider: React.FC<AIStatusProviderProps> = ({ children }) => {
  const { editorRef } = useEditor()
  const [status, setStatus] = useState<AIOperationStatus | null>(null)
  const [abortController, setAbortController] = useState<AbortController>(new AbortController())
  const abortControllerRef = useRef<AbortController | null>(null)
  const statusRef = useRef<AIOperationStatus | null>(null)

  const abortOperation = useCallback(() => {
    if (abortControllerRef.current && statusRef.current !== null) {
      abortControllerRef.current?.abort()
      setAbortController(new AbortController())
      setStatus(AIOperationStatus.Aborted)
      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined
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

  return (
    <AIStatusContext.Provider value={{ 
      status, 
      setStatus, 
      abortController,
      abortOperation 
    }}>
      {children}
    </AIStatusContext.Provider>
  )
}
