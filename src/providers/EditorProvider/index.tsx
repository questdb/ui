import { loader, type Monaco } from "@monaco-editor/react"
import type { editor, IRange } from "monaco-editor"
import React, {
  createContext,
  MutableRefObject,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react"
import {
  appendQuery,
  clearModelMarkers,
  insertTextAtCursor,
  QuestDBLanguageName,
  QueryKey,
  normalizeQueryText,
  parseQueryKey,
  createQueryKey,
} from "../../scenes/Editor/Monaco/utils"
import { useSchemaCompletionProvider } from "../../scenes/Editor/Monaco/questdb-sql/useSchemaCompletionProvider"
import {
  cloneNotebookViewState,
  nextCopyLabel,
} from "../../scenes/Editor/Notebook/notebookUtils"
import type { ConversationId } from "../AIConversationProvider/types"
import { normalizeSql } from "../../utils/aiAssistant"
import type { Buffer, PreviewContent } from "../../store/buffers"
import type { ExecutionRefs } from "../../scenes/Editor/index"
import {
  bufferStore,
  BufferType,
  fallbackBuffer,
  makeBuffer,
  makeFallbackBuffer,
} from "../../store/buffers"
import { toast } from "../../components/Toast"
import { db } from "../../store/db"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { emitUserAction } from "../../utils/notebookAIBridge"

import { useLiveQuery } from "dexie-react-hooks"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

export const MAX_TABS = 100

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export type PreviewBufferContentDiff = {
  type: "diff"
  original: string
  modified: string
  conversationId?: ConversationId
}

export type PreviewBufferContentCode = {
  type: "code"
  value: string
}

export type PreviewBufferContent =
  | PreviewBufferContentDiff
  | PreviewBufferContentCode

export type ApplyAISQLChangeOptions = {
  newSQL: string
  queryKey?: QueryKey
}

export type ApplyAISQLChangeResult = {
  success: boolean
  finalQueryKey?: QueryKey
  queryStartOffset?: number
}

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string) => void
  tabsDisabled: boolean
  setTabsDisabled: (disabled: boolean) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (
    buffer: Buffer,
    options?: { focus?: boolean; fromSearch?: boolean },
  ) => Promise<void>
  addBuffer: (
    buffer?: Partial<Buffer>,
    options?: { shouldSelectAll?: boolean; afterBufferId?: number },
  ) => Promise<Buffer | undefined>
  deleteBuffer: (id: number, setActiveBuffer?: boolean) => Promise<void>
  archiveBuffer: (id: number) => Promise<void>
  duplicateNotebook: (id: number) => Promise<Buffer | undefined>
  updateBuffer: (
    id: number,
    buffer?: Partial<Buffer>,
    setNewActiveBuffer?: boolean,
  ) => Promise<void>
  updateBuffersPositions: (
    positions: { id: number; position: number }[],
  ) => Promise<void>
  editorReadyTrigger: (editor: IStandaloneCodeEditor) => void
  setTemporaryBuffer: (buffer: Buffer) => Promise<void>
  temporaryBufferId: number | null
  queryParamProcessedRef: MutableRefObject<boolean>
  isNavigatingFromSearchRef: MutableRefObject<boolean>
  showPreviewBuffer: (content: PreviewBufferContent) => Promise<void>
  closePreviewBuffer: () => Promise<void>
  applyAISQLChange: (options: ApplyAISQLChangeOptions) => ApplyAISQLChangeResult
  executionRefs: MutableRefObject<ExecutionRefs>
  cleanupExecutionRefs: (bufferId: number) => void
  highlightQuery: (queryKey: QueryKey, bufferId: number) => Promise<boolean>
}

