import Editor from "@monaco-editor/react"
import type { Monaco } from "@monaco-editor/react"
import { loader } from "@monaco-editor/react"
import { Box, Button, Checkbox, Dialog, ForwardRef, Overlay } from "@questdb/react-components"
import { Stop } from "@styled-icons/remix-line"
import type { editor, IDisposable } from "monaco-editor"
import React, { useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import type { ExecutionRefs } from "../../Editor"
import { PaneContent, Text } from "../../../components"
import { formatTiming } from "../QueryResult"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { QuestContext, useEditor } from "../../../providers"
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
import dracula from "./dracula"
import { registerEditorActions, registerLanguageAddons } from "./editor-addons"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"
import { QueryInNotification } from "./query-in-notification"
import { createSchemaCompletionProvider } from "./questdb-sql"
import { Request } from "./utils"
import {
  appendQuery,
  clearModelMarkers,
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
  setErrorMarkerForQuery,
  getQueryStartOffset,
  getQueriesToRun,
  getQueriesStartingFromLine,
} from "./utils"
import { toast } from "../../../components/Toast"
import ButtonBar from "../ButtonBar"
import { QueryDropdown } from "./QueryDropdown"

type IndividualQueryResult = {
  success: boolean,
  result?: QuestDB.QueryRawResult
  notification: Partial<NotificationShape> & { content: ReactNode, query: QueryKey } | null
}

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

export const LINE_NUMBER_HARD_LIMIT = 99999

const Content = styled(PaneContent)`
  position: relative;
  overflow: hidden;
  background: #2c2e3d;

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

  .cursorQueryGlyph,
  .cancelQueryGlyph {
    margin-left: 2rem;
    z-index: 1;
    cursor: pointer;

    &:after {
      display: block;
      content: "";
      width: 22px;
      height: 22px;
      background-repeat: no-repeat;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGFyaWEtaGlkZGVuPSJ0cnVlIiBmb2N1c2FibGU9ImZhbHNlIiBmaWxsPSIjNTBmYTdiIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJTdHlsZWRJY29uQmFzZS1zYy1lYTl1bGotMCBrZkRiTmwiPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiPjwvcGF0aD48cGF0aCBkPSJNMTYuMzk0IDEyIDEwIDcuNzM3djguNTI2TDE2LjM5NCAxMnptMi45ODIuNDE2TDguNzc3IDE5LjQ4MkEuNS41IDAgMCAxIDggMTkuMDY2VjQuOTM0YS41LjUgMCAwIDEgLjc3Ny0uNDE2bDEwLjU5OSA3LjA2NmEuNS41IDAgMCAxIDAgLjgzMnoiPjwvcGF0aD48L3N2Zz4K");
      transform: scale(1.1);
    }
    &:hover:after {
      filter: brightness(1.3);
    }
  }

  .cursorQueryGlyph.success-glyph:after {
    background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgICA8ZGVmcz4KICAgICAgICA8Y2xpcFBhdGggaWQ9ImNsaXAwIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiLz48L2NsaXBQYXRoPgogICAgPC9kZWZzPgogICAgPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwKSI+CiAgICAgICAgPHBhdGggZD0iTTggNC45MzR2MTQuMTMyYzAgLjQzMy40NjYuNzAyLjgxMi40ODRsMTAuNTYzLTcuMDY2YS41LjUgMCAwIDAgMC0uODMyTDguODEyIDQuNjE2QS41LjUgMCAwIDAgOCA0LjkzNFoiIGZpbGw9IiM1MGZhN2IiLz4KICAgICAgICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiMwMGFhM2IiLz4KICAgICAgICA8cGF0aCBkPSJtMTUgOC41IDIgMiA0LTQiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGZpbGw9Im5vbmUiLz4KICAgIDwvZz4KPC9zdmc+");
  }

  .cursorQueryGlyph.error-glyph:after {
    background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgICA8ZGVmcz4KICAgICAgICA8Y2xpcFBhdGggaWQ9ImNsaXAwIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiLz48L2NsaXBQYXRoPgogICAgPC9kZWZzPgogICAgPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwKSI+CiAgICAgICAgPHBhdGggZD0iTTggNC45MzR2MTQuMTMyYzAgLjQzMy40NjYuNzAyLjgxMi40ODRsMTAuNTYzLTcuMDY2YS41LjUgMCAwIDAgMC0uODMyTDguODEyIDQuNjE2QS41LjUgMCAwIDAgOCA0LjkzNFoiIGZpbGw9IiM1MGZhN2IiLz4KICAgICAgICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiNmZjU1NTUiLz4KICAgICAgICA8cmVjdCB4PSIxNyIgeT0iNCIgd2lkdGg9IjIiIGhlaWdodD0iNSIgZmlsbD0id2hpdGUiIHJ4PSIwLjUiLz4KICAgICAgICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjExIiByPSIxIiBmaWxsPSJ3aGl0ZSIvPgogICAgPC9nPgo8L3N2Zz4=");
  }

  .cancelQueryGlyph {
    &:after {
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGFyaWEtaGlkZGVuPSJ0cnVlIiBmb2N1c2FibGU9ImZhbHNlIiBmaWxsPSIjZmY1NTU1IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJTdHlsZWRJY29uQmFzZS1zYy1lYTl1bGotMCBqQ2hkR0siPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiPjwvcGF0aD48cGF0aCBkPSJNNyA3djEwaDEwVjdIN3pNNiA1aDEyYTEgMSAwIDAgMSAxIDF2MTJhMSAxIDAgMCAxLTEgMUg2YTEgMSAwIDAgMS0xLTFWNmExIDEgMCAwIDEgMS0xeiI+PC9wYXRoPjwvc3ZnPgo=");
    }

    &:hover:after {
      filter: brightness(1.3);
    }
  }
`

const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

const StyledDialogDescription = styled(Dialog.Description)`
  font-size: 1.4rem;
`

const StyledDialogButton = styled(Button)`
  padding: 1.2rem 0.6rem;
  font-size: 1.4rem;

  &:focus {
    outline: 1px solid ${({ theme }) => theme.color.foreground};
  }
`

const DEFAULT_LINE_CHARS = 5

const MonacoEditor = ({ executionRefs }: { executionRefs: React.MutableRefObject<ExecutionRefs> }) => {
  const editorContext = useEditor()
  const {
    buffers,
    editorRef,
    monacoRef,
    insertTextAtCursor,
    activeBuffer,
    updateBuffer,
    editorReadyTrigger,
  } = editorContext
  const { quest } = useContext(QuestContext)
  const [request, setRequest] = useState<Request | undefined>()
  const [editorReady, setEditorReady] = useState<boolean>(false)
  const [lastExecutedQuery, setLastExecutedQuery] = useState("")
  const [refreshingTables, setRefreshingTables] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [scriptConfirmationOpen, setScriptConfirmationOpen] = useState(false)
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)
  const activeNotification = useSelector(selectors.query.getActiveNotification)
  const queryNotifications = useSelector(selectors.query.getQueryNotificationsForBuffer(activeBuffer.id as number))
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
  const isRunningScriptRef = useRef(false)
  const queryOffsetsRef = useRef<{ startOffset: number, endOffset: number }[] | null>([])
  const queriesToRunRef = useRef<Request[]>([])
  const scriptStopRef = useRef(false)
  const stopAfterFailureRef = useRef(true)
  const lineMarkingDecorationIdsRef = useRef<string[]>([])
  const runningValueRef = useRef(running)
  const activeBufferRef = useRef(activeBuffer)
  const requestRef = useRef(request)
  const queryNotificationsRef = useRef(queryNotifications)
  const activeNotificationRef = useRef(activeNotification)
  const contentJustChangedRef = useRef(false)
  const cursorChangeTimeoutRef = useRef<number | null>(null)
  const decorationCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const visibleLinesRef = useRef<{ startLine: number; endLine: number }>({ startLine: 1, endLine: 1 })
  const scrollTimeoutRef = useRef<number | null>(null)
  const notificationTimeoutRef = useRef<number | null>(null)
  const targetPositionRef = useRef<{ lineNumber: number; column: number } | null>(null)
  const currentBufferValueRef = useRef<string | undefined>(activeBuffer.value)
  const dropdownPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dropdownQueriesRef = useRef<Request[]>([])
  const isContextMenuDropdownRef = useRef<boolean>(false)

  // Set the initial line number width in chars based on the number of lines in the active buffer
  const [lineNumbersMinChars, setLineNumbersMinChars] = useState(
    DEFAULT_LINE_CHARS +
    activeBuffer.value.split("\n").length.toString().length -
    1,
  )

  const toggleRunning = (runningType?: RunningType) => {
    dispatch(actions.query.toggleRunning(runningType))
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
    const queriesOnLine = getQueriesStartingFromLine(editorRef.current!, lineNumber, queryOffsetsRef.current || [])
    const queriesToRun = queriesToRunRef.current || []
    
    const selectionsOnLine = queriesToRun.filter(query => 
      query.selection && query.row + 1 === lineNumber
    )
    const nonSelectedQueries = queriesOnLine.filter(query => !selectionsOnLine.some(q => q.row === query.row && q.column === query.column && q.endRow === query.endRow && q.endColumn === query.endColumn))
    return [...nonSelectedQueries, ...selectionsOnLine].sort((a, b) => a.column - b.column)
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
        endColumn: endPosition.column
      })
    } else {
      editor.setPosition({
        lineNumber: query.row + 1,
        column: query.column
      })
    }
  }

  const openDropdownAtPosition = (posX: number, posY: number, targetPosition: { lineNumber: number; column: number }, isContextMenu: boolean = false) => {
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
        
        const yPosition = containerRect.top + (lineNumber - 1) * lineHeight - scrollTop + lineHeight / 2 + 5
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

  const beforeMount = (monaco: Monaco) => {
    registerLanguageAddons(monaco)

    monaco.editor.defineTheme("dracula", dracula)
  }

  const handleEditorClick = (e: React.MouseEvent) => {
    if (isRunningScriptRef.current && e.target instanceof Element && e.target.classList.contains("cursorQueryGlyph")) {
      return
    }
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return

    if (e.target instanceof Element && e.target.classList.contains("cancelQueryGlyph")) {
      toggleRunning(RunningType.NONE)
      return
    }

    if (e.target instanceof Element && e.target.classList.contains("cursorQueryGlyph")) {  
      editor.focus()
      const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
      
      if (target && target.position) {
        const position = {
          lineNumber: target.position.lineNumber,
          column: 1
        }   
        const dropdownQueries = getDropdownQueries(position.lineNumber)
        if (dropdownQueries.length > 1) {
          dropdownQueriesRef.current = dropdownQueries
          openDropdownAtPosition(e.clientX, e.clientY, position, false)
          return
        }
        if (dropdownQueries.length === 1) {
          setCursorBeforeRunning(dropdownQueries[0])
          toggleRunning()
        }
      }
    }
  }

  const handleRunQuery = (query?: Request) => {
    setDropdownOpen(false)

    if (query) {
      setCursorBeforeRunning(query)
    } else if (targetPositionRef.current) {
      editorRef.current?.setPosition(targetPositionRef.current)
    }
    
    toggleRunning()
  }

  const handleExplainQuery = (query?: Request) => {
    setDropdownOpen(false)
    if (query) {
      setCursorBeforeRunning(query)
    } else if (targetPositionRef.current) {
      editorRef.current?.setPosition(targetPositionRef.current)
    }
    
    toggleRunning(RunningType.EXPLAIN)
  }

  const applyLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor,
    source?: string
  ) => {
    const model = editor.getModel()
    const editorValue = editor.getValue()

    if (!editorValue || !model) {
      return
    }
    
    const queryAtCursor = getQueryFromCursor(editor)
    const activeBufferId = activeBufferRef.current.id as number
    
    const lineMarkingDecorations: editor.IModelDeltaDecoration[] = []
    const bufferExecutions = executionRefs.current[activeBufferId] || {}
    
    if (queryAtCursor) {
      const queryKey = createQueryKeyFromRequest(editor, queryAtCursor)
      const queryExecutionBuffer = bufferExecutions[queryKey]
      const hasError = queryExecutionBuffer && queryExecutionBuffer.error !== undefined
      const startLineNumber = queryAtCursor.row + 1
      const endLineNumber = queryAtCursor.endRow + 1

      if (queryExecutionBuffer && queryExecutionBuffer.selection) {
        const startPosition = model.getPositionAt(queryExecutionBuffer.selection.startOffset)
        const endPosition = model.getPositionAt(queryExecutionBuffer.selection.endOffset)
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
            className: isError ? 'selectionErrorHighlight' : isSuccess ? 'selectionSuccessHighlight' : 'selectionErrorHighlight',
          }
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
        }
      })
    }
    
    const newLineMarkingIds = editor.deltaDecorations(
      lineMarkingDecorationIdsRef.current,
      lineMarkingDecorations
    )
    lineMarkingDecorationIdsRef.current = newLineMarkingIds
    if (!["scroll", "script"].includes(source ?? "") && !isRunningScriptRef.current) {
      updateQueryNotification(queryAtCursor ? createQueryKeyFromRequest(editor, queryAtCursor) : undefined)
    }
    if (bufferExecutions) {
      setErrorMarkerForQuery(monaco, editor, bufferExecutions, queryAtCursor)
    }
  }

  const applyGlyphsAndLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor,
    source?: string
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
      const endPosition = { lineNumber: endLine, column: editor.getModel()?.getLineMaxColumn(endLine) ?? 1 }
      
      queries = getQueriesInRange(editor, startPosition, endPosition)
    }
    
    const activeBufferId = activeBufferRef.current.id as number

    const allDecorations: editor.IModelDeltaDecoration[] = []
    const allQueryOffsets: { startOffset: number, endOffset: number }[] = []
    
    // Add decorations for queries in range
    if (queries.length > 0) {
      queries.forEach(query => {
        const queryOffsets = {
          startOffset: model.getOffsetAt({ lineNumber: query.row + 1, column: query.column }),
          endOffset: model.getOffsetAt({ lineNumber: query.endRow + 1, column: query.endColumn })
        }
        allQueryOffsets.push(queryOffsets)
        const bufferExecutions = executionRefs.current[activeBufferId] || {}
        const queryKey = createQueryKeyFromRequest(editor, query)
        const queryExecutionBuffer = bufferExecutions[queryKey]
        const hasError = queryExecutionBuffer && queryExecutionBuffer.error !== undefined
        const isSuccessful = queryNotificationsRef.current?.[queryKey]?.latest?.type === NotificationType.SUCCESS
        
        // Convert 0-based row to 1-based line number for Monaco
        const startLineNumber = query.row + 1
        
        // Add glyph for all queries with line number in class name
        const glyphClassName =
          runningValueRef.current !== RunningType.NONE &&
            requestRef.current?.row !== undefined &&
            requestRef.current?.row + 1 === startLineNumber
            ? `cancelQueryGlyph cancelQueryGlyph-line-${startLineNumber}`
            : hasError
            ? `cursorQueryGlyph error-glyph cursorQueryGlyph-line-${startLineNumber}`
            : isSuccessful
            ? `cursorQueryGlyph success-glyph cursorQueryGlyph-line-${startLineNumber}`
            : `cursorQueryGlyph cursorQueryGlyph-line-${startLineNumber}`
        
        allDecorations.push({
          range: new monaco.Range(
            startLineNumber,
            1,
            startLineNumber,
            1
          ),
          options: {
            isWholeLine: false,
            glyphMarginClassName: glyphClassName,
          },
        })
      })
    }

    if (decorationCollectionRef.current) {
      decorationCollectionRef.current.clear()
    }
    
    decorationCollectionRef.current = editor.createDecorationsCollection(allDecorations)
    queryOffsetsRef.current = allQueryOffsets
    
    applyLineMarkings(monaco, editor, source)
  }

  const onMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    monaco.editor.setTheme("dracula")
    editor.updateOptions({ 
      find: {
        addExtraSpaceOnTop: false,
      }
    })
    editor.setModel(
      monaco.editor.createModel(activeBuffer.value, QuestDBLanguageName),
    )
    setEditorReady(true)
    editorReadyTrigger(editor)

    // Support legacy bus events for non-react codebase
    registerLegacyEventBusEvents({ editor, insertTextAtCursor, toggleRunning })
    registerEditorActions({
      editor,
      monaco,
      runQuery: () => {
        if (runningValueRef.current === RunningType.NONE) {
          if (queriesToRunRef.current.length === 1) {
            toggleRunning()
          } else if (queriesToRunRef.current.length > 1) {
            handleTriggerRunScript()
          }
        }
      },
      runScript: () => {
        if (runningValueRef.current === RunningType.NONE) {
          handleTriggerRunScript(true)
        }
      },
      editorContext,
    })
    
    editor.onContextMenu((e) => {
      if (e.target.element && e.target.element.classList.contains("cursorQueryGlyph")) {
        const posX = e.event.posx, posY = e.event.posy
        if (editorRef.current) {
          const target = editorRef.current.getTargetAtClientPoint(posX, posY)
          
          if (target && target.position) {
            const linePosition = { lineNumber: target.position.lineNumber, column: 1 }
            
            const dropdownQueries = getDropdownQueries(linePosition.lineNumber)
            
            if (dropdownQueries.length > 0) {
              dropdownQueriesRef.current = dropdownQueries
              openDropdownAtPosition(posX, posY, linePosition, true)
            }
          }
        }
      }
    })

    editor.onDidChangeCursorPosition((e) => {
      // To ensure the fixed position of the "run query" glyph we adjust the width of the line count element.
      // This width is represented in char numbers.
      const lineCount = editorRef.current?.getModel()?.getLineCount()
      if (lineCount) {
        setLineNumbersMinChars(
          DEFAULT_LINE_CHARS + (lineCount.toString().length - 1),
        )
      }
      
      if (contentJustChangedRef.current) {
        return
      }
      
      if (cursorChangeTimeoutRef.current) {
        window.clearTimeout(cursorChangeTimeoutRef.current);
      }
      
      cursorChangeTimeoutRef.current = window.setTimeout(() => {
        const queriesToRun = getQueriesToRun(editor, queryOffsetsRef.current ?? [])
        queriesToRunRef.current = queriesToRun
        dispatch(actions.query.setQueriesToRun(queriesToRun))

        if (monacoRef.current && editorRef.current) {
          applyLineMarkings(monaco, editor, e.source)
        }
        cursorChangeTimeoutRef.current = null
      }, 50);
    })

    editor.onDidChangeModelContent((e) => {
      const model = editor.getModel()
      if (!model) return
      
      contentJustChangedRef.current = true
      
      const activeBufferId = activeBufferRef.current.id as number
      const bufferExecutions = executionRefs.current[activeBufferId]
      
      const notificationUpdates: Array<() => void> = []

      if (bufferExecutions) {
        const keysToUpdate: Array<{ oldKey: QueryKey, newKey: QueryKey, data: any }> = []
        const keysToRemove: QueryKey[] = []
        
        Object.keys(bufferExecutions).forEach((key) => {
          const queryKey = key as QueryKey
          const { queryText, startOffset, endOffset } = bufferExecutions[queryKey]

          const effectiveOffsetDelta = e.changes
            .filter(change => change.rangeOffset < endOffset)
            .reduce((acc, change) => acc + change.text.length - change.rangeLength, 0)
          
          if (effectiveOffsetDelta === 0) {
            return
          }

          const newOffset = startOffset + effectiveOffsetDelta
          if (validateQueryAtOffset(editor, queryText, newOffset)) {
            const selection = bufferExecutions[queryKey].selection
            const shiftedSelection = selection ? {
              startOffset: selection.startOffset + effectiveOffsetDelta,
              endOffset: selection.endOffset + effectiveOffsetDelta
            } : undefined
            keysToUpdate.push({
              oldKey: queryKey,
              newKey: createQueryKey(queryText, newOffset),
              data: { ...bufferExecutions[queryKey], startOffset: newOffset, endOffset: endOffset + effectiveOffsetDelta, selection: shiftedSelection }
            })
          } else {
            keysToRemove.push(queryKey)
            notificationUpdates.push(() => dispatch(actions.query.removeNotification(queryKey, activeBufferId)))
          }
        })
        
        keysToRemove.forEach(key => {
          delete bufferExecutions[key]
        })

        keysToUpdate.forEach(({ oldKey, newKey, data }) => {
          delete bufferExecutions[oldKey]
          bufferExecutions[newKey] = data
          notificationUpdates.push(() => dispatch(actions.query.updateNotificationKey(oldKey, newKey, activeBufferId)))
        })
      }

      const currentNotifications = queryNotificationsRef.current || {}
      Object.keys(currentNotifications).forEach((key) => {
        const queryKey = key as QueryKey
        const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
        const effectiveOffsetDelta = e.changes
          .filter(change => change.rangeOffset < endOffset)
          .reduce((acc, change) => acc + change.text.length - change.rangeLength, 0)

        if (effectiveOffsetDelta === 0) {
          return
        }

        const newOffset = startOffset + effectiveOffsetDelta

        if (validateQueryAtOffset(editor, queryText, newOffset)) {
          const newKey = createQueryKey(queryText, newOffset)
          notificationUpdates.push(() => dispatch(actions.query.updateNotificationKey(queryKey, newKey, activeBufferId)))
        } else {
          notificationUpdates.push(() => dispatch(actions.query.removeNotification(queryKey, activeBufferId)))
        }
      })

      if (bufferExecutions && Object.keys(bufferExecutions).length === 0) {
        delete executionRefs.current[activeBufferId]
      }
      executionRefs.current[activeBufferId] = bufferExecutions

      applyGlyphsAndLineMarkings(monaco, editor)

      const queriesToRun = getQueriesToRun(editor, queryOffsetsRef.current ?? [])
      queriesToRunRef.current = queriesToRun
      dispatch(actions.query.setQueriesToRun(queriesToRun))
      
      contentJustChangedRef.current = false
      notificationUpdates.forEach(update => update())
    })

    editor.onDidChangeModel(() => {
      setTimeout(() => {
        if (monacoRef.current && editorRef.current) {
          applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
        }
      }, 10)
    })

    editor.onDidScrollChange((e) => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
      
      scrollTimeoutRef.current = window.setTimeout(() => {
        const visibleRanges = editor.getVisibleRanges()
        if (visibleRanges.length > 0) {
          const firstRange = visibleRanges[0]
          
          const newVisibleLines = {
            startLine: firstRange.startLineNumber,
            endLine: firstRange.endLineNumber
          }
          
          // Check if visible range has changed significantly (more than 100 lines)
          const oldVisibleLines = visibleLinesRef.current
          const startLineDiff = Math.abs(newVisibleLines.startLine - oldVisibleLines.startLine)
          const endLineDiff = Math.abs(newVisibleLines.endLine - oldVisibleLines.endLine)
          
          visibleLinesRef.current = newVisibleLines
          
          if (startLineDiff > 100 || endLineDiff > 100) {
            if (monacoRef.current && editorRef.current) {
              applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current, "scroll")
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
    if (query && model) {
      const trimmedQuery = query.trim()
      // Find if the query is already in the editor
      const matches = findMatches(model, trimmedQuery)
      if (matches && matches.length > 0) {
        editor.setSelection(matches[0].range)
        // otherwise, append the query
      } else {
        appendQuery(editor, trimmedQuery, { appendAt: "end" })
        const newValue = editor.getValue()
        updateBuffer(activeBuffer.id as number, { value: newValue })
      }
    }

    const initialVisibleRanges = editor.getVisibleRanges()
    if (initialVisibleRanges.length > 0) {
      const firstRange = initialVisibleRanges[0]
      
      visibleLinesRef.current = {
        startLine: firstRange.startLineNumber,
        endLine: firstRange.endLineNumber
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
    }
  }

  const runIndividualQuery = async (query: Request, isLast: boolean): Promise<IndividualQueryResult> => {
    const editor = editorRef.current
    const model = editorRef.current?.getModel()
    if (!editor || !model) {
      return {
        success: false,
        notification: null,
        result: undefined,
      }
    }

    const effectiveQueryText = query.selection ? query.selection.queryText : query.query
    const queryKey = createQueryKeyFromRequest(editor, query)
    const activeBufferId = activeBuffer.id as number
    let notification: Partial<NotificationShape> & { content: ReactNode, query: QueryKey } | null = null
    dispatch(actions.query.setResult(undefined))

    try {
      const result = await quest.queryRaw(normalizeQueryText(effectiveQueryText), { limit: "0,1000", explain: true })

      if (executionRefs.current[activeBufferId]) {
        delete executionRefs.current[activeBufferId][queryKey]
        if (Object.keys(executionRefs.current[activeBufferId]).length === 0) {
          delete executionRefs.current[activeBufferId]
        }
      }

      if (result.type === QuestDB.Type.DDL || result.type === QuestDB.Type.DML) {
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
              {effectiveQueryText !== undefined && effectiveQueryText !== "" && `: ${effectiveQueryText}`}
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
        if (!executionRefs.current[activeBufferId]) {
          executionRefs.current[activeBufferId] = {}
        }
        
        const queryStartOffset = getQueryStartOffset(editor, query)
        executionRefs.current[activeBufferId][queryKey] = {
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
        
      if (!executionRefs.current[activeBufferId]) {
        executionRefs.current[activeBufferId] = {}
      }
      
      const startOffset = getQueryStartOffset(editor, query)
      executionRefs.current[activeBufferId][queryKey] = {
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
    } else if (running === RunningType.NONE) {
      if (runAll) {
        setScriptConfirmationOpen(true)
        return
      }

      const hasMultipleSelection = queriesToRunRef.current && queriesToRunRef.current.length > 1
      if (!hasMultipleSelection) { // Run all queries in the buffer
        setScriptConfirmationOpen(true)
      } else { // Run selected portion of each query one by one
        dispatch(actions.query.toggleRunning(RunningType.SCRIPT))
      }
    }
  }

  const handleConfirmRunScript = () => {
    setScriptConfirmationOpen(false)
    queriesToRunRef.current = []
    dispatch(actions.query.toggleRunning(RunningType.SCRIPT))
  }

  const handleToggleDialog = (open: boolean) => {
    setScriptConfirmationOpen(open)
    if (!open) {
      setTimeout(() => editorRef.current?.focus())
    }
  }

  const handleRunScript = async () => {
    let successfulQueries = 0
    let failedQueries = 0
    if (!editorRef.current) return
    const queriesToRun = queriesToRunRef.current && queriesToRunRef.current.length > 1 ? queriesToRunRef.current : undefined
    const runningAllQueries = !queriesToRun    
    // Clear all notifications & execution refs for the buffer
    const activeBufferId = activeBuffer.id as number
    if (runningAllQueries) {
      dispatch(actions.query.cleanupBufferNotifications(activeBufferId))
      if (executionRefs.current[activeBufferId]) {
        delete executionRefs.current[activeBufferId]
      }
    }
    
    isRunningScriptRef.current = true

    notificationTimeoutRef.current = window.setTimeout(() => {
      dispatch(
        actions.query.setActiveNotification({
          type: NotificationType.LOADING,
          query: `${activeBufferRef.current.label}@${0}-${0}`,
          content: (
            <Box gap="1rem" align="center">
              <Text color="foreground">Running queries...</Text>
            </Box>
          ),
          createdAt: new Date(),
        }),
      )
      notificationTimeoutRef.current = null
    }, 1000)
    const startTime = Date.now()

    const queries = queriesToRun ?? getAllQueries(editorRef.current)
    let lastQuery: Request | undefined
    let individualQueryResults: Array<IndividualQueryResult> = []

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      const result = await runIndividualQuery(query, i === queries.length - 1)
      individualQueryResults.push(result)
      if (result.success) {
        successfulQueries++
      } else {
        failedQueries++
      }
      lastQuery = query
      if (scriptStopRef.current || (failedQueries > 0 && stopAfterFailureRef.current && runningAllQueries)) {
        break
      }
    }

    const duration = (Date.now() - startTime) * 1e6

    if (notificationTimeoutRef.current) {
      window.clearTimeout(notificationTimeoutRef.current)
      notificationTimeoutRef.current = null
    }

    const lastResult = individualQueryResults[individualQueryResults.length - 1]
    if (lastResult && lastResult.result?.type === QuestDB.Type.DQL) {
      dispatch(actions.query.setResult(lastResult.result))
      eventBus.publish(EventType.MSG_QUERY_DATASET, lastResult.result)
    }

    const querySchemaMessageTypes = [QuestDB.Type.DDL, QuestDB.Type.DML, QuestDB.Type.NOTICE]
    const querySchemaMessage = individualQueryResults
      .filter(result => result && result.result)
      .find(result => result?.result?.type && querySchemaMessageTypes.includes(result.result.type))

    if (querySchemaMessage) {
      eventBus.publish(EventType.MSG_QUERY_SCHEMA, querySchemaMessage.result)
    }

    individualQueryResults
      .filter(result => result && result.notification)
      .map(result => result.notification)
      .forEach(notification => {
        dispatch(actions.query.addNotification({ ...notification!, updateActiveNotification: false }, activeBuffer.id as number))
      })

    if (editorRef.current && lastQuery) {
      const position = {
        lineNumber: lastQuery.row + 1,
        column: lastQuery.column
      }
      editorRef.current.focus()
      editorRef.current.revealPosition(position)
      if (runningAllQueries) {
        editorRef.current.setPosition(position, "script")
      }
    }

    const completedGracefully = queries.length === individualQueryResults.length
    if (completedGracefully || (failedQueries > 0 && stopAfterFailureRef.current && runningAllQueries)) {
      isRunningScriptRef.current = false
      dispatch(actions.query.stopRunning())
    }

    const notificationPrefix = completedGracefully
      ? `Running completed in ${formatTiming(duration)} with `
      : "Stopped after running "

    dispatch(
      actions.query.addNotification({
        query: `${activeBufferRef.current.label}@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`,
        content: <Text color="foreground">
          {notificationPrefix}
          {successfulQueries > 0 ? `${successfulQueries} successful` : ""}
          {successfulQueries > 0 && failedQueries > 0 ? " and " : ""}
          {failedQueries > 0 ? `${failedQueries} failed` : ""} {failedQueries + successfulQueries > 1 ? " queries" : " query"}
        </Text>,
        type: completedGracefully ? NotificationType.SUCCESS : NotificationType.ERROR,
      }, activeBufferRef.current.id as number),
    )
    isRunningScriptRef.current = false
    scriptStopRef.current = false
    stopAfterFailureRef.current = true
  }

  useEffect(() => {
    // Remove all execution information for the buffers that have been deleted
    Object.keys(executionRefs.current).map((key) => {
      if (!buffers.find((b) => b.id === parseInt(key))) {
        delete executionRefs.current[key]
      }
    })
  }, [buffers])

  useEffect(() => {
    activeNotificationRef.current = activeNotification
  }, [activeNotification])

  useEffect(() => {
    const gridNotificationKeySuffix = `@${LINE_NUMBER_HARD_LIMIT + 1}-${LINE_NUMBER_HARD_LIMIT + 1}`
    queryNotificationsRef.current = queryNotifications
    if (monacoRef.current
      && editorRef.current
      && !contentJustChangedRef.current
      && !activeNotification?.query.endsWith(gridNotificationKeySuffix)
    ) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [queryNotifications])

  useEffect(() => {
    if (running === RunningType.NONE && request) {
      quest.abort()
      dispatch(actions.query.stopRunning())
      setRequest(undefined)
    }
  }, [request, quest, dispatch, running])

  useEffect(() => {
    runningValueRef.current = running
    if (![RunningType.NONE, RunningType.SCRIPT].includes(running) && editorRef?.current) {
      if (monacoRef?.current) {
        clearModelMarkers(monacoRef.current, editorRef.current)
      }

      if (monacoRef?.current && editorRef?.current) {
        applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
      }

      const request = running === RunningType.REFRESH
        ? getQueryRequestFromLastExecutedQuery(lastExecutedQuery)
        : getQueryRequestFromEditor(editorRef.current)
      
      const isRunningExplain = running === RunningType.EXPLAIN

      if (request?.query) {
        const parentQuery = request.query
        const parentQueryKey = createQueryKeyFromRequest(editorRef.current, request)
        const originalQueryText = request.selection ? request.selection.queryText : request.query
        let queryToRun = originalQueryText
        if (isRunningExplain) {
          queryToRun = `EXPLAIN ${originalQueryText}`
        }
        
        // give the notification a slight delay to prevent flashing for fast queries
        notificationTimeoutRef.current = window.setTimeout(() => {
          if (runningValueRef.current && requestRef.current && editorRef.current) {
            dispatch(
              actions.query.addNotification({
                type: NotificationType.LOADING,
                query: parentQueryKey,
                isExplain: isRunningExplain,
                content: (
                  <Box gap="1rem" align="center">
                    <Text color="foreground">Running...</Text>
                    <CancelButton skin="error" onClick={() => toggleRunning()}>
                      <Stop size="18px" />
                    </CancelButton>
                  </Box>
                ),
                sideContent: <QueryInNotification query={queryToRun} />,
              }, activeBuffer.id as number),
            )
          }
          notificationTimeoutRef.current = null
        }, 1000)

        void quest
          .queryRaw(normalizeQueryText(queryToRun), { limit: "0,1000", explain: true })
          .then((result) => {
            if (notificationTimeoutRef.current) {
              window.clearTimeout(notificationTimeoutRef.current)
              notificationTimeoutRef.current = null
            }
            
            setRequest(undefined)
            if (!editorRef.current) return

            const activeBufferId = activeBuffer.id as number
            
            if (executionRefs.current[activeBufferId] && editorRef.current) {
              delete executionRefs.current[activeBufferId][parentQueryKey]
              if (Object.keys(executionRefs.current[activeBufferId]).length === 0) {
                delete executionRefs.current[activeBufferId]
              }
            }

            if (request.selection) {
              const model = editorRef.current.getModel()
              if (model) {
                if (!executionRefs.current[activeBufferId]) {
                  executionRefs.current[activeBufferId] = {}
                }
                
                const queryStartOffset = getQueryStartOffset(editorRef.current, request)
                executionRefs.current[activeBufferId][parentQueryKey] = {
                  success: true,
                  selection: request.selection,
                  queryText: parentQuery,
                  startOffset: queryStartOffset,
                  endOffset: queryStartOffset + normalizeQueryText(parentQuery).length,
                }
              }
            }

            dispatch(actions.query.stopRunning())
            dispatch(actions.query.setResult(result))

            if (
              result.type === QuestDB.Type.DDL ||
              result.type === QuestDB.Type.DML
            ) {
              dispatch(
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: isRunningExplain,
                  content: <QueryInNotification query={queryToRun} />,
                }, activeBuffer.id as number),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.NOTICE) {
              dispatch(
                actions.query.addNotification({
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
                }, activeBuffer.id as number),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.DQL) {
              setLastExecutedQuery(queryToRun)
              dispatch(
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: isRunningExplain,
                  jitCompiled: result.explain?.jitCompiled ?? false,
                  content: (
                    <QueryResult {...result.timings} rowCount={result.count} />
                  ),
                  sideContent: <QueryInNotification query={queryToRun} />,
                }, activeBuffer.id as number),
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

            if (editorRef?.current && monacoRef?.current) {
              // For error positioning, we need to use the original request (without EXPLAIN prefix)
              // but adjust the error position if it was an EXPLAIN query
              let adjustedErrorPosition = error.position
              if (isRunningExplain) {
                // Adjust error position to account for removed "EXPLAIN " prefix
                adjustedErrorPosition = Math.max(0, error.position - 8)
              }
              if (request.selection) {
                adjustedErrorPosition += parentQuery.indexOf(request.selection.queryText)
              }
              
              const errorRange = getErrorRange(
                editorRef.current,
                request,
                adjustedErrorPosition,
              )

              let errorToStore = { ...error, position: adjustedErrorPosition }
             
              const parentQueryKey = createQueryKeyFromRequest(editorRef.current, request)
              const activeBufferId = activeBuffer.id as number
              if (!executionRefs.current[activeBufferId]) {
                executionRefs.current[activeBufferId] = {}
              }
              
              const startOffset = getQueryStartOffset(editorRef.current, request)  
              executionRefs.current[activeBufferId][parentQueryKey] = {
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
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: isRunningExplain,
                  content: <Text color="red">{error.error}</Text>,
                  sideContent: <QueryInNotification query={queryToRun} />,
                  type: NotificationType.ERROR,
                }, activeBuffer.id as number),
              )
            }
          })
        setRequest(request)
      } else {
        dispatch(actions.query.stopRunning())
      }
    } else if (running === RunningType.SCRIPT) {
      handleRunScript()
    } else if (running === RunningType.NONE && isRunningScriptRef.current) {
      quest.abort()
      scriptStopRef.current = true
      eventBus.publish(EventType.MSG_QUERY_SCHEMA)
    }
  }, [running])

  useEffect(() => {
    requestRef.current = request
    if (monacoRef?.current && editorRef?.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [request])

  const setCompletionProvider = async () => {
    if (editorReady && monacoRef?.current && editorRef?.current) {
      schemaCompletionHandle?.dispose()
      setRefreshingTables(true)
      setSchemaCompletionHandle(
        monacoRef.current.languages.registerCompletionItemProvider(
          QuestDBLanguageName,
          createSchemaCompletionProvider(editorRef.current, tables, columns),
        ),
      )
      setRefreshingTables(false)
    }
  }

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
    }
  }, [activeBuffer])

  useEffect(() => {
    window.addEventListener("focus", setCompletionProvider)
    return () => {
      window.removeEventListener("focus", setCompletionProvider)
      if (cursorChangeTimeoutRef.current) {
        window.clearTimeout(cursorChangeTimeoutRef.current)
      }
      
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
      
      if (notificationTimeoutRef.current) {
        window.clearTimeout(notificationTimeoutRef.current)
      }

      if (decorationCollectionRef.current) {
        decorationCollectionRef.current.clear()
      }
    }
  }, [])

  return (
    <>
      <Content onClick={handleEditorClick}>
        <ButtonBar onTriggerRunScript={handleTriggerRunScript} isTemporary={activeBuffer.isTemporary} />
        <Editor
          beforeMount={beforeMount}
          defaultLanguage={QuestDBLanguageName}
          onMount={onMount}
          saveViewState={false}
          onChange={(value) => {
            const lineCount = editorRef.current?.getModel()?.getLineCount()
            if (lineCount && lineCount > LINE_NUMBER_HARD_LIMIT) {
              if (editorRef.current && currentBufferValueRef.current !== undefined) {
                editorRef.current.setValue(currentBufferValueRef.current)
              }
              toast.error("Maximum line limit reached")
              return
            }
            currentBufferValueRef.current = value
            updateBuffer(activeBuffer.id as number, { value })
          }}
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
            selectOnLineNumbers: false,
            scrollBeyondLastLine: false,
            tabSize: 2,
            lineNumbersMinChars: lineNumbersMinChars,
          }}
          theme="vs-dark"
        />
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
          }
        }}
        positionRef={dropdownPositionRef}
        queriesRef={dropdownQueriesRef}
        isContextMenuRef={isContextMenuDropdownRef}
        onRunQuery={handleRunQuery}
        onExplainQuery={handleExplainQuery}
      />
      
      <Dialog.Root open={scriptConfirmationOpen} onOpenChange={handleToggleDialog}>
        <Dialog.Portal>
          <ForwardRef>
            <Overlay primitive={Dialog.Overlay} />
          </ForwardRef>
          
          <Dialog.Content
            onEscapeKeyDown={() => handleToggleDialog(false)}
            onInteractOutside={() => handleToggleDialog(false)}
          >
            <Dialog.Title>
              Run all queries
            </Dialog.Title>
            
            <StyledDialogDescription>
              <Text color="foreground">
                You are about to run all queries in this tab. This action may modify or delete your data permanently.
              </Text>
              <Box gap="1rem" margin="1.6rem 0">
              <label htmlFor="stop-after-failure" style={{ display: "flex", alignItems: "center", gap: "0.8rem", cursor: "pointer" }}>
                <Checkbox
                  defaultChecked={stopAfterFailureRef.current}
                  onChange={(e) => { stopAfterFailureRef.current = e.target.checked }}
                  id="stop-after-failure"
                  data-hook="stop-after-failure-checkbox"
                />
                <Text color="foreground">Stop running after a failed query</Text>
              </label>
            </Box>
            </StyledDialogDescription>
            
            <Dialog.ActionButtons>
              <Dialog.Close asChild>
                <StyledDialogButton skin="secondary" onClick={() => handleToggleDialog(false)}>
                  Cancel
                </StyledDialogButton>
              </Dialog.Close>
              
              <StyledDialogButton skin="primary" data-hook="run-all-queries-confirm" onClick={handleConfirmRunScript}>
                Run all queries
              </StyledDialogButton>
            </Dialog.ActionButtons>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export default MonacoEditor
