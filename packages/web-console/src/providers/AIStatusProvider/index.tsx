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
  return status === AIOperationStatus.InvestigatingSchema
    || status === AIOperationStatus.FormattingResponse
    || status === AIOperationStatus.Processing
}

const AIStatusContext = createContext<AIStatusContextType | undefined>(undefined)

export enum AIOperationStatus {
  Processing = 'Processing the request...',
  InvestigatingSchema = 'Investigating schema...',
  FormattingResponse = 'Formatting response...',
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

  const abortOperation = useCallback(() => {
    if (abortControllerRef.current && status !== null) {
      abortControllerRef.current?.abort()
      setAbortController(new AbortController())
      setStatus(AIOperationStatus.Aborted)
      editorRef.current?.updateOptions({
        readOnly: false,
        readOnlyMessage: undefined
      })
    }
  }, [])

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
