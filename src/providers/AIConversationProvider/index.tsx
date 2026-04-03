import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  db,
  type ConversationMeta,
  type ConversationMetaWithStatus,
} from "../../store/db"
import { aiConversationStore } from "../../store/aiConversations"
import { actions, selectors } from "../../store"
import type {
  ConversationMessage,
  ChatWindowState,
  ConversationId,
  AIConversation,
} from "./types"
import type { QueryKey } from "../../scenes/Editor/Monaco/utils"
import {
  normalizeQueryText,
  createQueryKey,
  createDetachedQueryKey,
  getQueryInfoFromKey,
  shiftQueryKey,
} from "../../scenes/Editor/Monaco/utils"
import { useEditor } from "../EditorProvider"
import { normalizeSql } from "../../utils/aiAssistant"
import { useDispatch, useSelector } from "react-redux"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { projectConversationTurns } from "../../utils/ai/turnView"

export type AcceptSuggestionParams = {
  conversationId: ConversationId
  messageId: string
  skipDefaultMessage?: boolean
}

type AIConversationContextType = {
  conversationMetas: Map<ConversationId, ConversationMetaWithStatus>
  activeConversationMessages: ConversationMessage[]
  chatWindowState: ChatWindowState
  isLoadingMessages: boolean
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  scrollToMessageId: string | null
  setScrollToMessageId: (messageId: string | null) => void

  getConversationMeta: (
    id: ConversationId,
  ) => ConversationMetaWithStatus | undefined
  findConversationByQuery: (
    bufferId: number,
    queryKey: QueryKey,
  ) => ConversationMetaWithStatus | undefined
  findConversationByTableId: (
    tableId: number,
  ) => ConversationMetaWithStatus | undefined
  findQueryByConversationId: (
    conversationId: ConversationId,
  ) => { queryKey: QueryKey; bufferId: number } | null
  hasConversationForQuery: (bufferId: number, queryKey: QueryKey) => boolean

  createConversation: (options: {
    bufferId?: number
    queryKey?: QueryKey
    tableId?: number
  }) => Promise<AIConversation>
  handleGlyphClick: (options: {
    bufferId: number
    queryKey: QueryKey
  }) => Promise<void>
  shiftQueryKeysForBuffer: (
    bufferId: string | number,
    changeOffset: number,
    delta: number,
  ) => Promise<boolean>

  openChatWindow: (
    conversationId: ConversationId,
    options?: { loadMessages?: boolean },
  ) => Promise<void>
  openOrCreateBlankChatWindow: () => Promise<void>
  openBlankChatWindow: () => Promise<void>
  closeChatWindow: () => void
  openHistoryView: () => void
  closeHistoryView: () => void
  deleteConversation: (conversationId: ConversationId) => Promise<void>

  addMessage: (
    message: Omit<ConversationMessage, "id"> & { id?: string },
    messageIdsToRemove?: string[],
  ) => void
  removeMessages: (messageIdsToRemove: string[]) => void
  updateMessage: (
    conversationId: ConversationId,
    messageId: string,
    updates: Partial<ConversationMessage>,
  ) => void
  replaceConversationMessages: (newMessages: Array<ConversationMessage>) => void
  updateConversationName: (
    conversationId: ConversationId,
    name: string,
    isGeneratedByAI?: boolean,
  ) => Promise<void>

  acceptSuggestion: (params: AcceptSuggestionParams) => Promise<void>
  rejectSuggestion: (
    conversationId: ConversationId,
    messageId: string,
  ) => Promise<void>
  persistMessages: (conversationId: ConversationId) => Promise<void>
  getLastRoundMessages: (conversationId: ConversationId) => Promise<{
    lastUserMessage?: ConversationMessage
    lastAssistantMessage?: ConversationMessage
  }>
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
  const dispatch = useDispatch()
  const activeSidebar = useSelector(selectors.console.getActiveSidebar)
  const conversationMetasArray = useLiveQuery(
    async () => {
      const metas: ConversationMeta[] = await db.ai_conversations.toArray()
      const metasWithStatus: ConversationMetaWithStatus[] = []
      for (const meta of metas) {
        const hasMessages = await db.ai_conversation_messages
          .where("conversationId")
          .equals(meta.id)
          .count()
        metasWithStatus.push({
          ...meta,
          hasMessages: hasMessages > 0,
        })
      }
      return metasWithStatus
    },
    [],
    null,
  )

  const conversationMetas = useMemo(
    () => new Map(conversationMetasArray?.map((m) => [m.id, m]) ?? []),
    [conversationMetasArray],
  )

  const [activeConversationMessages, setActiveConversationMessages] = useState<
    ConversationMessage[]
  >([])

  const activeConversationMessagesRef = useRef<ConversationMessage[]>([])
  useEffect(() => {
    activeConversationMessagesRef.current = activeConversationMessages
  }, [activeConversationMessages])
  const renamedChatsRef = useRef<Set<ConversationId>>(new Set())

  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(
    null,
  )

  const [chatWindowState, setChatWindowState] = useState<ChatWindowState>({
    activeConversationId: null,
    isHistoryOpen: false,
    previousConversationId: null,
  })

  const activeConversationId = chatWindowState.activeConversationId

  const activeConversationIdRef = useRef(activeConversationId)
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  const isOpeningChatWindowRef = useRef(false)

  const persistMessages = useCallback(
    async (conversationId: ConversationId, updateTimestamp: boolean = true) => {
      if (conversationId !== activeConversationIdRef.current) {
        return
      }
      await aiConversationStore.saveMessages(
        conversationId,
        activeConversationMessagesRef.current,
      )
      if (updateTimestamp) {
        await aiConversationStore.updateMeta(conversationId, {
          updatedAt: Date.now(),
        })
      }
    },
    [],
  )

  const getLastRoundMessages = useCallback(
    async (
      conversationId: ConversationId,
    ): Promise<{
      lastUserMessage?: ConversationMessage
      lastAssistantMessage?: ConversationMessage
    }> => {
      const messages = await aiConversationStore.getMessages(conversationId)
      const { visibleEntries, previousVisibleUserByAnchorIndex } =
        projectConversationTurns(messages)
      const lastEntry = visibleEntries.at(-1)
      const lastAssistantMessage =
        lastEntry?.type === "assistantTurn"
          ? lastEntry.anchorMessage
          : undefined

      let lastUserMessage: ConversationMessage | undefined
      if (lastEntry?.type === "assistantTurn") {
        lastUserMessage = previousVisibleUserByAnchorIndex.get(
          lastEntry.anchorIndex,
        )
      } else if (lastEntry?.type === "user") {
        lastUserMessage = lastEntry.message
      }

      return {
        lastUserMessage,
        lastAssistantMessage,
      }
    },
    [],
  )

  const getConversationMeta = useCallback(
    (id: ConversationId): ConversationMetaWithStatus | undefined => {
      return conversationMetas.get(id)
    },
    [conversationMetas],
  )

  const findConversationByQuery = useCallback(
    (
      bufferId: string | number,
      queryKey: QueryKey,
    ): ConversationMetaWithStatus | undefined => {
      for (const meta of conversationMetas.values()) {
        if (meta.bufferId === bufferId && meta.queryKey === queryKey) {
          return meta
        }
      }
      return undefined
    },
    [conversationMetas],
  )

  const findConversationByTableId = useCallback(
    (tableId: number): ConversationMetaWithStatus | undefined => {
      for (const meta of conversationMetas.values()) {
        if (meta.tableId === tableId) {
          return meta
        }
      }
      return undefined
    },
    [conversationMetas],
  )

  const findQueryByConversationId = useCallback(
    (
      conversationId: ConversationId,
    ): { queryKey: QueryKey; bufferId: number } | null => {
      const meta = conversationMetas.get(conversationId)
      if (!meta) return null
      if (!meta.queryKey || !meta.bufferId) return null
      return { queryKey: meta.queryKey, bufferId: meta.bufferId }
    },
    [conversationMetas],
  )

  const hasConversationForQuery = useCallback(
    (bufferId: string | number, queryKey: QueryKey): boolean => {
      const meta = findConversationByQuery(bufferId, queryKey)
      if (!meta) return false
      return (
        meta.hasMessages ||
        (chatWindowState.activeConversationId === meta.id &&
          activeConversationMessagesRef.current.length > 0)
      )
    },
    [findConversationByQuery, activeConversationId],
  )

  const createConversation = useCallback(
    async (options: {
      bufferId?: number
      queryKey?: QueryKey
      tableId?: number
    }): Promise<AIConversation> => {
      const id = crypto.randomUUID()
      const { queryText } = getQueryInfoFromKey(options.queryKey)
      const meta: ConversationMeta = {
        id,
        queryKey: options.queryKey,
        bufferId: options.bufferId,
        tableId: options.tableId,
        currentSQL: queryText,
        conversationName: "AI Assistant",
        updatedAt: Date.now(),
      }

      await aiConversationStore.saveMeta(meta)

      return { ...meta, messages: [] }
    },
    [],
  )

  const acceptSuggestionChanges = useCallback(
    async (
      conversationId: ConversationId,
      messageId: string,
      updates: {
        bufferId?: number
        queryKey: QueryKey
        currentSQL: string
      },
    ): Promise<void> => {
      await aiConversationStore.updateMeta(conversationId, {
        ...updates,
        updatedAt: Date.now(),
      })

      setActiveConversationMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isAccepted: true } : msg,
        ),
      )
    },
    [],
  )

  const shiftQueryKeysForBuffer = useCallback(
    async (
      bufferId: string | number,
      changeOffset: number,
      delta: number,
    ): Promise<boolean> => {
      let shiftedQueryKeys = false
      const conversationsToShift: Record<string, QueryKey> = {}
      for (const [id, meta] of conversationMetas) {
        if (meta.bufferId === bufferId && meta.queryKey) {
          const { startOffset } = getQueryInfoFromKey(meta.queryKey)
          if (startOffset >= changeOffset) {
            const newQueryKey = shiftQueryKey(
              meta.queryKey,
              changeOffset,
              delta,
            )
            conversationsToShift[id] = newQueryKey
            shiftedQueryKeys = true
          }
        }
      }

      if (shiftedQueryKeys) {
        await db.transaction("rw", db.ai_conversations, async () => {
          for (const [id, queryKey] of Object.entries(conversationsToShift)) {
            await db.ai_conversations.update(id, { queryKey })
          }
        })
      }

      return shiftedQueryKeys
    },
    [conversationMetas],
  )

  const addMessage = useCallback(
    (
      message: Omit<ConversationMessage, "id"> & { id?: string },
      messageIdsToRemove?: string[],
    ) => {
      const messageWithId: ConversationMessage = {
        ...message,
        id: message.id || crypto.randomUUID(),
      }
      setActiveConversationMessages((prev) => {
        let newMessages = [...prev]
        if (messageIdsToRemove) {
          newMessages = newMessages.filter(
            (msg) => !messageIdsToRemove.includes(msg.id),
          )
        }
        newMessages.push(messageWithId)
        return newMessages
      })
    },
    [],
  )

  const removeMessages = useCallback((messageIdsToRemove: string[]) => {
    if (messageIdsToRemove.length === 0) return
    setActiveConversationMessages((prev) =>
      prev.filter((message) => !messageIdsToRemove.includes(message.id)),
    )
  }, [])

  const updateMessage = useCallback(
    (
      conversationId: ConversationId,
      messageId: string,
      updates: Partial<ConversationMessage>,
    ) => {
      const meta = conversationMetas.get(conversationId)

      setActiveConversationMessages((prev) => {
        let hasSQLChange = false
        const updatedMessages = prev.map((msg) => {
          if (msg.id !== messageId) return msg

          let finalUpdates = updates
          const newSql = updates.sql

          if (
            newSql !== undefined &&
            msg.previousSQL === undefined &&
            updates.previousSQL === undefined &&
            meta
          ) {
            const { queryText: acceptedSQL } = getQueryInfoFromKey(
              meta.queryKey,
            )
            const normalizedNewSQL = normalizeQueryText(newSql || "")
            const normalizedAcceptedSQL = normalizeQueryText(acceptedSQL)
            const sqlActuallyChanged =
              normalizedNewSQL !== normalizedAcceptedSQL

            if (sqlActuallyChanged) {
              hasSQLChange = true
            }

            finalUpdates = {
              ...finalUpdates,
              previousSQL: acceptedSQL,
            }
          }

          return { ...msg, ...finalUpdates }
        })

        if (hasSQLChange && updates.sql) {
          void aiConversationStore.updateMeta(conversationId, {
            currentSQL: updates.sql,
            updatedAt: Date.now(),
          })
        }

        return updatedMessages
      })
    },
    [conversationMetas],
  )

  const replaceConversationMessages = useCallback(
    (newMessages: Array<ConversationMessage>) => {
      setActiveConversationMessages((prev) => {
        const conversationMessages = [...prev]
        let lastReplaceIndex = -1
        for (const message of newMessages) {
          const index = conversationMessages.findIndex(
            (m) => m.id === message.id,
          )
          if (index !== -1) {
            lastReplaceIndex = Math.max(lastReplaceIndex, index)
            conversationMessages[index] = message
          }
        }
        conversationMessages.splice(
          lastReplaceIndex + 1,
          0,
          newMessages[newMessages.length - 1],
        )
        return conversationMessages
      })
    },
    [],
  )

  const updateConversationName = useCallback(
    async (
      conversationId: ConversationId,
      name: string,
      isGeneratedByAI?: boolean,
    ) => {
      if (isGeneratedByAI && renamedChatsRef.current.has(conversationId)) {
        return
      }
      renamedChatsRef.current.add(conversationId)
      await aiConversationStore.updateMeta(conversationId, {
        conversationName: name,
      })
    },
    [],
  )

  const rejectLatestChange = useCallback(
    async (conversationId: ConversationId, messageId: string) => {
      if (activeConversationId !== conversationId) return

      const meta = conversationMetas.get(conversationId)
      if (!meta) return

      const latestMessage = activeConversationMessages.find(
        (m) => m.id === messageId,
      )
      if (!latestMessage || !latestMessage.sql) return

      const { queryText: acceptedSQL } = getQueryInfoFromKey(meta.queryKey)
      const revertedSQL =
        typeof latestMessage.previousSQL === "string"
          ? latestMessage.previousSQL
          : acceptedSQL

      await aiConversationStore.updateMeta(conversationId, {
        currentSQL: revertedSQL,
        updatedAt: Date.now(),
      })

      const rejectionMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: `User rejected your latest change. Please use the previous version as the base for future modifications.`,
        timestamp: Date.now(),
        hideFromUI: true,
      }

      setActiveConversationMessages((prev) => {
        const updatedMessages = prev.map((msg) => {
          if (msg.id === messageId) {
            return { ...msg, isRejected: true }
          }
          return msg
        })
        return [...updatedMessages, rejectionMessage]
      })
    },
    [activeConversationId, conversationMetas, activeConversationMessages],
  )

  const openChatWindow = useCallback(
    async (
      conversationId: ConversationId,
      options?: { loadMessages?: boolean },
    ) => {
      const loadMessages = options?.loadMessages ?? true

      if (isOpeningChatWindowRef.current) return
      isOpeningChatWindowRef.current = true

      try {
        const prevId = chatWindowState.activeConversationId

        if (prevId && prevId !== conversationId) {
          const prevMeta = conversationMetas.get(prevId)
          if (prevMeta && activeConversationMessages.length === 0) {
            await aiConversationStore.deleteConversation(prevId)
          } else {
            await persistMessages(prevId, false)
          }
        } else if (
          prevId === conversationId &&
          !chatWindowState.isHistoryOpen &&
          activeSidebar?.type === "aiChat"
        ) {
          return
        }

        if (!activeConversationId) {
          setActiveConversationMessages([])
        }

        if (loadMessages && conversationId !== prevId) {
          setIsLoadingMessages(true)
          const msgs = await aiConversationStore.getMessages(conversationId)
          setActiveConversationMessages(msgs)
          setIsLoadingMessages(false)
        } else if (!loadMessages) {
          setActiveConversationMessages([])
        }

        setChatWindowState((prev) => ({
          ...prev,
          isHistoryOpen: false,
          previousConversationId: null,
          activeConversationId: conversationId,
        }))
        dispatch(actions.console.pushSidebarHistory({ type: "aiChat" }))
        void trackEvent(ConsoleEvent.AI_CHAT_OPEN)
      } finally {
        isOpeningChatWindowRef.current = false
      }
    },
    [
      activeSidebar,
      chatWindowState,
      conversationMetas,
      activeConversationMessages,
      persistMessages,
    ],
  )

  const closeChatWindow = useCallback(() => {
    void trackEvent(ConsoleEvent.AI_CHAT_CLOSE)
    dispatch(actions.console.closeSidebar())
    if (chatWindowState.activeConversationId) {
      if (activeConversationMessages.length === 0) {
        void aiConversationStore.deleteConversation(
          chatWindowState.activeConversationId,
        )
      }
    }
  }, [chatWindowState.activeConversationId, activeConversationMessages])

  const handleGlyphClick = useCallback(
    async (options: {
      bufferId: number
      queryKey: QueryKey
    }): Promise<void> => {
      const existing = findConversationByQuery(
        options.bufferId,
        options.queryKey,
      )
      if (existing) {
        if (activeConversationId === existing.id) {
          if (activeSidebar?.type === "aiChat") {
            closeChatWindow()
            return
          }
        }
        await openChatWindow(existing.id)
        return
      }
      const newConversation = await createConversation({
        bufferId: options.bufferId,
        queryKey: options.queryKey,
      })
      await openChatWindow(newConversation.id)
    },
    [
      closeChatWindow,
      findConversationByQuery,
      createConversation,
      activeConversationId,
      activeSidebar,
    ],
  )

  const openOrCreateBlankChatWindow = useCallback(async () => {
    if (chatWindowState.activeConversationId) {
      const existingMeta = conversationMetas.get(
        chatWindowState.activeConversationId,
      )
      if (existingMeta) {
        await openChatWindow(chatWindowState.activeConversationId)
        return
      }
    }

    if (conversationMetas.size > 0) {
      const latestMeta = Array.from(conversationMetas.values()).reduce(
        (latest, meta) => (meta.updatedAt > latest.updatedAt ? meta : latest),
      )
      await openChatWindow(latestMeta.id)
      return
    }

    const blankConversation = await createConversation({})
    await openChatWindow(blankConversation.id)
  }, [
    chatWindowState.activeConversationId,
    conversationMetas,
    openChatWindow,
    createConversation,
  ])

  const openBlankChatWindow = useCallback(async () => {
    const blankConversation = await createConversation({})
    await openChatWindow(blankConversation.id, { loadMessages: false })
  }, [createConversation, openChatWindow])

  const openHistoryView = useCallback(() => {
    void trackEvent(ConsoleEvent.AI_HISTORY_OPEN)
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

  const deleteConversation = useCallback(
    async (conversationId: ConversationId) => {
      void trackEvent(ConsoleEvent.AI_CHAT_DELETE)
      await aiConversationStore.deleteConversation(conversationId)

      let fallbackId: ConversationId | null = null
      let latestUpdatedAt = 0
      for (const [id, meta] of conversationMetas) {
        if (id !== conversationId && meta.updatedAt > latestUpdatedAt) {
          latestUpdatedAt = meta.updatedAt
          fallbackId = id
        }
      }

      if (activeConversationId === conversationId) {
        if (fallbackId) {
          const msgs = await aiConversationStore.getMessages(fallbackId)
          setActiveConversationMessages(msgs)
        } else {
          setActiveConversationMessages([])
        }
      }

      setChatWindowState((prev) => {
        const updates: Partial<ChatWindowState> = {}
        if (prev.activeConversationId === conversationId) {
          updates.activeConversationId = fallbackId
        }
        if (prev.previousConversationId === conversationId) {
          updates.previousConversationId = fallbackId
        }
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev
      })
    },
    [activeConversationId, conversationMetas],
  )

  const {
    editorRef,
    buffers,
    activeBuffer,
    setActiveBuffer,
    addBuffer,
    closePreviewBuffer,
    applyAISQLChange,
  } = useEditor()

  const applyChangesToActiveTab = useCallback(
    async (
      conversationId: ConversationId,
      normalizedSQL: string,
      messageId: string,
    ): Promise<void> => {
      const meta = conversationMetas.get(conversationId)
      if (!meta) return

      const result = applyAISQLChange({
        newSQL: normalizedSQL,
        queryKey: meta.queryKey ?? undefined,
      })

      if (!result.success || !result.finalQueryKey) return

      await acceptSuggestionChanges(conversationId, messageId, {
        queryKey: result.finalQueryKey,
        currentSQL: normalizedSQL,
      })

      const detachedQueryKey = createDetachedQueryKey(normalizedSQL)
      dispatch(
        actions.query.updateNotificationKey(
          detachedQueryKey,
          result.finalQueryKey,
          meta.bufferId,
          true,
        ),
      )

      if (meta.tableId != null) {
        await aiConversationStore.updateMeta(conversationId, {
          tableId: undefined,
          updatedAt: Date.now(),
        })
      }
    },
    [conversationMetas, acceptSuggestionChanges],
  )

  const applyChangesToNewTab = useCallback(
    async (
      conversationId: ConversationId,
      normalizedSQL: string,
      messageId: string,
    ): Promise<void> => {
      const meta = conversationMetas.get(conversationId)
      if (!meta) return

      const sqlWithSemicolon = normalizeSql(normalizedSQL)
      const newBuffer = await addBuffer({
        value: sqlWithSemicolon,
      })
      if (!newBuffer) return

      await new Promise((resolve) => setTimeout(resolve, 200))

      if (!editorRef.current) return

      const model = editorRef.current.getModel()
      if (!model) return

      const queryStartOffset = 0
      const normalizedQuery = normalizeQueryText(normalizedSQL)
      const queryEndOffset = normalizedQuery.length

      const startPosition = model.getPositionAt(queryStartOffset)
      const endPosition = model.getPositionAt(queryEndOffset)

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
        if (!model.isDisposed()) {
          model.deltaDecorations(decorationId, [])
        }
      }, 2000)

      const newQueryKey = createQueryKey(normalizedQuery, queryStartOffset)
      await acceptSuggestionChanges(conversationId, messageId, {
        bufferId: newBuffer.id,
        queryKey: newQueryKey,
        currentSQL: normalizedSQL,
      })

      if (newBuffer.id) {
        dispatch(
          actions.query.moveNotificationNamespace(
            meta.bufferId ?? conversationId,
            newBuffer.id,
            newQueryKey,
          ),
        )
      }

      if (meta.tableId != null) {
        await aiConversationStore.updateMeta(conversationId, {
          tableId: undefined,
          updatedAt: Date.now(),
        })
      }
    },
    [conversationMetas, addBuffer, acceptSuggestionChanges],
  )

  const acceptSuggestion = useCallback(
    async (params: AcceptSuggestionParams): Promise<void> => {
      const { conversationId, messageId, skipDefaultMessage } = params

      if (activeConversationId !== conversationId) return

      const meta = conversationMetas.get(conversationId)
      if (!meta) return

      const message = activeConversationMessages.find((m) => m.id === messageId)
      if (!message || !message.sql) return

      const normalizedSQL = normalizeSql(message.sql, false)

      await closePreviewBuffer()

      const conversationBufferId = meta.bufferId
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
          await applyChangesToActiveTab(
            conversationId,
            normalizedSQL,
            messageId,
          )
        } else if (
          bufferStatus === "deleted" ||
          bufferStatus === "archived" ||
          bufferStatus === "none"
        ) {
          await applyChangesToNewTab(conversationId, normalizedSQL, messageId)
        } else if (bufferStatus === "inactive" && buffer) {
          await setActiveBuffer(buffer)
          await new Promise((resolve) => setTimeout(resolve, 100))
          await applyChangesToActiveTab(
            conversationId,
            normalizedSQL,
            messageId,
          )
        }

        if (!skipDefaultMessage) {
          addMessage({
            id: crypto.randomUUID(),
            role: "user" as const,
            content: `User accepted your SQL change. Now the query is:\n\n\`\`\`sql\n${normalizedSQL.replaceAll(/\s+/g, " ").trim()}\n\`\`\``,
            timestamp: Date.now(),
            hideFromUI: true,
          })
        }

        await persistMessages(conversationId)
      } catch (error) {
        console.error("Error applying changes:", error)
      }
    },
    [
      activeConversationId,
      conversationMetas,
      activeConversationMessages,
      buffers,
      activeBuffer.id,
      setActiveBuffer,
      closePreviewBuffer,
      applyChangesToActiveTab,
      applyChangesToNewTab,
      addMessage,
      persistMessages,
    ],
  )

  const rejectSuggestion = useCallback(
    async (
      conversationId: ConversationId,
      messageId: string,
    ): Promise<void> => {
      if (activeConversationId !== conversationId) return

      const meta = conversationMetas.get(conversationId)
      if (!meta) return

      await rejectLatestChange(conversationId, messageId)
      await closePreviewBuffer()

      if (activeBuffer.isPreviewBuffer) {
        const originalBuffer = buffers.find(
          (b) => b.id === meta.bufferId && !b.archived,
        )
        if (originalBuffer) {
          await setActiveBuffer(originalBuffer)
        }
      }

      await persistMessages(conversationId)
    },
    [
      activeConversationId,
      conversationMetas,
      rejectLatestChange,
      closePreviewBuffer,
      activeBuffer,
      buffers,
      setActiveBuffer,
      persistMessages,
    ],
  )

  return (
    <AIConversationContext.Provider
      value={{
        conversationMetas,
        activeConversationMessages,
        chatWindowState,
        isLoadingMessages,
        isStreaming,
        setIsStreaming,
        scrollToMessageId,
        setScrollToMessageId,
        getConversationMeta,
        findConversationByQuery,
        findConversationByTableId,
        hasConversationForQuery,
        findQueryByConversationId,
        createConversation,
        handleGlyphClick,
        shiftQueryKeysForBuffer,
        openChatWindow,
        openOrCreateBlankChatWindow,
        openBlankChatWindow,
        closeChatWindow,
        openHistoryView,
        closeHistoryView,
        deleteConversation,
        addMessage,
        removeMessages,
        updateMessage,
        replaceConversationMessages,
        updateConversationName,
        acceptSuggestion,
        rejectSuggestion,
        persistMessages,
        getLastRoundMessages,
      }}
    >
      {children}
    </AIConversationContext.Provider>
  )
}
