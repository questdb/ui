import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react"
import type {
  AIConversation,
  ConversationMessage,
  ChatWindowState,
  ConversationId,
} from "./types"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import {
  normalizeQueryText,
  createQueryKey,
  getQueryInfoFromKey,
  shiftQueryKey,
} from "../../scenes/Editor/Monaco/utils"
import { useEditor } from "../EditorProvider"
import { normalizeSql } from "../../utils/aiAssistant"
import { buildIndices, createQueryLookupKey } from "./indices"

export type AcceptSuggestionParams = {
  conversationId: ConversationId
  messageId: string
}

type AIConversationContextType = {
  conversations: Map<ConversationId, AIConversation>
  chatWindowState: ChatWindowState

  getConversation: (id: ConversationId) => AIConversation | undefined
  findConversationByQuery: (
    bufferId: number,
    queryKey: QueryKey,
  ) => AIConversation | undefined
  findConversationByTableId: (tableId: number) => AIConversation | undefined
  hasConversationForQuery: (bufferId: number, queryKey: QueryKey) => boolean

  createConversation: (options: {
    bufferId?: number
    queryKey?: QueryKey
    tableId?: number
  }) => AIConversation
  getOrCreateConversationForQuery: (options: {
    bufferId: number
    queryKey: QueryKey
  }) => AIConversation
  shiftQueryKeysForBuffer: (
    bufferId: string | number,
    changeOffset: number,
    delta: number,
  ) => void

  openChatWindow: (conversationId: ConversationId) => void
  openOrCreateBlankChatWindow: () => void
  openBlankChatWindow: () => void
  closeChatWindow: () => void
  openHistoryView: () => void
  closeHistoryView: () => void
  deleteConversation: (conversationId: ConversationId) => void

  addMessage: (
    conversationId: ConversationId,
    message: Omit<ConversationMessage, "id"> & { id?: string },
  ) => void
  updateMessage: (
    conversationId: ConversationId,
    messageId: string,
    updates: Partial<ConversationMessage>,
  ) => void
  replaceConversationMessages: (
    conversationId: ConversationId,
    newMessages: Array<ConversationMessage>,
  ) => void
  updateConversationName: (conversationId: ConversationId, name: string) => void

  acceptSuggestion: (params: AcceptSuggestionParams) => Promise<void>
  rejectSuggestion: (conversationId: ConversationId) => Promise<void>
}

const AIConversationContext = createContext<
  AIConversationContextType | undefined
>(undefined)

export const useAIConversation = () => {
  const context = useContext(AIConversationContext)
  if (!context) {
    throw new Error(
      "useAIConversation must be used within AIConversationProvider",
    )
  }
  return context
}