const defaultValues = {
  editorRef: { current: null },
  monacoRef: { current: null },
  insertTextAtCursor: () => undefined,
  appendQuery: () => undefined,
  tabsDisabled: false,
  setTabsDisabled: () => undefined,
  buffers: [],
  activeBuffer: fallbackBuffer,
  setActiveBuffer: () => Promise.resolve(),
  addBuffer: () => Promise.resolve(fallbackBuffer),
  deleteBuffer: () => Promise.resolve(),
  archiveBuffer: () => Promise.resolve(),
  duplicateNotebook: () => Promise.resolve(undefined),
  updateBuffer: () => Promise.resolve(),
  updateBuffersPositions: () => Promise.resolve(),
  editorReadyTrigger: () => undefined,
  setTemporaryBuffer: () => Promise.resolve(),
  temporaryBufferId: null,
  queryParamProcessedRef: { current: false },
  isNavigatingFromSearchRef: { current: false },
  showPreviewBuffer: () => Promise.resolve(),
  closePreviewBuffer: () => Promise.resolve(),
  applyAISQLChange: () => ({ success: false }),
  executionRefs: { current: {} },
  cleanupExecutionRefs: () => undefined,
  highlightQuery: () => Promise.resolve(false),
}

const EditorContext = createContext<EditorContext>(defaultValues)

