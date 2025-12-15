import React, { createContext, useContext, useState, useCallback } from "react"
import type {
  AIConversation,
  ConversationMessage,
  ChatWindowState,
  SchemaDisplayData,
} from "./types"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import { normalizeQueryText } from "../../scenes/Editor/Monaco/utils"

type AIConversationContextType = {
  conversations: Map<QueryKey, AIConversation>
  chatWindowState: ChatWindowState
  openChatWindow: (queryKey: QueryKey) => void
  closeChatWindow: () => void
  getConversation: (queryKey: QueryKey) => AIConversation | undefined
  getOrCreateConversation: (options: {
    queryKey: QueryKey
    bufferId?: number | string
    originalQuery?: string
    initialSQL?: string
    initialExplanation?: string
    queryStartOffset?: number
    queryEndOffset?: number
    schemaData?: SchemaDisplayData
  }) => AIConversation
  addMessage: (queryKey: QueryKey, message: ConversationMessage) => void
  updateConversationSQL: (
    queryKey: QueryKey,
    sql: string,
    explanation: string,
  ) => void
  addMessageAndUpdateSQL: (
    queryKey: QueryKey,
    message: ConversationMessage,
    sql: string,
    explanation: string,
  ) => void
  updateConversationQueryKey: (
    oldQueryKey: QueryKey,
    newQueryKey: QueryKey,
  ) => void
  updateConversationBufferId: (
    queryKey: QueryKey,
    bufferId: number | string | undefined,
  ) => void
  updateConversationName: (queryKey: QueryKey, name: string) => void
  updateConversationOffsets: (
    queryKey: QueryKey,
    queryStartOffset: number,
    queryEndOffset: number,
  ) => void
  acceptConversationChanges: (
    queryKey: QueryKey,
    upToMessageIndex?: number,
  ) => void
  rejectLatestChange: (queryKey: QueryKey) => void
  markLatestAsRejectedWithFollowUp: (queryKey: QueryKey) => void
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
    Map<QueryKey, AIConversation>
  >(new Map())
  const [chatWindowState, setChatWindowState] = useState<ChatWindowState>({
    isOpen: false,
    activeQueryKey: null,
  })

  const getConversation = useCallback(
    (queryKey: QueryKey): AIConversation | undefined => {
      return conversations.get(queryKey)
    },
    [conversations],
  )

  const getOrCreateConversation = useCallback(
    (options: {
      queryKey: QueryKey
      bufferId?: number | string
      originalQuery?: string
      initialSQL?: string
      initialExplanation?: string
      queryStartOffset?: number
      queryEndOffset?: number
      schemaData?: SchemaDisplayData
    }): AIConversation => {
      const existing = conversations.get(options.queryKey)
      if (existing) {
        return existing
      }

      const initialSQL = options.initialSQL || ""
      const conversation: AIConversation = {
        queryKey: options.queryKey,
        bufferId: options.bufferId,
        originalQuery: options.originalQuery,
        initialSQL,
        currentSQL: initialSQL,
        currentExplanation: options.initialExplanation || "",
        acceptedSQL: initialSQL, // Initially equals initialSQL
        acceptedAt: Date.now(),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        hasPendingDiff: false,
        queryStartOffset: options.queryStartOffset,
        queryEndOffset: options.queryEndOffset,
        schemaData: options.schemaData,
      }

      setConversations((prev) => {
        const next = new Map(prev)
        next.set(options.queryKey, conversation)
        return next
      })

      return conversation
    },
    [conversations],
  )

  const addMessage = useCallback(
    (queryKey: QueryKey, message: ConversationMessage) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          // If adding a visible user message (follow-up), mark all previous assistant messages as non-rejectable
          // Hidden messages (context messages) should not affect rejectability
          const shouldMarkAsNonRejectable =
            message.role === "user" && !message.hideFromUI
          const updatedMessages = shouldMarkAsNonRejectable
            ? conv.messages.map((msg) => {
                if (msg.role === "assistant" && msg.isRejectable) {
                  return { ...msg, isRejectable: false }
                }
                return msg
              })
            : conv.messages

          next.set(queryKey, {
            ...conv,
            messages: [...updatedMessages, message],
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationSQL = useCallback(
    (queryKey: QueryKey, sql: string, explanation: string) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          next.set(queryKey, {
            ...conv,
            currentSQL: sql,
            currentExplanation: explanation,
            // Also update acceptedSQL since this is called when user explicitly applies SQL to editor
            // This ensures future diffs show correct "original" (what's in editor)
            acceptedSQL: sql,
            acceptedAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const addMessageAndUpdateSQL = useCallback(
    (
      queryKey: QueryKey,
      message: ConversationMessage,
      sql: string,
      explanation: string,
    ) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          // Track previous SQL only if this message contains SQL changes
          // (message.sql will be undefined if no SQL change, due to conditional spreading)
          const hasSQLChange = message.sql !== undefined

          // Check if the SQL actually changed from what's accepted in the editor
          // Normalize both for comparison to avoid whitespace/formatting differences
          const normalizedNewSQL = hasSQLChange ? normalizeQueryText(sql) : ""
          const normalizedAcceptedSQL = conv.acceptedSQL
            ? normalizeQueryText(conv.acceptedSQL)
            : ""
          const sqlActuallyChanged =
            hasSQLChange && normalizedNewSQL !== normalizedAcceptedSQL

          // Use acceptedSQL as previousSQL for diff display
          // This ensures the diff shows "what's in editor" vs "what model suggests"
          // rather than "previous suggestion" vs "new suggestion"
          const previousSQL = sqlActuallyChanged ? conv.acceptedSQL : undefined

          // Mark previous assistant messages as non-rejectable if this is a new SQL change
          const updatedMessages = conv.messages.map((msg) => {
            if (
              msg.role === "assistant" &&
              msg.isRejectable &&
              sqlActuallyChanged
            ) {
              return { ...msg, isRejectable: false }
            }
            return msg
          })

          // Add new message with previousSQL and isRejectable flag (only if SQL actually changed)
          const messageWithHistory: ConversationMessage = {
            ...message,
            previousSQL,
            isRejectable: sqlActuallyChanged,
          }

          next.set(queryKey, {
            ...conv,
            messages: [...updatedMessages, messageWithHistory],
            // Only update currentSQL if there's an actual SQL change
            currentSQL: hasSQLChange ? sql : conv.currentSQL,
            currentExplanation: explanation,
            updatedAt: Date.now(),
            // Set pending diff only if SQL actually changed from acceptedSQL
            hasPendingDiff: sqlActuallyChanged ? true : conv.hasPendingDiff,
            // Clear schemaData when conversation transitions to having SQL (schema→query)
            ...(hasSQLChange ? { schemaData: undefined } : {}),
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationQueryKey = useCallback(
    (oldQueryKey: QueryKey, newQueryKey: QueryKey) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(oldQueryKey)
        if (conv) {
          // Remove old key
          next.delete(oldQueryKey)
          // Add with new key
          next.set(newQueryKey, {
            ...conv,
            queryKey: newQueryKey,
            updatedAt: Date.now(),
          })

          // Update chat window if it's showing this conversation
          setChatWindowState((prevState) => {
            if (prevState.activeQueryKey === oldQueryKey) {
              return {
                ...prevState,
                activeQueryKey: newQueryKey,
              }
            }
            return prevState
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationBufferId = useCallback(
    (queryKey: QueryKey, bufferId: number | string | undefined) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          next.set(queryKey, {
            ...conv,
            bufferId,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const updateConversationName = useCallback(
    (queryKey: QueryKey, name: string) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          next.set(queryKey, {
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

  const updateConversationOffsets = useCallback(
    (queryKey: QueryKey, queryStartOffset: number, queryEndOffset: number) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          next.set(queryKey, {
            ...conv,
            queryStartOffset,
            queryEndOffset,
            updatedAt: Date.now(),
          })
        }
        return next
      })
    },
    [],
  )

  const acceptConversationChanges = useCallback(
    (queryKey: QueryKey, upToMessageIndex?: number) => {
      setConversations((prev) => {
        const next = new Map(prev)
        const conv = next.get(queryKey)
        if (conv) {
          // Determine which SQL to accept
          let sqlToAccept = conv.currentSQL
          if (
            upToMessageIndex !== undefined &&
            upToMessageIndex >= 0 &&
            upToMessageIndex < conv.messages.length
          ) {
            // Find the SQL from the message at this index
            const targetMessage = conv.messages[upToMessageIndex]
            sqlToAccept = targetMessage.sql || conv.currentSQL
          }

          // Mark messages up to the accepted index as non-rejectable and accepted
          const updatedMessages = conv.messages.map((msg, idx) => {
            if (msg.role === "assistant" && msg.sql) {
              // If upToMessageIndex is specified, mark up to that index as accepted
              // Otherwise, mark the latest message with SQL as accepted
              if (upToMessageIndex !== undefined) {
                if (idx <= upToMessageIndex) {
                  return { ...msg, isRejectable: false, isAccepted: true }
                }
              } else {
                // No specific index - mark latest SQL message as accepted
                // Find the latest assistant message with SQL
                const lastSQLIndex = conv.messages.reduce(
                  (lastIdx, m, i) =>
                    m.role === "assistant" && m.sql ? i : lastIdx,
                  -1,
                )
                if (idx === lastSQLIndex) {
                  return { ...msg, isRejectable: false, isAccepted: true }
                }
              }
            }
            return msg
          })

          next.set(queryKey, {
            ...conv,
            acceptedSQL: sqlToAccept,
            acceptedAt: Date.now(),
            messages: updatedMessages,
            updatedAt: Date.now(),
            hasPendingDiff: false,
          })
        }
        return next
      })
    },
    [],
  )

  const rejectLatestChange = useCallback((queryKey: QueryKey) => {
    setConversations((prev) => {
      const next = new Map(prev)
      const conv = next.get(queryKey)
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
          // No change to reject
          return next
        }

        const latestMessage = conv.messages[latestAssistantIndex]
        if (!latestMessage) {
          return next
        }

        // Revert currentSQL to previous SQL
        const revertedSQL =
          typeof latestMessage.previousSQL === "string"
            ? latestMessage.previousSQL
            : conv.acceptedSQL

        // Mark latest message as rejected and non-rejectable
        const updatedMessages = conv.messages.map((msg, idx) => {
          if (idx === latestAssistantIndex) {
            return { ...msg, isRejectable: false, isRejected: true }
          }
          return msg
        })

        // Add user message about rejection so model is aware in future conversations
        // Hide from UI but include in conversation history for API calls
        const rejectionMessage: ConversationMessage = {
          role: "user",
          content: `User rejected your latest change. Please use the previous version as the base for future modifications.`,
          timestamp: Date.now(),
          hideFromUI: true,
        }

        next.set(queryKey, {
          ...conv,
          currentSQL: revertedSQL,
          messages: [...updatedMessages, rejectionMessage],
          updatedAt: Date.now(),
          hasPendingDiff: false,
        })
      }
      return next
    })
  }, [])

  const markLatestAsRejectedWithFollowUp = useCallback((queryKey: QueryKey) => {
    setConversations((prev) => {
      const next = new Map(prev)
      const conv = next.get(queryKey)
      if (conv) {
        // Find the latest assistant message with SQL change that is rejectable
        let latestAssistantIndex = -1
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          if (
            conv.messages[i].role === "assistant" &&
            conv.messages[i].sql &&
            conv.messages[i].isRejectable
          ) {
            latestAssistantIndex = i
            break
          }
        }

        if (latestAssistantIndex === -1) {
          // No rejectable change found
          return next
        }

        // Mark latest message as rejected with follow-up (not just rejected)
        // Note: We do NOT revert currentSQL here because:
        // 1. User may have applied a different suggestion via "Apply to Editor"
        // 2. The diff view uses message.previousSQL, not conv.currentSQL
        // 3. addMessageAndUpdateSQL will correctly capture currentSQL as previousSQL for the next suggestion
        const updatedMessages = conv.messages.map((msg, idx) => {
          if (idx === latestAssistantIndex) {
            return { ...msg, isRejectable: false, isRejectedWithFollowUp: true }
          }
          return msg
        })

        next.set(queryKey, {
          ...conv,
          messages: updatedMessages,
          updatedAt: Date.now(),
          hasPendingDiff: false,
        })
      }
      return next
    })
  }, [])

  const openChatWindow = useCallback((queryKey: QueryKey) => {
    setChatWindowState({
      isOpen: true,
      activeQueryKey: queryKey,
    })
  }, [])

  const closeChatWindow = useCallback(() => {
    setChatWindowState((prev) => ({
      ...prev,
      isOpen: false,
      // Keep activeQueryKey so conversation persists after closing
    }))
  }, [])

  return (
    <AIConversationContext.Provider
      value={{
        conversations,
        chatWindowState,
        openChatWindow,
        closeChatWindow,
        getConversation,
        getOrCreateConversation,
        addMessage,
        updateConversationSQL,
        addMessageAndUpdateSQL,
        updateConversationQueryKey,
        updateConversationBufferId,
        updateConversationName,
        updateConversationOffsets,
        acceptConversationChanges,
        rejectLatestChange,
        markLatestAsRejectedWithFollowUp,
      }}
    >
      {children}
    </AIConversationContext.Provider>
  )
}