export const AIConversationProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const [conversations, setConversations] = useState<
    Map<ConversationId, AIConversation>
  >(new Map())

  const [chatWindowState, setChatWindowState] = useState<ChatWindowState>({
    isOpen: false,
    activeConversationId: null,
    isHistoryOpen: false,
    previousConversationId: null,
  })

  const indices = useMemo(() => buildIndices(conversations), [conversations])

  const getConversation = useCallback(
    (id: ConversationId): AIConversation | undefined => {
      return conversations.get(id)
    },
    [conversations],
  )

  const findConversationByQuery = useCallback(
    (
      bufferId: string | number,
      queryKey: QueryKey,
    ): AIConversation | undefined => {
      const lookupKey = createQueryLookupKey(bufferId, queryKey)
      const id = indices.queryIndex.get(lookupKey)
      return id ? conversations.get(id) : undefined
    },
    [conversations, indices],
  )

  const findConversationByTableId = useCallback(
    (tableId: number): AIConversation | undefined => {
      const id = indices.tableIndex.get(tableId)
      return id ? conversations.get(id) : undefined
    },
    [conversations, indices],
  )

  const hasConversationForQuery = useCallback(
    (bufferId: string | number, queryKey: QueryKey): boolean => {
      const lookupKey = createQueryLookupKey(bufferId, queryKey)
      const conversationId: ConversationId | undefined =
        indices.queryIndex.get(lookupKey)
      if (!conversationId) return false
      const conversation = conversations.get(conversationId)
      return conversation !== undefined && conversation.messages.length > 0
    },
    [indices, conversations],
  )

  const createConversation = useCallback(
    (options: {
      bufferId?: number
      queryKey?: QueryKey
      tableId?: number
    }): AIConversation => {
      const id = crypto.randomUUID()
      const { queryText } = getQueryInfoFromKey(options.queryKey)
      const conversation: AIConversation = {
        id,
        queryKey: options.queryKey,
        bufferId: options.bufferId,
        tableId: options.tableId,
        currentSQL: queryText,
        conversationName: "AI Assistant",
        messages: [],
        updatedAt: Date.now(),
      }

      setConversations((prev) => {
        const next = new Map(prev)
        next.set(id, conversation)
        return next
      })

      return conversation
    },
    [],
  )

  const getOrCreateConversationForQuery = useCallback(
    (options: { bufferId: number; queryKey: QueryKey }): AIConversation => {
      const existing = findConversationByQuery(
        options.bufferId,
        options.queryKey,
      )
      if (existing) {
        return existing
      }

      return createConversation({
        bufferId: options.bufferId,
        queryKey: options.queryKey,
      })
    },
    [findConversationByQuery, createConversation],
  )

  const updateConversationAssociations = useCallback(
    (
      conversationId: ConversationId,
      updates: {
        bufferId?: number
        queryKey?: QueryKey
      },
    ): void => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (!conv) return prev

        next.set(conversationId, {
          ...conv,
          ...updates,
          updatedAt: Date.now(),
        })
        return next
      })
    },
    [],
  )

  const shiftQueryKeysForBuffer = useCallback(
    (bufferId: string | number, changeOffset: number, delta: number): void => {
      setConversations((prev) => {
        const next = new Map(prev)
        let hasChanges = false

        for (const [id, conv] of prev) {
          if (conv.bufferId === bufferId && conv.queryKey) {
            const { startOffset } = getQueryInfoFromKey(conv.queryKey)
            // Only shift if the query starts at or after the change point
            if (startOffset >= changeOffset) {
              const newQueryKey = shiftQueryKey(
                conv.queryKey,
                changeOffset,
                delta,
              )
              next.set(id, {
                ...conv,
                queryKey: newQueryKey,
                updatedAt: Date.now(),
              })
              hasChanges = true
            }
          }
        }

        return hasChanges ? next : prev
      })
    },
    [],
  )

  const addMessage = useCallback(
    (
      conversationId: ConversationId,
      message: Omit<ConversationMessage, "id"> & { id?: string },
    ) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv) {
          const messageWithId: ConversationMessage = {
            ...message,
            id: message.id || crypto.randomUUID(),
          }
          next.set(conversationId, {
            ...conv,
            messages: [...conv.messages, messageWithId],
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const updateMessage = useCallback(
    (
      conversationId: ConversationId,
      messageId: string,
      updates: Partial<ConversationMessage>,
    ) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv) {
          let hasSQLChange = false
          const updatedMessages = conv.messages.map((msg) => {
            if (msg.id !== messageId) return msg

            // If sql is being set and message doesn't have previousSQL yet, compute it
            let finalUpdates = updates
            const newSql = updates.sql
            if (
              newSql !== undefined &&
              msg.previousSQL === undefined &&
              updates.previousSQL === undefined
            ) {
              const { queryText: acceptedSQL } = getQueryInfoFromKey(
                conv.queryKey,
              )
              const normalizedNewSQL = normalizeQueryText(newSql || "")
              const normalizedAcceptedSQL = normalizeQueryText(acceptedSQL)
              const sqlActuallyChanged =
                normalizedNewSQL !== normalizedAcceptedSQL

              if (sqlActuallyChanged) {
                hasSQLChange = true
              }

              finalUpdates = {
                ...updates,
                previousSQL: sqlActuallyChanged ? acceptedSQL : undefined,
              }
            }

            return { ...msg, ...finalUpdates }
          })
          next.set(conversationId, {
            ...conv,
            messages: updatedMessages,
            currentSQL: hasSQLChange ? updates.sql : conv.currentSQL,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const replaceConversationMessages = useCallback(
    (
      conversationId: ConversationId,
      newMessages: Array<ConversationMessage>,
    ) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv) {
          const conversationMessages = [...conv.messages]
          let lastReplaceIndex = -1
          // Replace history messages with new messages (`isCompacted` flag is set to true in compaction)
          for (const message of newMessages) {
            const index = conversationMessages.findIndex(
              (m) => m.id === message.id,
            )
            if (index !== -1) {
              lastReplaceIndex = Math.max(lastReplaceIndex, index)
              conversationMessages[index] = message
            }
          }
          // Add the summarization message at the end of summarized part
          conversationMessages.splice(
            lastReplaceIndex + 1,
            0,
            newMessages[newMessages.length - 1],
          )

          next.set(conversationId, {
            ...conv,
            messages: conversationMessages,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationSQL = useCallback(
    (conversationId: ConversationId, sql: string) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv) {
          const { startOffset } = getQueryInfoFromKey(conv.queryKey)
          const newQueryKey = createQueryKey(sql, startOffset)
          next.set(conversationId, {
            ...conv,
            currentSQL: sql,
            queryKey: newQueryKey,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationName = useCallback(
    (conversationId: ConversationId, name: string) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv) {
          next.set(conversationId, {
            ...conv,
            conversationName: name,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const acceptConversationChanges = useCallback(
    (conversationId: ConversationId, messageId: string) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (!conv) return next

        const targetMessage = conv.messages.find((m) => m.id === messageId)
        if (!targetMessage || !targetMessage.sql) {
          return next
        }

        const { startOffset } = getQueryInfoFromKey(conv.queryKey)
        const newQueryKey = createQueryKey(targetMessage.sql, startOffset)

        const updatedMessages = conv.messages.map((msg) => {
          if (msg.id === messageId) {
            return { ...msg, isAccepted: true }
          }
          return msg
        })

        next.set(conversationId, {
          ...conv,
          queryKey: newQueryKey,
          messages: updatedMessages,
          updatedAt: Date.now(),
        })
        return next
      })
    },
    [],
  )

  const rejectLatestChange = useCallback((conversationId: ConversationId) => {
    setConversations((prev) => {
      const next = new Map(prev)
      const conv = next.get(conversationId)
      if (conv) {
        // Find the latest assistant message with SQL change
        let latestAssistantIndex = -1
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          if (conv.messages[i].role === "assistant" && conv.messages[i].sql) {
            latestAssistantIndex = i
            break
          }
        }

        if (latestAssistantIndex === -1) {
          return next
        }

        const latestMessage = conv.messages[latestAssistantIndex]
        if (!latestMessage) {
          return next
        }

        // Revert currentSQL to previous SQL (from message or queryKey as fallback)
        const { queryText: acceptedSQL } = getQueryInfoFromKey(conv.queryKey)
        const revertedSQL =
          typeof latestMessage.previousSQL === "string"
            ? latestMessage.previousSQL
            : acceptedSQL

        const updatedMessages = conv.messages.map((msg, idx) => {
          if (idx === latestAssistantIndex) {
            return { ...msg, isRejected: true }
          }
          return msg
        })

        // Add user message about rejection so model is aware in future conversations
        // Hide from UI but include in conversation history for API calls
        const rejectionMessage: ConversationMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: `User rejected your latest change. Please use the previous version as the base for future modifications.`,
          timestamp: Date.now(),
          hideFromUI: true,
        }

        next.set(conversationId, {
          ...conv,
          currentSQL: revertedSQL,
          messages: [...updatedMessages, rejectionMessage],
          updatedAt: Date.now(),
        })
      }
      return next
    })
  }, [])

  const openChatWindow = useCallback((conversationId: ConversationId) => {
    let prevId: ConversationId | null = null

    setChatWindowState((prev) => {
      prevId = prev.activeConversationId
      return {
        ...prev,
        isOpen: true,
        isHistoryOpen: false,
        previousConversationId: null,
        activeConversationId: conversationId,
      }
    })

    if (prevId && prevId !== conversationId) {
      setConversations((currentConversations) => {
        const prevConversation = currentConversations.get(prevId!)
        if (prevConversation && prevConversation.messages.length === 0) {
          const next = new Map(currentConversations)
          next.delete(prevId!)
          return next
        }
        return currentConversations
      })
    }
  }, [])

  const closeChatWindow = useCallback(() => {
    setChatWindowState((prev) => ({
      ...prev,
      isOpen: false,
      // Keep activeConversationId so conversation persists after closing
    }))
  }, [])

  const openOrCreateBlankChatWindow = useCallback(() => {
    if (chatWindowState.activeConversationId) {
      const existingConv = conversations.get(
        chatWindowState.activeConversationId,
      )
      if (existingConv) {
        openChatWindow(chatWindowState.activeConversationId)
        return
      }
    }

    const allConversations = Array.from(conversations.values())
    if (allConversations.length > 0) {
      const latestConversation = allConversations.reduce((latest, conv) =>
        conv.updatedAt > latest.updatedAt ? conv : latest,
      )
      openChatWindow(latestConversation.id)
      return
    }

    const blankConversation = createConversation({})
    openChatWindow(blankConversation.id)
  }, [
    chatWindowState.activeConversationId,
    conversations,
    openChatWindow,
    createConversation,
  ])

  const openBlankChatWindow = useCallback(() => {
    const blankConversation = createConversation({})
    openChatWindow(blankConversation.id)
  }, [createConversation, openChatWindow])

  const openHistoryView = useCallback(() => {
    setChatWindowState((prev) => ({
      ...prev,
      isHistoryOpen: true,
      previousConversationId: prev.activeConversationId,
    }))
  }, [])

  const closeHistoryView = useCallback(() => {
    setChatWindowState((prev) => ({
      ...prev,
      isHistoryOpen: false,
      activeConversationId:
        prev.previousConversationId ?? prev.activeConversationId,
    }))
  }, [])

  const deleteConversation = useCallback((conversationId: ConversationId) => {
    setConversations((prev) => {
      const next = new Map(prev)
      next.delete(conversationId)
      return next
    })

    setChatWindowState((prev) => {
      const updates: Partial<ChatWindowState> = {}
      if (prev.activeConversationId === conversationId) {
        updates.activeConversationId = null
      }
      if (prev.previousConversationId === conversationId) {
        updates.previousConversationId = null
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev
    })
  }, [])

  const {
    editorRef,
    buffers,
    activeBuffer,
    setActiveBuffer,
    addBuffer,
    closeDiffBufferForConversation,
    applyAISQLChange,
  } = useEditor()

  const applyChangesToActiveTab = useCallback(
    (
      conversationId: ConversationId,
      normalizedSQL: string,
      messageId: string,
    ): void => {
      const conversation = conversations.get(conversationId)
      if (!conversation) return

      const result = applyAISQLChange({
        newSQL: normalizedSQL,
        queryKey: conversation.queryKey ?? undefined,
      })

      if (!result.success) {
        return
      }

      updateConversationAssociations(conversationId, {
        queryKey: result.finalQueryKey ?? conversation.queryKey,
      })

      // Update SQL and mark as accepted
      updateConversationSQL(conversationId, normalizedSQL)
      acceptConversationChanges(conversationId, messageId)

      if (conversation.tableId != null) {
        setConversations((prev) => {
          const next = new Map(prev)
          const conv = next.get(conversationId)
          if (conv) {
            next.set(conversationId, {
              ...conv,
              tableId: undefined,
            })
          }
          return next
        })
      }
    },
    [
      conversations,
      applyAISQLChange,
      updateConversationAssociations,
      updateConversationSQL,
      acceptConversationChanges,
    ],
  )

  // Helper: Apply changes to new tab (when original is deleted/archived or no buffer)
  const applyChangesToNewTab = useCallback(
    async (
      conversationId: ConversationId,
      normalizedSQL: string,
      messageId: string,
    ): Promise<void> => {
      const sqlWithSemicolon = normalizeSql(normalizedSQL)
      const newBuffer = await addBuffer({
        value: sqlWithSemicolon,
      })

      await new Promise((resolve) => setTimeout(resolve, 200))

      if (!editorRef.current) return

      const model = editorRef.current.getModel()
      if (!model) return

      const queryStartOffset = 0
      const normalizedQuery = normalizeQueryText(normalizedSQL)
      const queryEndOffset = normalizedQuery.length

      const startPosition = model.getPositionAt(queryStartOffset)
      const endPosition = model.getPositionAt(queryEndOffset)

      // Apply highlighting decoration
      const highlightRange = {
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      }

      const decorationId = model.deltaDecorations(
        [],
        [
          {
            range: highlightRange,
            options: {
              isWholeLine: false,
              className: "aiQueryHighlight",
            },
          },
        ],
      )

      editorRef.current.revealPositionNearTop(startPosition)

      setTimeout(() => {
        model.deltaDecorations(decorationId, [])
      }, 2000)

      const newQueryKey = createQueryKey(normalizedQuery, queryStartOffset)
      updateConversationAssociations(conversationId, {
        bufferId: newBuffer.id,
        queryKey: newQueryKey,
      })

      updateConversationSQL(conversationId, normalizedSQL)
      acceptConversationChanges(conversationId, messageId)

      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(conversationId)
        if (conv && conv.tableId != null) {
          next.set(conversationId, {
            ...conv,
            tableId: undefined,
          })
        }
        return next
      })
    },
    [
      addBuffer,
      editorRef,
      updateConversationAssociations,
      updateConversationSQL,
      acceptConversationChanges,
    ],
  )

  const acceptSuggestion = useCallback(
    async (params: AcceptSuggestionParams): Promise<void> => {
      const { conversationId, messageId } = params
      const conversation = conversations.get(conversationId)
      if (!conversation) return

      const message = conversation.messages.find((m) => m.id === messageId)
      if (!message || !message.sql) return

      const normalizedSQL = normalizeSql(message.sql, false)

      await closeDiffBufferForConversation(conversationId)

      const conversationBufferId = conversation.bufferId
      const buffer = buffers.find((b) => b.id === conversationBufferId)

      const bufferStatus =
        conversationBufferId == null
          ? ("none" as const)
          : !buffer
            ? ("deleted" as const)
            : buffer.archived
              ? ("archived" as const)
              : buffer.id === activeBuffer.id
                ? ("active" as const)
                : ("inactive" as const)

      try {
        if (bufferStatus === "active") {
          applyChangesToActiveTab(conversationId, normalizedSQL, messageId)
        } else if (
          bufferStatus === "deleted" ||
          bufferStatus === "archived" ||
          bufferStatus === "none"
        ) {
          await applyChangesToNewTab(conversationId, normalizedSQL, messageId)
        } else if (bufferStatus === "inactive" && buffer) {
          await setActiveBuffer(buffer)
          await new Promise((resolve) => setTimeout(resolve, 100))
          applyChangesToActiveTab(conversationId, normalizedSQL, messageId)
        }

        addMessage(conversationId, {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: `User accepted your SQL change. Now the query is:\n\n\`\`\`sql\n${normalizedSQL}\n\`\`\``,
          timestamp: Date.now(),
          hideFromUI: true,
        })
      } catch (error) {
        console.error("Error applying changes:", error)
      }
    },
    [
      conversations,
      buffers,
      activeBuffer,
      setActiveBuffer,
      closeDiffBufferForConversation,
      applyChangesToActiveTab,
      applyChangesToNewTab,
      addMessage,
    ],
  )

  // Unified reject function
  const rejectSuggestion = useCallback(
    async (conversationId: ConversationId): Promise<void> => {
      const conversation = conversations.get(conversationId)
      if (!conversation) return

      // Update conversation state (marks as rejected, adds hidden message)
      rejectLatestChange(conversationId)

      // Close any open diff buffer
      await closeDiffBufferForConversation(conversationId)

      // If we're currently viewing a diff buffer, switch back to original
      if (activeBuffer.isDiffBuffer) {
        const originalBuffer = buffers.find(
          (b) => b.id === conversation.bufferId && !b.archived,
        )
        if (originalBuffer) {
          await setActiveBuffer(originalBuffer)
        }
      }
    },
    [
      conversations,
      rejectLatestChange,
      closeDiffBufferForConversation,
      activeBuffer,
      buffers,
      setActiveBuffer,
    ],
  )

  return (
    <AIConversationContext.Provider
      value={{
        conversations,
        chatWindowState,
        getConversation,
        findConversationByQuery,
        findConversationByTableId,
        hasConversationForQuery,
        createConversation,
        getOrCreateConversationForQuery,
        shiftQueryKeysForBuffer,
        openChatWindow,
        openOrCreateBlankChatWindow,
        openBlankChatWindow,
        closeChatWindow,
        openHistoryView,
        closeHistoryView,
        deleteConversation,
        addMessage,
        updateMessage,
        replaceConversationMessages,
        updateConversationName,
        acceptSuggestion,
        rejectSuggestion,
      }}
    >
      {children}
    </AIConversationContext.Provider>
  )
}
