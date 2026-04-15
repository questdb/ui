import Editor from "@monaco-editor/react"
import type { Monaco } from "@monaco-editor/react"
import { Stop } from "@styled-icons/remix-line"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import type { editor, IDisposable } from "monaco-editor"
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import type { ExecutionInfo } from "../../Editor"
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogButton,
  DialogDescription,
  ForwardRef,
  Overlay,
  PaneContent,
  Text,
} from "../../../components"
import { formatTiming } from "../QueryResult"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { QuestContext, useEditor } from "../../../providers"
import {
  useAIStatus,
  isBlockingAIStatus,
} from "../../../providers/AIStatusProvider"
import { useAIConversation } from "../../../providers/AIConversationProvider"
import { actions, selectors } from "../../../store"
import { RunningType } from "../../../store/Query/types"
import type { NotificationShape } from "../../../store/Query/types"
import { theme } from "../../../theme"
import { NotificationType } from "../../../types"
import type { ErrorResult } from "../../../utils"
import { color } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import Loader from "../Loader"
import QueryResult from "../QueryResult"
import { registerEditorActions } from "./editor-addons"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"
import { QueryInNotification } from "./query-in-notification"
import { createSchemaCompletionProvider } from "./questdb-sql"
import { Request } from "./utils"
import {
  appendQuery,
  applyValidationMarkers,
  cancelAllValidationRequests,
  clearModelMarkers,
  clearValidationMarkers,
  findMatches,
  getErrorRange,
  getQueryFromCursor,
  getQueryRequestFromEditor,
  getQueryRequestFromLastExecutedQuery,
  QuestDBLanguageName,
  getAllQueries,
  getQueriesInRange,
  normalizeQueryText,
  QueryKey,
  createQueryKey,
  parseQueryKey,
  createQueryKeyFromRequest,
  validateQueryAtOffset,
  validateQueryJIT,
  setErrorMarkerForQuery,
  getQueryStartOffset,
  getQueriesToRun,
  getQueriesStartingFromLine,
} from "./utils"
import { toast } from "../../../components/Toast"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import ButtonBar from "../ButtonBar"
import { QueryDropdown } from "./QueryDropdown"
import {
  createGlyphWidget,
  createGlyphWidgetId,
  toggleGlyphWidgetLoading,
  GlyphWidgetOptions,
} from "./glyphUtils"
import type { ConversationId } from "../../../providers/AIConversationProvider/types"

type IndividualQueryResult = {
  success: boolean
  result?: QuestDB.QueryRawResult
  notification:
    | (Partial<NotificationShape> & { content: ReactNode; query: QueryKey })
    | null
}

export const LINE_NUMBER_HARD_LIMIT = 99999