export const EditorProvider: React.FC = ({ children }) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const executionRefs = useRef<ExecutionRefs>({})
  const [loadedMonaco, setLoadedMonaco] = useState<Monaco | null>(null)
  const [temporaryBufferId, setTemporaryBufferId] = useState<number | null>(
    null,
  )
  const [tabsDisabled, setTabsDisabled] = useState(false)
  const rawBuffers = useLiveQuery(bufferStore.getAll, [])
  const buffers = useMemo(() => {
    if (!rawBuffers) return undefined
    return rawBuffers.map((buffer) => ({
      ...buffer,
      isTemporary: buffer.id === temporaryBufferId,
    }))
  }, [rawBuffers, temporaryBufferId])

  const activeBufferId = useLiveQuery(
    () => bufferStore.getActiveId(),
    [],
  )?.value

  const [activeBuffer, setActiveBufferState] = useState<Buffer>(fallbackBuffer)
  const searchUpdateTimeoutRef = useRef<number | null>(null)
  const queryParamProcessedRef = useRef(false)
  const isNavigatingFromSearchRef = useRef(false)

  const ranOnce = useRef(false)

  useSchemaCompletionProvider(loadedMonaco)

  const getNextPosition = useCallback(() => {
    if (!buffers) return 0
    const activeBuffers = buffers.filter((b) => !b.archived || b.isTemporary)
    return Math.max(...activeBuffers.map((b) => b.position), -1) + 1
  }, [buffers])

  const cleanupExecutionRefs = useCallback((bufferId: number) => {
    delete executionRefs.current[bufferId.toString()]
  }, [])

  const setActiveBuffer = useCallback(
    async (
      buffer: Buffer,
      options?: { focus?: boolean; fromSearch?: boolean },
    ) => {
      try {
        const currentActiveBufferId = (await bufferStore.getActiveId())?.value

        if (currentActiveBufferId) {
          if (buffer.id === currentActiveBufferId) {
            setActiveBufferState(buffer)
            return
          }
        }

        await bufferStore.setActiveId(buffer.id as number)
        setActiveBufferState(buffer)

        if (options?.fromSearch) {
          isNavigatingFromSearchRef.current = true
        }

        if (
          editorRef.current &&
          monacoRef.current &&
          !buffer.notebookViewState
        ) {
          const currentModel = editorRef.current.getModel()
          if (currentModel) {
            currentModel.dispose()
          }

          const model = monacoRef.current.editor.createModel(
            buffer.value,
            QuestDBLanguageName,
          )
          editorRef.current.setModel(model)
          clearModelMarkers(monacoRef.current, editorRef.current)

          if (buffer.editorViewState) {
            editorRef.current.restoreViewState(buffer.editorViewState)
          }

          if (options?.focus !== false) {
            editorRef.current.focus()
          }
        }
      } catch (e) {
        console.warn("Error setting active buffer:", e)
      }
    },
    [],
  )

  const highlightQuery = useCallback(
    async (queryKey: QueryKey, bufferId: number): Promise<boolean> => {
      const buffer = await bufferStore.getById(bufferId)
      if (!buffer || buffer.archived) {
        return false
      }

      const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
      const contentAtOffset = buffer.value.slice(startOffset, endOffset)
      if (normalizeQueryText(contentAtOffset) !== queryText) {
        return false
      }

      const targetBuffer = buffers?.find((b) => b.id === bufferId)
      if (targetBuffer && activeBuffer.id !== bufferId) {
        await setActiveBuffer(targetBuffer)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (!editorRef.current) {
        return false
      }
      const model = editorRef.current.getModel()
      if (!model) {
        return false
      }

      const startPosition = model.getPositionAt(startOffset)
      const endPosition = model.getPositionAt(endOffset)

      editorRef.current.revealPositionNearTop(startPosition)
      editorRef.current.setPosition(startPosition)

      const decorationIds = model.deltaDecorations(
        [],
        [
          {
            range: {
              startLineNumber: startPosition.lineNumber,
              startColumn: startPosition.column,
              endLineNumber: endPosition.lineNumber,
              endColumn: endPosition.column,
            },
            options: {
              isWholeLine: false,
              className: "aiQueryHighlight",
            },
          },
        ],
      )

      editorRef.current.focus()

      setTimeout(() => {
        if (!model.isDisposed()) {
          model.deltaDecorations(decorationIds, [])
        }
      }, 1000)

      return true
    },
    [buffers, activeBuffer.id, setActiveBuffer],
  )

  const addBuffer: EditorContext["addBuffer"] = useCallback(
    async (newBuffer, { shouldSelectAll = false, afterBufferId } = {}) => {
      if (buffers && buffers.length >= MAX_TABS) {
        toast.error(
          `Tab limit reached (${MAX_TABS}). Please clear history to free up space.`,
        )
        return undefined
      }

      const bufferType = newBuffer?.notebookViewState
        ? BufferType.NOTEBOOK
        : newBuffer?.metricsViewState
          ? BufferType.METRICS
          : BufferType.SQL

      void trackEvent(ConsoleEvent.TAB_ADD, {
        type: bufferType,
        count: (buffers?.length ?? 0) + 1,
      })

      const fallback = makeFallbackBuffer(bufferType)

      const currentDefaultTabNumbers = (
        await db.buffers
          .filter((buffer) => {
            if (!buffer.label.startsWith(fallback.label)) return false
            if (newBuffer?.notebookViewState)
              return buffer.notebookViewState !== undefined
            if (newBuffer?.metricsViewState)
              return buffer.metricsViewState !== undefined
            return true
          })
          .toArray()
      )
        .map((buffer) => buffer.label.slice(fallback.label.length + 1))
        .filter(Boolean)
        .map((n) => parseInt(n, 10))
        .sort()

      const nextNumber = () => {
        for (let i = 0; i <= currentDefaultTabNumbers.length; i++) {
          const next = i + 1
          if (!currentDefaultTabNumbers.includes(next)) {
            return next
          }
        }
      }

      const activeBuffers = buffers
        ? buffers.filter((b) => !b.archived && !b.isTemporary)
        : []
      const insertAfter =
        afterBufferId !== undefined
          ? activeBuffers.find((b) => b.id === afterBufferId)
          : undefined
      const position = insertAfter
        ? insertAfter.position + 1
        : activeBuffers.length

      const buffer = makeBuffer({
        ...newBuffer,
        label: newBuffer?.label ?? `${fallback.label} ${nextNumber()}`,
        position,
      })

      let id: number
      if (insertAfter) {
        const toShift = activeBuffers.filter(
          (b) => typeof b.id === "number" && b.position >= position,
        )
        id = await db.transaction("rw", db.buffers, async () => {
          for (const b of toShift) {
            await db.buffers.update(b.id as number, {
              position: b.position + 1,
            })
          }
          return db.buffers.add(buffer)
        })
      } else {
        id = await db.buffers.add(buffer)
      }

      await setActiveBuffer(buffer, { focus: true })

      if (
        shouldSelectAll &&
        editorRef.current &&
        !newBuffer?.notebookViewState
      ) {
        const model = editorRef.current.getModel()
        if (model) {
          editorRef.current.setSelection(model.getFullModelRange())
        }
      }

      return { id, ...buffer }
    },
    [buffers, setActiveBuffer],
  )

  const showPreviewBuffer: EditorContext["showPreviewBuffer"] = useCallback(
    async (content) => {
      const existingPreviewBuffer = buffers?.find(
        (b) => b.isPreviewBuffer && !b.archived,
      )

      const previewContent: PreviewContent =
        content.type === "diff"
          ? {
              type: "diff",
              original: content.original,
              modified: content.modified,
              conversationId: content.conversationId,
            }
          : {
              type: "code",
              value: content.value,
            }

      const label = content.type === "diff" ? "AI Suggestion" : "Preview"

      if (existingPreviewBuffer && existingPreviewBuffer.id) {
        await bufferStore.update(existingPreviewBuffer.id, {
          previewContent,
          label,
        })
        const updatedBuffer = {
          ...existingPreviewBuffer,
          previewContent,
          label,
        }
        await setActiveBuffer(updatedBuffer)
      } else {
        const position = buffers
          ? buffers.filter((b) => !b.archived && !b.isTemporary).length
          : 0
        await addBuffer({
          label,
          value: "",
          isPreviewBuffer: true,
          position,
          previewContent,
        })
      }
    },
    [buffers, setActiveBuffer, addBuffer],
  )

  useEffect(() => {
    let cancelled = false
    void loader.init().then((m) => {
      if (!cancelled) setLoadedMonaco(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ranOnce.current && buffers && activeBufferId) {
      const buffer =
        buffers?.find((buffer) => buffer.id === activeBufferId) ?? buffers[0]
      const activeBuffers = buffers.filter((b) => !b.archived)
      setActiveBufferState(
        buffer.archived ? (activeBuffers[0] ?? fallbackBuffer) : buffer,
      )
      ranOnce.current = true
    }
  }, [buffers, activeBufferId])

  if (!buffers || !activeBufferId || activeBuffer === fallbackBuffer) {
    return null
  }

  const updateBuffer: EditorContext["updateBuffer"] = async (
    id,
    payload,
    setNewActiveBuffer = false,
  ) => {
    const editorViewState = editorRef.current?.saveViewState()
    const bufferType = await bufferStore.getBufferTypeById(id)
    let newPosition = null

    if (payload && "isTemporary" in payload) {
      if (payload.isTemporary) {
        setTemporaryBufferId(id)
      } else if (id === temporaryBufferId) {
        if (payload?.archived === false) {
          newPosition = getNextPosition()
        } else {
          newPosition = -1
        }
        setTemporaryBufferId(null)
      }
    }

    const { isTemporary: _, ...dbPayload } = payload || {}
    const effectivePayload = {
      ...dbPayload,
      ...(newPosition !== null ? { position: newPosition } : {}),
    }

    if (Object.keys(effectivePayload).length > 0) {
      await bufferStore.update(id, {
        ...effectivePayload,
        ...(editorViewState && bufferType === BufferType.SQL
          ? { editorViewState }
          : {}),
      })
    }
    if (setNewActiveBuffer) {
      await setActiveBufferOnRemoved(id)
    }
    if (searchUpdateTimeoutRef.current) {
      window.clearTimeout(searchUpdateTimeoutRef.current)
    }

    const searchUpdateKeys = ["value", "label", "archived"]
    const keys = Object.keys(payload || {})
    if (searchUpdateKeys.some((key) => keys.includes(key))) {
      searchUpdateTimeoutRef.current = window.setTimeout(() => {
        const metaUpdate = !(keys.length === 1 && keys[0] === "value")
        const contentUpdate = keys.includes("value")
        eventBus.publish(EventType.BUFFERS_UPDATED, {
          type: "update",
          metaUpdate,
          contentUpdate,
          bufferId: id,
        })
        searchUpdateTimeoutRef.current = null
      }, 300)
    }
  }

  const setActiveBufferOnRemoved = async (id: number) => {
    const activeBufferId = (await bufferStore.getActiveId())?.value
    if (typeof activeBufferId !== "undefined" && activeBufferId === id) {
      const nextActive = await db.buffers
        .toCollection()
        .filter((buffer) => {
          return (
            !buffer.archived &&
            !(buffer.id === temporaryBufferId || buffer.id === id)
          )
        })
        .last()
      await setActiveBuffer(nextActive ?? fallbackBuffer)
    } else {
      editorRef.current?.focus()
    }
  }

  const archiveBuffer: EditorContext["archiveBuffer"] = async (id) => {
    // Snapshot before write — live query refresh makes post-update read unreliable.
    const wasNotebook = !!buffers.find((b) => b.id === id)?.notebookViewState
    await updateBuffer(id, {
      archived: true,
      archivedAt: new Date().getTime(),
      position: -1,
    })
    await setActiveBufferOnRemoved(id)
    eventBus.publish(EventType.BUFFERS_UPDATED, {
      type: "archive",
      bufferId: id,
    })
    if (wasNotebook) {
      emitUserAction({ kind: "user_archived_notebook", bufferId: id })
    }
  }

  const duplicateNotebook: EditorContext["duplicateNotebook"] = async (id) => {
    const source = buffers.find((b) => b.id === id)
    if (!source?.notebookViewState) return undefined

    const persisted = await bufferStore.getById(id)
    const view = persisted?.notebookViewState ?? source.notebookViewState
    return addBuffer(
      {
        label: nextCopyLabel(source.label),
        notebookViewState: cloneNotebookViewState(view),
      },
      { afterBufferId: id },
    )
  }

  const deleteBuffer: EditorContext["deleteBuffer"] = async (
    id,
    setActiveBuffer = true,
  ) => {
    const wasNotebook = !!buffers.find((b) => b.id === id)?.notebookViewState
    await bufferStore.delete(id)
    cleanupExecutionRefs(id)
    if (setActiveBuffer) {
      await setActiveBufferOnRemoved(id)
    }
    eventBus.publish(EventType.BUFFERS_UPDATED, {
      type: "delete",
      bufferId: id,
    })
    if (wasNotebook) {
      emitUserAction({ kind: "user_deleted_notebook", bufferId: id })
    }
  }

  const setTemporaryBuffer: EditorContext["setTemporaryBuffer"] = async (
    buffer,
  ) => {
    if (temporaryBufferId !== null && temporaryBufferId !== buffer.id) {
      await updateBuffer(temporaryBufferId, { isTemporary: false })
    }
    await updateBuffer(buffer.id as number, {
      isTemporary: true,
    })

    await setActiveBuffer(
      { ...buffer, isTemporary: true },
      { focus: false, fromSearch: true },
    )
  }

  const updateBuffersPositions: EditorContext["updateBuffersPositions"] =
    async (positions) => {
      await db.transaction("rw", db.buffers, async () => {
        for (const { id, position } of positions) {
          await db.buffers.update(id, { position })
        }
      })
    }

  const closePreviewBuffer: EditorContext["closePreviewBuffer"] = async () => {
    const previewBuffer = buffers.find((b) => b.isPreviewBuffer && !b.archived)
    if (previewBuffer && previewBuffer.id) {
      await deleteBuffer(previewBuffer.id, true)
    }
  }

  const applyAISQLChange: EditorContext["applyAISQLChange"] = (options) => {
    const { newSQL, queryKey } = options

    if (!editorRef.current) {
      return { success: false }
    }

    const model = editorRef.current.getModel()
    if (!model) {
      return { success: false }
    }

    let finalQueryStartOffset: number = 0
    let replaceRange: IRange | null = null
    let shouldReplace = false

    if (queryKey) {
      try {
        const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
        const currentEditorText = model.getValue()
        const queryInEditor = currentEditorText.slice(startOffset, endOffset)
        const normalizedQueryInEditor = normalizeQueryText(queryInEditor)
        const normalizedOriginalQuery = normalizeQueryText(queryText)

        if (normalizedQueryInEditor === normalizedOriginalQuery) {
          const startPosition = model.getPositionAt(startOffset)

          let extendedEndOffset = endOffset
          const textAfterQuery = currentEditorText.slice(
            endOffset,
            endOffset + 10,
          )
          const semicolonMatch = textAfterQuery.match(/^(\s*;)/)
          if (semicolonMatch) {
            extendedEndOffset = endOffset + semicolonMatch[0].length
          }

          const endPosition = model.getPositionAt(extendedEndOffset)
          replaceRange = {
            startLineNumber: startPosition.lineNumber,
            startColumn: startPosition.column,
            endLineNumber: endPosition.lineNumber,
            endColumn: endPosition.column,
          }
          finalQueryStartOffset = startOffset
          shouldReplace = true
        }
      } catch {
        // Invalid queryKey or query not found — fall back to appending.
      }
    }

    if (!shouldReplace || !replaceRange) {
      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)
      finalQueryStartOffset = model.getOffsetAt({ lineNumber, column })
      replaceRange = {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column,
      }
    }

    // Apply the edit with proper semicolon handling
    // normalizeSql ensures: removes trailing semicolon, formats, then adds single semicolon
    const sqlWithSemicolon = normalizeSql(newSQL)
    const isAppend =
      replaceRange.startColumn === replaceRange.endColumn &&
      replaceRange.startLineNumber === replaceRange.endLineNumber
    editorRef.current.executeEdits("accept-ai-change", [
      {
        range: replaceRange,
        text: isAppend ? "\n" + sqlWithSemicolon + "\n" : sqlWithSemicolon,
        forceMoveMarkers: true,
      },
    ])

    // Recalculate positions after edit
    const finalModel = editorRef.current.getModel()
    if (!finalModel) {
      return { success: false }
    }

    const actualQueryStartOffset = isAppend
      ? finalQueryStartOffset + 1
      : finalQueryStartOffset
    const normalizedQuery = normalizeQueryText(sqlWithSemicolon)
    const actualQueryEndOffset = actualQueryStartOffset + normalizedQuery.length

    const finalStartPosition = finalModel.getPositionAt(actualQueryStartOffset)
    const finalEndPosition = finalModel.getPositionAt(actualQueryEndOffset)

    // Apply highlighting decoration
    const highlightRange = {
      startLineNumber: finalStartPosition.lineNumber,
      startColumn: finalStartPosition.column,
      endLineNumber: finalEndPosition.lineNumber,
      endColumn: finalEndPosition.column,
    }

    const decorationId = finalModel.deltaDecorations(
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

    // Set cursor to beginning of the query and focus the editor
    editorRef.current.setPosition(finalStartPosition)
    editorRef.current.revealPositionNearTop(finalStartPosition)
    editorRef.current.focus()

    setTimeout(() => {
      if (!finalModel.isDisposed()) {
        finalModel.deltaDecorations(decorationId, [])
      }
    }, 1000)

    // Return the final query key for caller to update conversation state
    const finalQueryKey = createQueryKey(
      normalizedQuery,
      actualQueryStartOffset,
    )

    return {
      success: true,
      finalQueryKey,
      queryStartOffset: actualQueryStartOffset,
    }
  }

  return (
    <EditorContext.Provider
      value={{
        editorRef,
        monacoRef,
        insertTextAtCursor: (text) => {
          if (editorRef?.current) {
            insertTextAtCursor(editorRef.current, text)
          }
        },
        appendQuery: (text) => {
          if (editorRef?.current) {
            appendQuery(editorRef.current, text)
          }
        },
        tabsDisabled,
        setTabsDisabled,
        buffers,
        activeBuffer,
        setActiveBuffer,
        addBuffer,
        deleteBuffer,
        archiveBuffer,
        duplicateNotebook,
        updateBuffer,
        updateBuffersPositions,
        setTemporaryBuffer,
        temporaryBufferId,
        queryParamProcessedRef,
        isNavigatingFromSearchRef,
        showPreviewBuffer,
        closePreviewBuffer,
        applyAISQLChange,
        executionRefs,
        cleanupExecutionRefs,
        highlightQuery,
        editorReadyTrigger: (editor) => {
          if (!activeBuffer.isTemporary && !isNavigatingFromSearchRef.current) {
            editor.focus()
          }

          if (activeBuffer.editorViewState) {
            editor.restoreViewState(activeBuffer.editorViewState)
          }
        },
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)