const Content = styled(PaneContent)<{ $hidden?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #2c2e3d;
  height: 100%;
  width: 100%;

  ${({ $hidden }) =>
    $hidden &&
    `
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
  `}
  .monaco-editor .squiggly-error {
    background: none;
    border-bottom: 0.3rem ${color("red")} solid;
  }

  .monaco-scrollable-element > .scrollbar > .slider {
    background: ${color("selection")};
  }

  .cursorQueryDecoration {
    width: 0.2rem !important;
    background: ${color("green")};
    margin-left: 0.5rem;

    &.hasError {
      background: ${color("red")};
    }
  }

  .glyph-widget-container {
    align-items: center;
    width: 50px !important;
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: 1rem;
    width: 53px;
    height: 100%;
  }

  .glyph-ai-icon {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;

    .ai-sparkle-hollow,
    .ai-sparkle-filled {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .ai-sparkle-hollow {
      visibility: visible;
    }
    .ai-sparkle-filled {
      visibility: hidden;
    }
    &:hover,
    &.highlight {
      .ai-sparkle-hollow {
        visibility: hidden;
      }
      .ai-sparkle-filled {
        visibility: visible;
      }
    }
    &.active {
      border: 1px solid transparent;
      box-shadow: none;
      background:
        linear-gradient(#2c2e3d, #2c2e3d) padding-box,
        linear-gradient(90deg, #d14671 0%, #892c6c 100%) border-box;
    }

    &.highlight {
      border: 1px solid #d14671;
      background: linear-gradient(
        90deg,
        rgba(209, 70, 113, 0.24) 0%,
        rgba(137, 44, 108, 0.24) 100%
      );
      box-shadow: none;
    }
  }

  .selectionErrorHighlight {
    background-color: rgba(255, 85, 85, 0.15);
    border-radius: 2px;
  }

  .selectionSuccessHighlight {
    background-color: rgba(80, 250, 123, 0.15);
    border-radius: 2px;
  }

  .searchHighlight {
    background-color: rgba(255, 184, 108, 0.5);
    border-radius: 2px;
  }

  .aiQueryHighlight {
    background-color: rgba(241, 250, 140, 0.5);
    border-radius: 2px;
  }

  /* Keyframe animation for glyph widget spinner */
  @keyframes glyph-spin {
    from {
      transform: rotate(0);
    }
    to {
      transform: rotate(360deg);
    }
  }
`

const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

const EditorWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  position: relative;
  padding: 8px 0 0 0;
`

const getDefaultLineNumbersMinChars = (canUseAI: boolean) => {
  return canUseAI ? 7 : 5
}

const MonacoEditor = ({ hidden = false }: { hidden?: boolean }) => {
  const editorContext = useEditor()
  const { executionRefs, cleanupExecutionRefs } = editorContext
  const {
    setTabsDisabled,
    editorRef,
    monacoRef,
    activeBuffer,
    updateBuffer,
    editorReadyTrigger,
    queryParamProcessedRef,
    isNavigatingFromSearchRef,
  } = editorContext
  const { quest, questExecution } = useContext(QuestContext)
  const { canUse: canUseAI, status: aiStatus } = useAIStatus()
  const {
    handleGlyphClick,
    hasConversationForQuery,
    shiftQueryKeysForBuffer,
    findQueryByConversationId,
  } = useAIConversation()
  const [request, setRequest] = useState<Request | undefined>()
  const [editorReady, setEditorReady] = useState<boolean>(false)
  const [lastExecutedQuery, setLastExecutedQuery] = useState("")
  const [refreshingTables, setRefreshingTables] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [scriptConfirmationOpen, setScriptConfirmationOpen] = useState(false)
  const scriptConfirmationOpenRef = useRef(false)
  const editorQueryIdRef = useRef<QuestDB.QueryId | null>(null)
  const scriptQueryKeyRef = useRef<QueryKey | null>(null)
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const queryNotifications = useSelector(
    selectors.query.getQueryNotificationsForBuffer(activeBuffer.id as number),
  )
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
  const isRunningScriptRef = useRef(false)
  const queryOffsetsRef = useRef<
    { startOffset: number; endOffset: number }[] | null
  >([])
  const pendingActionRef = useRef<
    | { type: RunningType.SCRIPT }
    | {
        type: RunningType.QUERY | RunningType.EXPLAIN
        queryText: string
        startOffset: number
      }
    | undefined
  >(undefined)
  const queriesToRunRef = useRef<Request[]>([])
  const scriptStopRef = useRef(false)
  const stopAfterFailureRef = useRef(true)
  const lineMarkingDecorationIdsRef = useRef<string[]>([])
  const runningValueRef = useRef(running)
  const activeBufferRef = useRef(activeBuffer)
  const requestRef = useRef(request)
  const queryNotificationsRef = useRef(queryNotifications)
  const activeNotificationRef = useRef(activeNotification)
  const canUseAIRef = useRef(canUseAI)
  const hasConversationForQueryRef = useRef(hasConversationForQuery)
  const shiftQueryKeysForBufferRef = useRef(shiftQueryKeysForBuffer)
  const findQueryByConversationIdRef = useRef(findQueryByConversationId)
  const isBlockingAIStatusRef = useRef(isBlockingAIStatus(aiStatus) ?? false)
  const contentJustChangedRef = useRef(false)
  const cursorChangeTimeoutRef = useRef<number | null>(null)
  const glyphWidgetsRef = useRef<Map<string, editor.IGlyphMarginWidget>>(
    new Map(),
  )
  const highlightedLineNumberRef = useRef<number | null>(null)
  const visibleLinesRef = useRef<{ startLine: number; endLine: number }>({
    startLine: 1,
    endLine: 1,
  })
  const scrollTimeoutRef = useRef<number | null>(null)
  const notificationTimeoutRef = useRef<number | null>(null)
  const validationTimeoutRef = useRef<number | null>(null)
  const targetPositionRef = useRef<{
    lineNumber: number
    column: number
  } | null>(null)
  const currentBufferValueRef = useRef<string | undefined>(activeBuffer.value)
  const dropdownPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dropdownQueriesRef = useRef<Request[]>([])
  const isContextMenuDropdownRef = useRef<boolean>(false)
  const isAIDropdownRef = useRef<boolean>(false)
  const cleanupActionsRef = useRef<(() => void)[]>([])

  const handleBufferContentChange = (value: string | undefined) => {
    const lineCount = editorRef.current?.getModel()?.getLineCount()
    if (lineCount && lineCount > LINE_NUMBER_HARD_LIMIT) {
      if (editorRef.current && currentBufferValueRef.current !== undefined) {
        editorRef.current.setValue(currentBufferValueRef.current)
      }
      toast.error("Maximum line limit reached")
      return
    }
    currentBufferValueRef.current = value
    void updateBuffer(activeBuffer.id as number, { value })
  }

  // Set the initial line number width in chars based on the number of lines in the active buffer
  const [lineNumbersMinChars, setLineNumbersMinChars] = useState(
    (canUseAI ? 7 : 5) +
      activeBuffer.value.split("\n").length.toString().length -
      1,
  )

  const toggleRunning = (runningType?: RunningType) => {
    dispatch(actions.query.toggleRunning(runningType))
  }

  const triggerJitValidation = () => {
    if (runningValueRef.current !== RunningType.NONE || requestRef.current) {
      return
    }

    if (monacoRef.current && editorRef.current) {
      const currentBufferId = activeBufferRef.current.id as number
      validateQueryJIT(
        monacoRef.current,
        editorRef.current,
        currentBufferId,
        () => executionRefs.current[currentBufferId.toString()] || {},
        (q, signal) => quest.validateQuery(q, signal),
      )
    }
  }

  const updateQueryNotification = (queryKey?: QueryKey) => {
    let newActiveNotification: NotificationShape | null = null

    if (queryKey) {
      const queryNotifications = queryNotificationsRef.current?.[queryKey]
      if (queryNotifications) {
        newActiveNotification = queryNotifications.latest || null
      }
    }

    if (activeNotificationRef.current?.query !== newActiveNotification?.query) {
      dispatch(actions.query.setActiveNotification(newActiveNotification))
    }
  }

  const getDropdownQueries = (lineNumber: number): Request[] => {
    const queriesOnLine = getQueriesStartingFromLine(
      editorRef.current!,
      lineNumber,
      queryOffsetsRef.current || [],
    )
    const queriesToRun = queriesToRunRef.current || []

    const selectionsOnLine = queriesToRun.filter(
      (query) => query.selection && query.row + 1 === lineNumber,
    )
    const nonSelectedQueries = queriesOnLine.filter(
      (query) =>
        !selectionsOnLine.some(
          (q) =>
            q.row === query.row &&
            q.column === query.column &&
            q.endRow === query.endRow &&
            q.endColumn === query.endColumn,
        ),
    )
    return [...nonSelectedQueries, ...selectionsOnLine].sort(
      (a, b) => a.column - b.column,
    )
  }

  const setCursorBeforeRunning = (query: Request) => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return

    if (query.selection) {
      const startPosition = model.getPositionAt(query.selection.startOffset)
      const endPosition = model.getPositionAt(query.selection.endOffset)
      editor.setSelection({
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      })
    } else {
      const queryInCursor = getQueryFromCursor(editor)
      if (
        queryInCursor &&
        createQueryKeyFromRequest(editor, queryInCursor) ===
          createQueryKeyFromRequest(editor, query)
      ) {
        return
      }
      editor.setPosition({
        lineNumber: query.row + 1,
        column: query.column,
      })
    }
  }

  const openDropdownAtPosition = (
    posX: number,
    posY: number,
    targetPosition: { lineNumber: number; column: number },
    isContextMenu: boolean = false,
  ) => {
    targetPositionRef.current = targetPosition
    isContextMenuDropdownRef.current = isContextMenu

    if (editorRef.current) {
      const editorContainer = editorRef.current.getDomNode()
      const containerRect = editorContainer?.getBoundingClientRect()

      let finalPosition: { x: number; y: number }

      if (containerRect) {
        const lineHeight = 24
        const lineNumber = targetPosition.lineNumber
        const scrollTop = editorRef.current.getScrollTop()

        const yPosition =
          containerRect.top +
          (lineNumber - 1) * lineHeight -
          scrollTop +
          lineHeight / 2 +
          5
        const xPosition = containerRect.left + 115

        finalPosition = { x: xPosition, y: yPosition }
      } else {
        // Fallback to click coordinates
        finalPosition = { x: posX, y: posY }
      }

      dropdownPositionRef.current = finalPosition
      isContextMenuDropdownRef.current = isContextMenu
      setDropdownOpen(true)
    }
  }

  const handleRunQuery = (query: Request) => {
    setDropdownOpen(false)
    runQueryAction(query, RunningType.QUERY)
  }

  const handleExplainQuery = (query: Request) => {
    void trackEvent(ConsoleEvent.EDITOR_GLYPH_CONTEXT_QUERY_PLAN)
    setDropdownOpen(false)
    runQueryAction(query, RunningType.EXPLAIN)
  }

  const runQueryAction = (
    query: Request,
    type: RunningType.QUERY | RunningType.EXPLAIN,
  ) => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return

    if (validationTimeoutRef.current) {
      window.clearTimeout(validationTimeoutRef.current)
      validationTimeoutRef.current = null
    }
    if (monacoRef.current) {
      clearValidationMarkers(
        monacoRef.current,
        editor,
        activeBufferRef.current.id as number,
      )
    }

    const targetBufferId = activeBufferRef.current.id as number
    const queryKey = createQueryKeyFromRequest(editor, query)

    questExecution.requestExecution(targetBufferId, queryKey, () => {
      setCursorBeforeRunning(query)
      toggleRunning(type)
    })
  }

  const executePendingAction = () => {
    const pending = pendingActionRef.current
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!pending || !editor || !model) return

    pendingActionRef.current = undefined

    if (pending.type === RunningType.SCRIPT) {
      queriesToRunRef.current = []
      dispatch(actions.query.toggleRunning(RunningType.SCRIPT))
      return
    }

    if (
      !validateQueryAtOffset(editor, pending.queryText, pending.startOffset)
    ) {
      return
    }

    if (validationTimeoutRef.current) {
      window.clearTimeout(validationTimeoutRef.current)
      validationTimeoutRef.current = null
    }
    if (monacoRef.current) {
      clearValidationMarkers(
        monacoRef.current,
        editor,
        activeBufferRef.current.id as number,
      )
    }

    const position = model.getPositionAt(pending.startOffset)
    editor.setPosition(position)

    toggleRunning(pending.type)
  }

  const handleAskAI = async (query?: Request) => {
    setDropdownOpen(false)
    void trackEvent(ConsoleEvent.AI_GLYPH_CLICK)
    if (!query || !editorRef.current) return

    const queryKey = createQueryKeyFromRequest(editorRef.current, query)

    await handleGlyphClick({
      queryKey,
      bufferId: activeBufferRef.current.id!,
    })
  }
  const handleAskAIRef = useRef(handleAskAI)
  useEffect(() => {
    handleAskAIRef.current = handleAskAI
  }, [handleAskAI])

  const applyLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor,
    source?: string,
  ) => {
    const model = editor.getModel()
    const editorValue = editor.getValue()

    if (!editorValue || !model) {
      return
    }

    const queryAtCursor = getQueryFromCursor(editor)
    const activeBufferId = activeBufferRef.current.id as number

    const lineMarkingDecorations: editor.IModelDeltaDecoration[] = []
    const bufferExecutions =
      executionRefs.current[activeBufferId.toString()] || {}

    if (queryAtCursor) {
      const queryKey = createQueryKeyFromRequest(editor, queryAtCursor)
      const queryExecutionBuffer = bufferExecutions[queryKey]
      const hasError =
        queryExecutionBuffer && queryExecutionBuffer.error !== undefined
      const startLineNumber = queryAtCursor.row + 1
      const endLineNumber = queryAtCursor.endRow + 1

      if (queryExecutionBuffer && queryExecutionBuffer.selection) {
        const startPosition = model.getPositionAt(
          queryExecutionBuffer.selection.startOffset,
        )
        const endPosition = model.getPositionAt(
          queryExecutionBuffer.selection.endOffset,
        )
        const isError = queryExecutionBuffer.error !== undefined
        const isSuccess = queryExecutionBuffer.success === true

        lineMarkingDecorations.push({
          range: new monaco.Range(
            startPosition.lineNumber,
            startPosition.column,
            endPosition.lineNumber,
            endPosition.column,
          ),
          options: {
            isWholeLine: false,
            className: isError
              ? "selectionErrorHighlight"
              : isSuccess
                ? "selectionSuccessHighlight"
                : "selectionErrorHighlight",
          },
        })
      }

      lineMarkingDecorations.push({
        range: new monaco.Range(
          startLineNumber,
          queryAtCursor.column,
          endLineNumber,
          queryAtCursor.endColumn,
        ),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: `cursorQueryDecoration ${hasError ? "hasError" : ""}`,
        },
      })
    }

    const newLineMarkingIds = editor.deltaDecorations(
      lineMarkingDecorationIdsRef.current,
      lineMarkingDecorations,
    )
    lineMarkingDecorationIdsRef.current = newLineMarkingIds
    if (
      !["scroll", "script", "query-notifications-sync"].includes(
        source ?? "",
      ) &&
      !isRunningScriptRef.current
    ) {
      updateQueryNotification(
        queryAtCursor
          ? createQueryKeyFromRequest(editor, queryAtCursor)
          : undefined,
      )
    }
    if (bufferExecutions) {
      setErrorMarkerForQuery(monaco, editor, bufferExecutions, queryAtCursor)
    }
  }

  const applyGlyphsAndLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor,
    source?: string,
  ) => {
    const model = editor.getModel()
    const editorValue = editor.getValue()

    if (!editorValue || !model) {
      return
    }
    let queries: Request[] = []

    const visibleLines = visibleLinesRef.current

    if (!visibleLines) {
      queries = getAllQueries(editor)
    } else {
      const totalLines = model.getLineCount()
      const bufferSize = 500

      const startLine = Math.max(1, visibleLines.startLine - bufferSize)
      const endLine = Math.min(totalLines, visibleLines.endLine + bufferSize)

      const startPosition = { lineNumber: startLine, column: 1 }
      const endPosition = {
        lineNumber: endLine,
        column: editor.getModel()?.getLineMaxColumn(endLine) ?? 1,
      }

      queries = getQueriesInRange(editor, startPosition, endPosition)
    }

    const activeBufferId = activeBufferRef.current.id as number

    const allQueryOffsets: { startOffset: number; endOffset: number }[] = []
    const newGlyphWidgetIds = new Map<string, editor.IGlyphMarginWidget>()
    const newGlyphWidgetLineNumbers = new Set<number>()

    if (queries.length > 0) {
      queries.forEach((query) => {
        const queryOffsets = {
          startOffset: model.getOffsetAt({
            lineNumber: query.row + 1,
            column: query.column,
          }),
          endOffset: model.getOffsetAt({
            lineNumber: query.endRow + 1,
            column: query.endColumn,
          }),
        }
        allQueryOffsets.push(queryOffsets)
        const bufferExecutions =
          executionRefs.current[activeBufferId.toString()] || {}
        const queryKey = createQueryKeyFromRequest(editor, query)
        const queryExecutionBuffer = bufferExecutions[queryKey]
        const hasError =
          queryExecutionBuffer && queryExecutionBuffer.error !== undefined
        const isSuccessful =
          queryNotificationsRef.current?.[queryKey]?.latest?.type ===
          NotificationType.SUCCESS

        // Convert 0-based row to 1-based line number for Monaco
        const startLineNumber = query.row + 1

        const hasConversation = canUseAIRef.current
          ? hasConversationForQueryRef.current(activeBufferId, queryKey)
          : false

        const isRunningQuery =
          runningValueRef.current !== RunningType.NONE &&
          requestRef.current?.row !== undefined &&
          requestRef.current?.row + 1 === startLineNumber

        const handleRunClick = () => {
          void trackEvent(ConsoleEvent.EDITOR_GLYPH_RUN)
          if (isRunningQuery) {
            toggleRunning(RunningType.NONE)
          } else {
            const dropdownQueries = getDropdownQueries(startLineNumber)
            if (dropdownQueries.length > 1) {
              dropdownQueriesRef.current = dropdownQueries
              isAIDropdownRef.current = false
              openDropdownAtPosition(
                0,
                0,
                { lineNumber: startLineNumber, column: 1 },
                false,
              )
            } else if (dropdownQueries.length === 1) {
              runQueryAction(dropdownQueries[0], RunningType.QUERY)
            }
          }
        }

        const handleAIClick = () => {
          if (isBlockingAIStatusRef.current) return
          const dropdownQueries = getDropdownQueries(startLineNumber)
          if (dropdownQueries.length > 1) {
            dropdownQueriesRef.current = dropdownQueries
            isAIDropdownRef.current = true
            openDropdownAtPosition(
              0,
              0,
              { lineNumber: startLineNumber, column: 1 },
              false,
            )
          } else if (dropdownQueries.length === 1) {
            void handleAskAIRef.current(dropdownQueries[0])
          }
        }

        const handleRunContextMenu = () => {
          void trackEvent(ConsoleEvent.EDITOR_GLYPH_CONTEXT_OPEN)
          if (isBlockingAIStatusRef.current) return
          const dropdownQueries = getDropdownQueries(startLineNumber)
          if (dropdownQueries.length > 0) {
            dropdownQueriesRef.current = dropdownQueries
            isAIDropdownRef.current = false
            openDropdownAtPosition(
              0,
              0,
              { lineNumber: startLineNumber, column: 1 },
              true,
            )
          }
        }

        const isHighlighted =
          highlightedLineNumberRef.current === startLineNumber

        const widgetOptions: GlyphWidgetOptions = {
          isHighlighted,
          isCancel: isRunningQuery,
          hasError,
          isSuccessful,
          showAI: canUseAIRef.current,
          hasConversation,
          onRunClick: handleRunClick,
          onRunContextMenu: handleRunContextMenu,
          onAIClick: handleAIClick,
        }

        const widgetId = createGlyphWidgetId(startLineNumber, widgetOptions)
        const isNewWidget = !glyphWidgetsRef.current.has(widgetId)

        if (isNewWidget && !newGlyphWidgetLineNumbers.has(startLineNumber)) {
          const widget = createGlyphWidget(startLineNumber, widgetOptions)
          editor.addGlyphMarginWidget(widget)
          newGlyphWidgetIds.set(widgetId, widget)
          newGlyphWidgetLineNumbers.add(startLineNumber)
        } else if (!isNewWidget) {
          newGlyphWidgetIds.set(
            widgetId,
            glyphWidgetsRef.current.get(widgetId)!,
          )
          newGlyphWidgetLineNumbers.add(startLineNumber)
        }
        if (isHighlighted) {
          highlightedLineNumberRef.current = null
        }
      })
    }
    glyphWidgetsRef.current.forEach((widget, widgetId) => {
      if (!newGlyphWidgetIds.has(widgetId)) {
        editor.removeGlyphMarginWidget(widget)
      }
    })
    glyphWidgetsRef.current = newGlyphWidgetIds

    queryOffsetsRef.current = allQueryOffsets

    applyLineMarkings(monaco, editor, source)
  }

  const onMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    editor.updateOptions({
      find: {
        addExtraSpaceOnTop: false,
      },
    })
    editor.setModel(
      monaco.editor.createModel(activeBuffer.value, QuestDBLanguageName),
    )
    setEditorReady(true)
    editorReadyTrigger(editor)
    isNavigatingFromSearchRef.current = false

    // Support legacy bus events for non-react codebase
    cleanupActionsRef.current.push(
      registerLegacyEventBusEvents({
        editor,
        toggleRunning,
      }),
    )
    cleanupActionsRef.current.push(
      registerEditorActions({
        editor,
        monaco,
        runQuery: () => {
          if (queriesToRunRef.current.length === 1) {
            handleRunQuery(queriesToRunRef.current[0])
          } else if (queriesToRunRef.current.length > 1) {
            handleTriggerRunScript()
          }
        },
        runScript: () => {
          handleTriggerRunScript(true)
        },
        deleteBuffer: (id: number) => editorContext.deleteBuffer(id),
        addBuffer: () => editorContext.addBuffer(),
      }),
    )

    // Prevent context menu from being clipped
    const containerDomNode = editor.getContainerDomNode()
    const contextMenuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("context-view") &&
            node.classList.contains("monaco-menu-container")
          ) {
            const rect = node.getBoundingClientRect()
            node.style.position = "fixed"
            node.style.left = `${rect.left}px`
            node.style.top = `${rect.top}px`

            // Monaco reuses the node on subsequent opens, resetting styles.
            const styleObserver = new MutationObserver(() => {
              if (node.style.position !== "fixed") {
                const rect = node.getBoundingClientRect()
                node.style.position = "fixed"
                node.style.left = `${rect.left}px`
                node.style.top = `${rect.top}px`
              }
            })
            styleObserver.observe(node, {
              attributes: true,
              attributeFilter: ["style"],
            })
            cleanupActionsRef.current.push(() => styleObserver.disconnect())
          }
        }
      }
    })
    contextMenuObserver.observe(containerDomNode, { childList: true })
    cleanupActionsRef.current.push(() => contextMenuObserver.disconnect())

    editor.onDidChangeCursorPosition((e) => {
      // To ensure the fixed position of the "run query" glyph we adjust the width of the line count element.
      // This width is represented in char numbers.

      if (contentJustChangedRef.current) {
        return
      }

      if (cursorChangeTimeoutRef.current) {
        window.clearTimeout(cursorChangeTimeoutRef.current)
      }

      cursorChangeTimeoutRef.current = window.setTimeout(() => {
        const queriesToRun = getQueriesToRun(
          editor,
          queryOffsetsRef.current ?? [],
        )
        queriesToRunRef.current = queriesToRun
        dispatch(actions.query.setQueriesToRun(queriesToRun))

        if (monacoRef.current && editorRef.current) {
          applyLineMarkings(monaco, editor, e.source)
        }
        cursorChangeTimeoutRef.current = null
      }, 50)

      // JIT validation on cursor move (debounced)
      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
      }
      validationTimeoutRef.current = window.setTimeout(() => {
        triggerJitValidation()
        validationTimeoutRef.current = null
      }, 300)
    })

    editor.onDidChangeModelContent(async (e) => {
      const model = editor.getModel()
      if (!model) return

      const lineCount = model.getLineCount()
      if (lineCount) {
        setLineNumbersMinChars(
          getDefaultLineNumbersMinChars(canUseAIRef.current) +
            (lineCount.toString().length - 1),
        )
      }

      contentJustChangedRef.current = true

      const activeBufferId = activeBufferRef.current.id as number
      const bufferExecutions = executionRefs.current[activeBufferId.toString()]

      const notificationUpdates: Array<() => void> = []

      if (bufferExecutions) {
        const keysToUpdate: Array<{
          oldKey: QueryKey
          newKey: QueryKey
          data: ExecutionInfo
        }> = []
        Object.keys(bufferExecutions).forEach((key) => {
          const queryKey = key as QueryKey
          const { queryText, startOffset, endOffset } =
            bufferExecutions[queryKey]

          const effectiveOffsetDelta = e.changes
            .filter((change) => change.rangeOffset < endOffset)
            .reduce(
              (acc, change) => acc + change.text.length - change.rangeLength,
              0,
            )

          if (effectiveOffsetDelta === 0) {
            return
          }

          const newOffset = startOffset + effectiveOffsetDelta
          const selection = bufferExecutions[queryKey].selection
          const shiftedSelection = selection
            ? {
                startOffset: selection.startOffset + effectiveOffsetDelta,
                endOffset: selection.endOffset + effectiveOffsetDelta,
              }
            : undefined
          keysToUpdate.push({
            oldKey: queryKey,
            newKey: createQueryKey(queryText, newOffset),
            data: {
              ...bufferExecutions[queryKey],
              startOffset: newOffset,
              endOffset: endOffset + effectiveOffsetDelta,
              selection: shiftedSelection,
            },
          })
        })

        keysToUpdate.forEach(({ oldKey, newKey, data }) => {
          delete bufferExecutions[oldKey]
          bufferExecutions[newKey] = data
          notificationUpdates.push(() =>
            dispatch(
              actions.query.updateNotificationKey(
                oldKey,
                newKey,
                activeBufferId,
              ),
            ),
          )
        })
      }

      const currentNotifications = queryNotificationsRef.current || {}

      Object.keys(currentNotifications).forEach((key) => {
        const queryKey = key as QueryKey

        const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
        const effectiveOffsetDelta = e.changes
          .filter((change) => change.rangeOffset < endOffset)
          .reduce(
            (acc, change) => acc + change.text.length - change.rangeLength,
            0,
          )

        if (effectiveOffsetDelta === 0) {
          return
        }

        const newOffset = startOffset + effectiveOffsetDelta
        const newKey = createQueryKey(queryText, newOffset)
        notificationUpdates.push(() =>
          dispatch(
            actions.query.updateNotificationKey(
              queryKey,
              newKey,
              activeBufferId,
            ),
          ),
        )
      })

      if (bufferExecutions && Object.keys(bufferExecutions).length === 0) {
        cleanupExecutionRefs(activeBufferId)
      }
      executionRefs.current[activeBufferId.toString()] = bufferExecutions

      let shiftedQueryKeys = false
      if (e.changes.length > 0) {
        const earliestChangeOffset = Math.min(
          ...e.changes.map((c) => c.rangeOffset),
        )
        const totalDelta = e.changes.reduce(
          (acc, c) => acc + c.text.length - c.rangeLength,
          0,
        )
        if (totalDelta !== 0) {
          shiftedQueryKeys = await shiftQueryKeysForBufferRef.current(
            activeBufferId,
            earliestChangeOffset,
            totalDelta,
          )
        }
      }

      if (!shiftedQueryKeys) {
        applyGlyphsAndLineMarkings(monaco, editor)
      }

      const queriesToRun = getQueriesToRun(
        editor,
        queryOffsetsRef.current ?? [],
      )
      queriesToRunRef.current = queriesToRun
      dispatch(actions.query.setQueriesToRun(queriesToRun))

      contentJustChangedRef.current = false
      notificationUpdates.forEach((update) => update())

      // JIT validation (debounced)
      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
      }
      validationTimeoutRef.current = window.setTimeout(() => {
        triggerJitValidation()
        validationTimeoutRef.current = null
      }, 300)
    })

    editor.onDidChangeModel(() => {
      cancelAllValidationRequests()
      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
        validationTimeoutRef.current = null
      }
      glyphWidgetsRef.current.forEach((widget) => {
        editorRef.current?.removeGlyphMarginWidget(widget)
      })
      glyphWidgetsRef.current.clear()
      const lineCount = editorRef.current?.getModel()?.getLineCount()
      const hasContent =
        (editorRef.current?.getModel()?.getValueLength() ?? 0) > 0
      if (lineCount) {
        setLineNumbersMinChars(
          getDefaultLineNumbersMinChars(canUseAIRef.current) +
            (lineCount.toString().length - 1),
        )
        if (hasContent) {
          void trackEvent(ConsoleEvent.EDITOR_VIEW_TAB, { lines: lineCount })
        }
      }
      setTimeout(() => {
        if (monacoRef.current && editorRef.current) {
          applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
        }
      }, 10)
    })

    editor.onDidScrollChange(() => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        const visibleRanges = editor.getVisibleRanges()
        if (visibleRanges.length > 0) {
          const firstRange = visibleRanges[0]

          const newVisibleLines = {
            startLine: firstRange.startLineNumber,
            endLine: firstRange.endLineNumber,
          }

          // Check if visible range has changed significantly (more than 100 lines)
          const oldVisibleLines = visibleLinesRef.current
          const startLineDiff = Math.abs(
            newVisibleLines.startLine - oldVisibleLines.startLine,
          )
          const endLineDiff = Math.abs(
            newVisibleLines.endLine - oldVisibleLines.endLine,
          )

          visibleLinesRef.current = newVisibleLines

          if (startLineDiff > 100 || endLineDiff > 100) {
            if (monacoRef.current && editorRef.current) {
              applyGlyphsAndLineMarkings(
                monacoRef.current,
                editorRef.current,
                "scroll",
              )
            }
          }
        }
        scrollTimeoutRef.current = null
      }, 200)
    })

    // Insert query, if one is found in the URL
    const params = new URLSearchParams(window.location.search)
    // Support multi-line queries (URL encoded)
    const query = params.get("query")
    const model = editor.getModel()
    if (query && model && !queryParamProcessedRef.current) {
      const trimmedQuery = query.trim()
      // Find if the query is already in the editor
      const matches = findMatches(model, trimmedQuery)
      if (matches && matches.length > 0) {
        editor.setSelection(matches[0].range)
        editor.revealPositionInCenter({
          lineNumber: matches[0].range.startLineNumber,
          column: matches[0].range.startColumn,
        })
        // otherwise, append the query
      } else {
        appendQuery(editor, trimmedQuery, { appendAt: "end" })
        const newValue = editor.getValue()
        void updateBuffer(activeBuffer.id as number, { value: newValue })
      }
      queryParamProcessedRef.current = true
    }

    const initialVisibleRanges = editor.getVisibleRanges()
    if (initialVisibleRanges.length > 0) {
      const firstRange = initialVisibleRanges[0]

      visibleLinesRef.current = {
        startLine: firstRange.startLineNumber,
        endLine: firstRange.endLineNumber,
      }
    }

    // Initial decoration setup
    applyGlyphsAndLineMarkings(monaco, editor)
    const queriesToRun = getQueriesToRun(editor, queryOffsetsRef.current ?? [])
    queriesToRunRef.current = queriesToRun
    dispatch(actions.query.setQueriesToRun(queriesToRun))

    const executeQuery = params.get("executeQuery")
    if (executeQuery) {
      if (queriesToRun.length > 1) {
        handleTriggerRunScript()
      } else {
        toggleRunning()
      }
    } else {
      triggerJitValidation()
    }
  }

  const runIndividualQuery = async (
    query: Request,
    isLast: boolean,
  ): Promise<IndividualQueryResult> => {
    const editor = editorRef.current
    const model = editorRef.current?.getModel()
    if (!editor || !model) {
      return {
        success: false,
        notification: null,
        result: undefined,
      }
    }

    const effectiveQueryText = query.selection
      ? query.selection.queryText
      : query.query
    const queryKey = createQueryKeyFromRequest(editor, query)
    const activeBufferId = activeBuffer.id as number
    let notification:
      | (Partial<NotificationShape> & { content: ReactNode; query: QueryKey })
      | null = null
    dispatch(actions.query.setResult(undefined))

    // Clear JIT validation markers — execution result takes over.
    if (monacoRef.current) {
      clearValidationMarkers(monacoRef.current, editor, activeBufferId)
    }
    if (validationTimeoutRef.current) {
      window.clearTimeout(validationTimeoutRef.current)
      validationTimeoutRef.current = null
    }

    dispatch(
      actions.query.setActiveNotification({
        type: NotificationType.LOADING,
        query: `${activeBufferRef.current.label}@${0}-${0}`,
        content: (
          <Box gap="1rem" align="center">
            <Text color="foreground">
              Running query &quot;
              {effectiveQueryText.length > 30
                ? `${effectiveQueryText.slice(0, 30)}...`
                : effectiveQueryText}
              &quot;
            </Text>
          </Box>
        ),
        createdAt: new Date(),
      }),
    )

    try {
      const { promise: scriptQueryPromise, queryId: scriptQueryId } =
        quest.queryRaw(normalizeQueryText(effectiveQueryText), {
          limit: "0,1000",
          explain: true,
          cancellable: true,
        })
      editorQueryIdRef.current = scriptQueryId

      const result = await scriptQueryPromise

      const bufferIdStr = activeBufferId.toString()
      if (executionRefs.current[bufferIdStr]) {
        delete executionRefs.current[bufferIdStr][queryKey]
        if (Object.keys(executionRefs.current[bufferIdStr]).length === 0) {
          cleanupExecutionRefs(activeBufferId)
        }
      }

      if (
        result.type === QuestDB.Type.DDL ||
        result.type === QuestDB.Type.DML
      ) {
        notification = {
          query: queryKey,
          content: <QueryInNotification query={effectiveQueryText} />,
        }
      }

      if (result.type === QuestDB.Type.NOTICE) {
        notification = {
          query: queryKey,
          content: (
            <Text color="foreground" ellipsis title={effectiveQueryText}>
              {result.notice}
              {effectiveQueryText !== undefined &&
                effectiveQueryText !== "" &&
                `: ${effectiveQueryText}`}
            </Text>
          ),
          sideContent: <QueryInNotification query={effectiveQueryText} />,
          type: NotificationType.NOTICE,
        }
      }

      if (result.type === QuestDB.Type.DQL) {
        setLastExecutedQuery(effectiveQueryText)
        notification = {
          query: queryKey,
          jitCompiled: result.explain?.jitCompiled ?? false,
          content: <QueryResult {...result.timings} rowCount={result.count} />,
          sideContent: <QueryInNotification query={effectiveQueryText} />,
        }
      }

      if (query.selection) {
        const bufferIdStr = activeBufferId.toString()
        if (!executionRefs.current[bufferIdStr]) {
          executionRefs.current[bufferIdStr] = {}
        }

        const queryStartOffset = getQueryStartOffset(editor, query)
        executionRefs.current[bufferIdStr][queryKey] = {
          success: true,
          selection: query.selection,
          queryText: query.query,
          startOffset: queryStartOffset,
          endOffset: queryStartOffset + normalizeQueryText(query.query).length,
        }
      }

      if (isLast) {
        dispatch(actions.query.setResult(result))
      }

      return {
        success: true,
        notification,
        result,
      }
    } catch (_error: unknown) {
      const error = _error as ErrorResult

      const bufferIdStr = activeBufferId.toString()
      if (!executionRefs.current[bufferIdStr]) {
        executionRefs.current[bufferIdStr] = {}
      }

      const startOffset = getQueryStartOffset(editor, query)
      executionRefs.current[bufferIdStr][queryKey] = {
        error,
        queryText: query.query,
        startOffset,
        endOffset: startOffset + normalizeQueryText(query.query).length,
        selection: query.selection,
      }

      notification = {
        query: queryKey,
        content: <Text color="red">{error.error}</Text>,
        sideContent: <QueryInNotification query={query.query} />,
        type: NotificationType.ERROR,
      }
      return {
        success: false,
        notification,
        result: undefined,
      }
    }
  }

  const handleTriggerRunScript = (runAll?: boolean) => {
    if (running === RunningType.SCRIPT) {
      dispatch(actions.query.toggleRunning())
      return
    }

    void trackEvent(ConsoleEvent.EDITOR_RUN_MULTIPLE, {
      queryCount: queriesToRunRef.current?.length ?? 0,
      runAll,
    })

    const triggerScript = () => {
      if (runAll) {
        setScriptConfirmationOpen(true)
        return
      }

      const hasMultipleSelection =
        queriesToRunRef.current && queriesToRunRef.current.length > 1
      if (!hasMultipleSelection) {
        // Run all queries in the buffer
        setScriptConfirmationOpen(true)
      } else {
        // Run selected portion of each query one by one
        dispatch(actions.query.toggleRunning(RunningType.SCRIPT))
      }
    }

    if (
      runningValueRef.current === RunningType.NONE &&
      !questExecution.isAnyRunning()
    ) {
      triggerScript()
      return
    }

    // Store script action for later execution
    pendingActionRef.current = { type: RunningType.SCRIPT }
    setScriptConfirmationOpen(true)
  }

  const handleConfirmRunScript = () => {
    setScriptConfirmationOpen(false)

    if (pendingActionRef.current) {
      if (runningValueRef.current === RunningType.NONE) {
        executePendingAction()
      } else {
        toggleRunning(RunningType.NONE)
      }
      return
    }

    queriesToRunRef.current = []
    dispatch(actions.query.toggleRunning(RunningType.SCRIPT))
  }

  const handleToggleDialog = (open: boolean) => {
    setScriptConfirmationOpen(open)
    if (!open) {
      setTimeout(() => editorRef.current?.focus())
    }
  }

  const handleCloseDialog = () => {
    if (!scriptConfirmationOpen) return
    pendingActionRef.current = undefined
    handleToggleDialog(false)
  }

  const handleRunScript = async () => {
    let successfulQueries = 0
    let failedQueries = 0
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const queriesToRun =
      queriesToRunRef.current && queriesToRunRef.current.length > 1
        ? queriesToRunRef.current
        : undefined
    const runningAllQueries = !queriesToRun
    // Clear all notifications & execution refs for the buffer
    const activeBufferId = activeBuffer.id as number
    if (runningAllQueries) {
      dispatch(actions.query.cleanupBufferNotifications(activeBufferId))
      cleanupExecutionRefs(activeBufferId)
    }

    isRunningScriptRef.current = true
    setTabsDisabled(true)
    const queries = queriesToRun ?? getAllQueries(editor)
    const individualQueryResults: Array<IndividualQueryResult> = []

    editor.updateOptions({ readOnly: true })

    const startTime = Date.now()
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      const lineNumber = query.row + 1
      editor.revealPositionInCenterIfOutsideViewport({
        lineNumber,
        column: query.column,
      })

      toggleGlyphWidgetLoading(lineNumber, true)

      const result = await runIndividualQuery(query, i === queries.length - 1)

      toggleGlyphWidgetLoading(lineNumber, false)

      individualQueryResults.push(result)
      if (result.success) {
        successfulQueries++
      } else {
        failedQueries++
      }
      if (
        scriptStopRef.current ||
        (failedQueries > 0 && stopAfterFailureRef.current && runningAllQueries)
      ) {
        break
      }
    }

    const duration = (Date.now() - startTime) * 1e6

    const lastResult = individualQueryResults[individualQueryResults.length - 1]
    if (lastResult && lastResult.result?.type === QuestDB.Type.DQL) {
      dispatch(actions.query.setResult(lastResult.result))
      eventBus.publish(EventType.MSG_QUERY_DATASET, lastResult.result)
    }

    const querySchemaMessageTypes = [
      QuestDB.Type.DDL,
      QuestDB.Type.DML,
      QuestDB.Type.NOTICE,
    ]
    const querySchemaMessage = individualQueryResults
      .filter((result) => result && result.result)
      .find(
        (result) =>
          result?.result?.type &&
          querySchemaMessageTypes.includes(result.result.type),
      )

    if (querySchemaMessage) {
      eventBus.publish(EventType.MSG_QUERY_SCHEMA, querySchemaMessage.result)
    }

    individualQueryResults
      .filter((result) => result && result.notification)
      .map((result) => result.notification)
      .forEach((notification) => {
        dispatch(
          actions.query.addNotification(
            { ...notification!, updateActiveNotification: false },
            activeBuffer.id as number,
          ),
        )
      })

    const lastFailureIndex = individualQueryResults.reduce(
      (acc, result, index) => (result.success ? acc : index),
      -1,
    )
    if (lastFailureIndex !== -1) {
      editor.setPosition(
        {
          lineNumber: queries[lastFailureIndex].row + 1,
          column: queries[lastFailureIndex].column,
        },
        "script",
      )
    }
    editor.focus()
    editor.revealPositionInCenterIfOutsideViewport(editor.getPosition()!)

    const completedGracefully = queries.length === individualQueryResults.length
    if (
      completedGracefully ||
      (failedQueries > 0 && stopAfterFailureRef.current && runningAllQueries)
    ) {
      isRunningScriptRef.current = false
      dispatch(actions.query.stopRunning())
      if (scriptQueryKeyRef.current !== null) {
        questExecution.releaseExecution(scriptQueryKeyRef.current)
        scriptQueryKeyRef.current = null
      }
    }

    const notificationPrefix = completedGracefully
      ? `Running completed in ${formatTiming(duration)} with `
      : "Stopped after running "

    dispatch(
      actions.query.addNotification(
        {
          query: `${activeBufferRef.current.label}@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`,
          content: (
            <Text color="foreground">
              {notificationPrefix}
              {successfulQueries > 0 ? `${successfulQueries} successful` : ""}
              {successfulQueries > 0 && failedQueries > 0 ? " and " : ""}
              {failedQueries > 0 ? `${failedQueries} failed` : ""}{" "}
              {failedQueries + successfulQueries > 1 ? " queries" : " query"}
            </Text>
          ),
          type: completedGracefully
            ? NotificationType.SUCCESS
            : NotificationType.ERROR,
        },
        activeBufferRef.current.id as number,
      ),
    )
    setTabsDisabled(false)
    isRunningScriptRef.current = false
    stopAfterFailureRef.current = true
    editor.updateOptions({ readOnly: false })
    if (scriptStopRef.current) {
      scriptStopRef.current = false
      if (!scriptConfirmationOpenRef.current) {
        executePendingAction()
      }
    }
  }

  useEffect(() => {
    canUseAIRef.current = canUseAI
    const lineCount = editorRef.current?.getModel()?.getLineCount()
    if (lineCount) {
      setLineNumbersMinChars(
        getDefaultLineNumbersMinChars(canUseAIRef.current) +
          (lineCount.toString().length - 1),
      )
    }
    if (monacoRef.current && editorRef.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [canUseAI])

  useEffect(() => {
    activeNotificationRef.current = activeNotification
  }, [activeNotification])

  useEffect(() => {
    scriptConfirmationOpenRef.current = scriptConfirmationOpen
  }, [scriptConfirmationOpen])

  useEffect(() => {
    const gridNotificationKeySuffix = `@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`
    queryNotificationsRef.current = queryNotifications
    if (
      monacoRef.current &&
      editorRef.current &&
      !contentJustChangedRef.current &&
      !activeNotification?.query.endsWith(gridNotificationKeySuffix)
    ) {
      applyGlyphsAndLineMarkings(
        monacoRef.current,
        editorRef.current,
        "query-notifications-sync",
      )
    }
  }, [queryNotifications])

  useEffect(() => {
    if (running === RunningType.NONE && request) {
      if (editorQueryIdRef.current !== null) {
        quest.abort(editorQueryIdRef.current)
        editorQueryIdRef.current = null
      }
      setRequest(undefined)
    }
  }, [request, running, quest])

  useEffect(() => {
    runningValueRef.current = running
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) {
      return
    }
    if (running !== RunningType.NONE) {
      cancelAllValidationRequests()
      clearModelMarkers(monaco, editor)
      clearValidationMarkers(
        monaco,
        editor,
        activeBufferRef.current.id as number,
      )
      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
        validationTimeoutRef.current = null
      }
    }
    if (![RunningType.NONE, RunningType.SCRIPT].includes(running)) {
      applyGlyphsAndLineMarkings(monaco, editor)

      const request =
        running === RunningType.REFRESH
          ? getQueryRequestFromLastExecutedQuery(lastExecutedQuery)
          : getQueryRequestFromEditor(editor)

      const isRunningExplain = running === RunningType.EXPLAIN

      const targetBufferId = activeBufferRef.current.id as number

      if (request?.query) {
        editor.updateOptions({ readOnly: true })
        const parentQuery = request.query
        const parentQueryKey = createQueryKeyFromRequest(editor, request)
        questExecution.markActive(targetBufferId, parentQueryKey)
        const originalQueryText = request.selection
          ? request.selection.queryText
          : request.query
        let queryToRun = originalQueryText
        if (isRunningExplain) {
          queryToRun = `EXPLAIN ${originalQueryText}`
        }

        // give the notification a slight delay to prevent flashing for fast queries
        notificationTimeoutRef.current = window.setTimeout(() => {
          if (runningValueRef.current && requestRef.current && editor) {
            dispatch(
              actions.query.addNotification(
                {
                  type: NotificationType.LOADING,
                  query: parentQueryKey,
                  isExplain: isRunningExplain,
                  content: (
                    <Box gap="1rem" align="center">
                      <Text color="foreground">Running...</Text>
                      <CancelButton
                        skin="error"
                        onClick={() => toggleRunning()}
                      >
                        <Stop size="18px" />
                      </CancelButton>
                    </Box>
                  ),
                  sideContent: <QueryInNotification query={queryToRun} />,
                },
                targetBufferId,
              ),
            )
          }
          notificationTimeoutRef.current = null
        }, 1000)

        const { promise: queryPromise, queryId } = quest.queryRaw(
          normalizeQueryText(queryToRun),
          {
            limit: "0,1000",
            explain: true,
            cancellable: true,
          },
        )
        editorQueryIdRef.current = queryId

        void queryPromise
          .then((result) => {
            if (notificationTimeoutRef.current) {
              window.clearTimeout(notificationTimeoutRef.current)
              notificationTimeoutRef.current = null
            }

            setRequest(undefined)
            if (!editorRef.current) return

            const targetBufferIdStr = targetBufferId.toString()
            if (executionRefs.current[targetBufferIdStr] && editorRef.current) {
              delete executionRefs.current[targetBufferIdStr][parentQueryKey]
              if (
                Object.keys(executionRefs.current[targetBufferIdStr]).length ===
                0
              ) {
                cleanupExecutionRefs(targetBufferId)
              }
            }

            if (request.selection) {
              const model = editorRef.current.getModel()
              if (model) {
                const targetBufferIdStr = targetBufferId.toString()
                if (!executionRefs.current[targetBufferIdStr]) {
                  executionRefs.current[targetBufferIdStr] = {}
                }

                const queryStartOffset = getQueryStartOffset(
                  editorRef.current,
                  request,
                )
                executionRefs.current[targetBufferIdStr][parentQueryKey] = {
                  success: true,
                  selection: request.selection,
                  queryText: parentQuery,
                  startOffset: queryStartOffset,
                  endOffset:
                    queryStartOffset + normalizeQueryText(parentQuery).length,
                }
              }
            }

            dispatch(actions.query.stopRunning())
            questExecution.releaseExecution(parentQueryKey)
            dispatch(actions.query.setResult(result))

            if (
              result.type === QuestDB.Type.DDL ||
              result.type === QuestDB.Type.DML
            ) {
              dispatch(
                actions.query.addNotification(
                  {
                    query: parentQueryKey,
                    isExplain: isRunningExplain,
                    content: <QueryInNotification query={queryToRun} />,
                  },
                  targetBufferId,
                ),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.NOTICE) {
              dispatch(
                actions.query.addNotification(
                  {
                    query: parentQueryKey,
                    isExplain: isRunningExplain,
                    content: (
                      <Text color="foreground" ellipsis title={queryToRun}>
                        {result.notice}
                        {queryToRun !== undefined &&
                          queryToRun !== "" &&
                          `: ${queryToRun}`}
                      </Text>
                    ),
                    sideContent: <QueryInNotification query={queryToRun} />,
                    type: NotificationType.NOTICE,
                  },
                  targetBufferId,
                ),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.DQL) {
              setLastExecutedQuery(queryToRun)
              dispatch(
                actions.query.addNotification(
                  {
                    query: parentQueryKey,
                    isExplain: isRunningExplain,
                    jitCompiled: result.explain?.jitCompiled ?? false,
                    content: (
                      <QueryResult
                        {...result.timings}
                        rowCount={result.count}
                      />
                    ),
                    sideContent: <QueryInNotification query={queryToRun} />,
                  },
                  targetBufferId,
                ),
              )
              eventBus.publish(EventType.MSG_QUERY_DATASET, result)
            }
          })
          .catch((error: ErrorResult) => {
            if (notificationTimeoutRef.current) {
              window.clearTimeout(notificationTimeoutRef.current)
              notificationTimeoutRef.current = null
            }

            setRequest(undefined)
            dispatch(actions.query.stopRunning())
            questExecution.releaseExecution(parentQueryKey)

            if (editorRef?.current && monacoRef?.current) {
              // For error positioning, we need to use the original request (without EXPLAIN prefix)
              // but adjust the error position if it was an EXPLAIN query
              let adjustedErrorPosition = error.position
              if (isRunningExplain) {
                // Adjust error position to account for removed "EXPLAIN " prefix
                adjustedErrorPosition = Math.max(0, error.position - 8)
              }
              if (request.selection) {
                adjustedErrorPosition += parentQuery.indexOf(
                  request.selection.queryText,
                )
              }

              const errorRange = getErrorRange(
                editorRef.current,
                request,
                adjustedErrorPosition,
              )

              const errorToStore = { ...error, position: adjustedErrorPosition }

              // Use the already-defined parentQueryKey instead of recalculating it here
              const targetBufferIdStr = targetBufferId.toString()
              if (!executionRefs.current[targetBufferIdStr]) {
                executionRefs.current[targetBufferIdStr] = {}
              }

              const startOffset = getQueryStartOffset(
                editorRef.current,
                request,
              )
              executionRefs.current[targetBufferIdStr][parentQueryKey] = {
                error: errorToStore,
                selection: request.selection,
                queryText: parentQuery,
                startOffset,
                endOffset: startOffset + normalizeQueryText(parentQuery).length,
              }

              if (errorRange) {
                editorRef?.current.focus()

                if (!request.selection) {
                  editorRef?.current.setPosition({
                    lineNumber: errorRange.startLineNumber,
                    column: errorRange.startColumn,
                  })
                }

                editorRef?.current.revealPosition({
                  lineNumber: errorRange.startLineNumber,
                  column: errorRange.endColumn,
                })
              }

              dispatch(
                actions.query.addNotification(
                  {
                    query: parentQueryKey,
                    isExplain: isRunningExplain,
                    content: <Text color="red">{error.error}</Text>,
                    sideContent: <QueryInNotification query={queryToRun} />,
                    type: NotificationType.ERROR,
                  },
                  targetBufferId,
                ),
              )
            }
          })
          .finally(() => {
            if (!scriptConfirmationOpenRef.current) {
              executePendingAction()
            }
          })
        setRequest(request)
      } else {
        dispatch(actions.query.stopRunning())
        questExecution.cancelActive()
      }
    } else if (running === RunningType.SCRIPT) {
      const scriptQueryKey: QueryKey = `${activeBufferRef.current.label}@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`
      scriptQueryKeyRef.current = scriptQueryKey
      questExecution.markActive(
        activeBufferRef.current.id as number,
        scriptQueryKey,
      )
      void handleRunScript()
    } else if (running === RunningType.NONE && isRunningScriptRef.current) {
      if (editorQueryIdRef.current !== null) {
        quest.abort(editorQueryIdRef.current)
        editorQueryIdRef.current = null
      }
      if (scriptQueryKeyRef.current !== null) {
        questExecution.releaseExecution(scriptQueryKeyRef.current)
        scriptQueryKeyRef.current = null
      }
      scriptStopRef.current = true
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
    }
  }, [running])

  useEffect(() => {
    requestRef.current = request
    if (monacoRef?.current && editorRef?.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
    editorRef.current?.updateOptions({ readOnly: !!request })
  }, [request])

  const setCompletionProvider = useCallback(() => {
    if (editorReady && monacoRef?.current && editorRef?.current) {
      schemaCompletionHandle?.dispose()
      setRefreshingTables(true)
      setSchemaCompletionHandle(
        monacoRef.current.languages.registerCompletionItemProvider(
          QuestDBLanguageName,
          createSchemaCompletionProvider(tables, columns),
        ),
      )
      setRefreshingTables(false)
    }
  }, [editorReady, schemaCompletionHandle, tables, columns])

  useEffect(() => {
    if (!refreshingTables) {
      setCompletionProvider()
    }
  }, [tables, columns, monacoRef, editorReady])

  useEffect(() => {
    activeBufferRef.current = activeBuffer
    currentBufferValueRef.current = activeBuffer.value
    if (monacoRef.current && editorRef.current) {
      clearModelMarkers(monacoRef.current, editorRef.current)

      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)

      // Restore cached validation markers for this buffer
      applyValidationMarkers(
        monacoRef.current,
        editorRef.current,
        activeBuffer.id as number,
      )
    }
  }, [activeBuffer])

  useEffect(() => {
    findQueryByConversationIdRef.current = findQueryByConversationId
    shiftQueryKeysForBufferRef.current = shiftQueryKeysForBuffer
  }, [findQueryByConversationId, shiftQueryKeysForBuffer])

  useEffect(() => {
    hasConversationForQueryRef.current = hasConversationForQuery
    if (monacoRef.current && editorRef.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [hasConversationForQuery])

  useEffect(() => {
    const oldIsBlocking = isBlockingAIStatusRef.current
    const newIsBlocking = isBlockingAIStatus(aiStatus) ?? false
    isBlockingAIStatusRef.current = newIsBlocking
    if (
      monacoRef.current &&
      editorRef.current &&
      newIsBlocking !== oldIsBlocking
    ) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [aiStatus])

  useEffect(() => {
    window.addEventListener("focus", setCompletionProvider)
    return () => {
      window.removeEventListener("focus", setCompletionProvider)
    }
  }, [setCompletionProvider])

  useEffect(() => {
    const handler = (conversationId: unknown) => {
      if (!editorRef.current) return
      const model = editorRef.current.getModel()
      if (!model) return

      const queryInfo = findQueryByConversationIdRef.current(
        conversationId as ConversationId,
      )
      if (!queryInfo) return
      const { queryKey, bufferId } = queryInfo
      if (activeBufferRef.current.id !== bufferId) return
      const startOffset = parseQueryKey(queryKey).startOffset
      const lineNumber = model.getPositionAt(startOffset).lineNumber
      highlightedLineNumberRef.current = lineNumber
    }

    eventBus.subscribe(EventType.AI_QUERY_HIGHLIGHT, handler)

    return () => {
      eventBus.unsubscribe(EventType.AI_QUERY_HIGHLIGHT, handler)
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupActionsRef.current.forEach((cleanup) => cleanup())
      if (cursorChangeTimeoutRef.current) {
        window.clearTimeout(cursorChangeTimeoutRef.current)
      }

      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }

      if (notificationTimeoutRef.current) {
        window.clearTimeout(notificationTimeoutRef.current)
      }

      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
        clearValidationMarkers(
          monacoRef.current,
          editorRef.current,
          activeBufferRef.current.id as number,
        )
      }

      glyphWidgetsRef.current.forEach((widget) => {
        editorRef.current?.removeGlyphMarginWidget(widget)
      })
      glyphWidgetsRef.current.clear()

      editorRef.current?.getModel()?.dispose()
      editorRef.current?.dispose()
      editorRef.current = null
      monacoRef.current = null
    }
  }, [])

  return (
    <>
      <Content $hidden={hidden}>
        {!hidden && (
          <ButtonBar
            onTriggerRunScript={handleTriggerRunScript}
            isTemporary={activeBuffer.isTemporary}
          />
        )}
        <EditorWrapper>
          <Editor
            defaultLanguage={QuestDBLanguageName}
            onMount={onMount}
            saveViewState={false}
            onChange={handleBufferContentChange}
            options={{
              // initially null, but will be set during onMount with editor.setModel
              model: null,
              fixedOverflowWidgets: true,
              fontSize: 14,
              lineHeight: 24,
              fontFamily: theme.fontMonospace,
              glyphMargin: true,
              renderLineHighlight: "gutter",
              useShadowDOM: false,
              minimap: {
                enabled: false,
              },
              stickyScroll: {
                enabled: false,
              },
              scrollbar: {
                useShadows: false,
              },
              selectOnLineNumbers: false,
              scrollBeyondLastLine: false,
              tabSize: 2,
              lineNumbersMinChars,
              wordBasedSuggestions: "off",
            }}
            theme="dracula"
          />
        </EditorWrapper>
        <Loader show={!!request || !tables} />
      </Content>

      <QueryDropdown
        open={dropdownOpen}
        onOpenChange={(open) => {
          setDropdownOpen(open)
          if (!open) {
            dropdownPositionRef.current = null
            dropdownQueriesRef.current = []
            isContextMenuDropdownRef.current = false
            isAIDropdownRef.current = false
          }
        }}
        positionRef={dropdownPositionRef}
        queriesRef={dropdownQueriesRef}
        isContextMenuRef={isContextMenuDropdownRef}
        isAIDropdownRef={isAIDropdownRef}
        onRunQuery={handleRunQuery}
        onExplainQuery={handleExplainQuery}
        onAskAIRef={handleAskAIRef}
      />

      <Dialog.Root
        open={scriptConfirmationOpen}
        onOpenChange={handleToggleDialog}
      >
        <Dialog.Portal>
          <ForwardRef>
            <Overlay primitive={Dialog.Overlay} />
          </ForwardRef>

          <Dialog.Content
            onEscapeKeyDown={handleCloseDialog}
            onInteractOutside={handleCloseDialog}
          >
            <Dialog.Title>Run all queries</Dialog.Title>

            <DialogDescription>
              {pendingActionRef.current && (
                <Box
                  margin="0 0 1rem 0"
                  gap="0.8rem"
                  data-hook="run-all-queries-warning"
                >
                  <ErrorIcon size="16px" color={theme.color.orange} />
                  <Text color="orange">
                    Current query execution will be aborted.
                  </Text>
                </Box>
              )}
              <Text color="foreground">
                You are about to run all queries in this tab. This action may
                modify or delete your data permanently.
              </Text>
              <Box gap="1rem" margin="1.6rem 0">
                <label
                  htmlFor="stop-after-failure"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  <Checkbox
                    defaultChecked={stopAfterFailureRef.current}
                    onChange={(e) => {
                      stopAfterFailureRef.current = e.target.checked
                    }}
                    id="stop-after-failure"
                    data-hook="stop-after-failure-checkbox"
                  />
                  <Text color="foreground">
                    Stop running after a failed query
                  </Text>
                </label>
              </Box>
            </DialogDescription>

            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <DialogButton skin="secondary" onClick={handleCloseDialog}>
                  Cancel
                </DialogButton>
              </Dialog.Close>

              <DialogButton
                skin="primary"
                data-hook="run-all-queries-confirm"
                onClick={handleConfirmRunScript}
              >
                Run all queries
              </DialogButton>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export default MonacoEditor
