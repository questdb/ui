import Editor, { loader, Monaco } from "@monaco-editor/react"
import { Box, Button } from "@questdb/react-components"
import { Stop, Cursor } from "@styled-icons/remix-line"
import type { editor, IDisposable } from "monaco-editor"
import React, { useContext, useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { PaneContent, Text } from "../../../components"
import { formatTiming } from "../QueryResult"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { QuestContext, useEditor } from "../../../providers"
import { actions, selectors } from "../../../store"
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
import { getQueriesFromPosition, Request } from "./utils"
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
  getSelectedText,
  stripSQLComments,
  QueryKey,
  createQueryKey,
  parseQueryKey,
  createQueryKeyFromRequest,
  shiftOffset,
  validateQueryAtOffset,
  setErrorMarkerForQuery,
  getQueryStartOffset,
} from "./utils"
import { DropdownMenu } from "../../../components/DropdownMenu"
import { PlayFilled } from "../../../components/icons/play-filled"
import { toast } from "../../../components/Toast"
import { Information } from "@styled-icons/remix-line"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

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
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTggNC45MzR2MTQuMTMyYzAgLjQzMy40NjYuNzAyLjgxMi40ODRsMTAuNTYzLTcuMDY2YS41LjUgMCAwIDAgMC0uODMyTDguODEyIDQuNjE2QS41LjUgMCAwIDAgOCA0LjkzNFoiIGZpbGw9IiM1MGZhN2IiLz48L3N2Zz4=");
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

const RunScriptButton = styled(Button)`
  position: absolute;
  top: 0.6rem;
  right: 2rem;
  z-index: 1;
  padding: 1.2rem 0.6rem;
  margin-bottom: 1rem;
  opacity: .5;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;

    svg {
      fill: ${color("green")}
    }
  }
`

const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
`

const StyledDropdownContent = styled(DropdownMenu.Content)`
  background-color: #343846;
  border-radius: 0.5rem;
  padding: 0.4rem;
  box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.36);
  z-index: 9999;
  min-width: 160px;
  gap: 0;
`

const StyledDropdownItem = styled(DropdownMenu.Item)`
  font-size: 1.3rem;
  height: 3rem;
  font-family: "system-ui", sans-serif;
  cursor: pointer;
  color: rgb(248, 248, 242);
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-radius: 0.4rem;
  margin: 0;
  gap: 0;
  border: 1px solid transparent;

  &[data-highlighted] {
    background: #043c5c;
    border: 1px solid #8be9fd;
  }
`

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1.2rem;
`

const StyledPlayFilled = styled(PlayFilled)`
  transform: scale(1.3);
`

const HiddenTrigger = styled.div<{ style?: { top: string; left: string } }>`
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  top: ${props => props.style?.top || '0px'};
  left: ${props => props.style?.left || '0px'};
  z-index: 9998;
`

const DEFAULT_LINE_CHARS = 5

const MonacoEditor = () => {
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
  const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)
  const [isRunningScript, setIsRunningScript] = useState(false)
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)
  const queryNotifications = useSelector(selectors.query.getQueryNotifications)
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
  const isSelectionRef = useRef(false)
  const isRunningScriptRef = useRef(isRunningScript)
  const lineMarkingDecorationIdsRef = useRef<string[]>([])
  const runningValueRef = useRef(running.value)
  const activeBufferRef = useRef(activeBuffer)
  const requestRef = useRef(request)
  const queryNotificationsRef = useRef(queryNotifications)
  const contentJustChangedRef = useRef(false)
  const cursorChangeTimeoutRef = useRef<number | null>(null)
  const decorationCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  const visibleLinesRef = useRef<{ startLine: number; endLine: number }>({ startLine: 1, endLine: 1 })
  const scrollTimeoutRef = useRef<number | null>(null)
  const notificationTimeoutRef = useRef<number | null>(null)
  const targetPositionRef = useRef<{ lineNumber: number; column: number } | null>(null)
  const currentBufferValueRef = useRef<string | undefined>(activeBuffer.value)

  // Buffer -> QueryKey -> Error
  const errorRefs = useRef<
    Record<string, Record<QueryKey, { 
      error?: ErrorResult, 
      isSelection?: boolean,
      queryText: string,
      startOffset: number
      endOffset: number
    }>>
  >({})

  // Set the initial line number width in chars based on the number of lines in the active buffer
  const [lineNumbersMinChars, setLineNumbersMinChars] = useState(
    DEFAULT_LINE_CHARS +
    activeBuffer.value.split("\n").length.toString().length -
    1,
  )

  const toggleRunning = (isRefresh: boolean = false, isExplain: boolean = false) => {
    dispatch(actions.query.toggleRunning(isRefresh, isExplain))
  }

  const updateQueryNotification = (queryKey?: QueryKey) => {
    let newActiveNotification: NotificationShape | null = null

    if (queryKey) {
      const queryNotifications = queryNotificationsRef.current[queryKey]
      if (queryNotifications) {
        newActiveNotification = queryNotifications.latest || null
      }
    }

    dispatch(actions.query.setActiveNotification(newActiveNotification))
  }

  const openDropdownAtPosition = (posX: number, posY: number, targetPosition: { lineNumber: number; column: number }, isSelection?: boolean) => {
    isSelectionRef.current = isSelection || false
    targetPositionRef.current = targetPosition
    
    if (editorRef.current) {
      const editorContainer = editorRef.current.getDomNode()
      const containerRect = editorContainer?.getBoundingClientRect()
      
      if (containerRect) {
        const lineHeight = 24
        const lineNumber = targetPosition.lineNumber
        const scrollTop = editorRef.current.getScrollTop()
        
        const yPosition = containerRect.top + (lineNumber - 1) * lineHeight - scrollTop + lineHeight / 2 + 5
        const xPosition = containerRect.left + 115
        
        setDropdownPosition({ 
          x: xPosition, 
          y: yPosition 
        })
      } else {
        // Fallback to click coordinates
        setDropdownPosition({ x: posX, y: posY })
      }
      
      setDropdownOpen(true)
    }
  }

  const beforeMount = (monaco: Monaco) => {
    registerLanguageAddons(monaco)

    monaco.editor.defineTheme("dracula", dracula)
  }

  const handleEditorClick = (e: React.MouseEvent) => {
    if (
      e.target instanceof Element && 
      (e.target.classList.contains("cursorQueryGlyph") ||
      e.target.classList.contains("cancelQueryGlyph"))
    ) {  
      editorRef?.current?.focus()
      if (editorRef.current && editorRef.current.getModel()) {
        const target = editorRef.current.getTargetAtClientPoint(e.clientX, e.clientY)
        
        if (target && target.position) {
          const position = {
            lineNumber: target.position.lineNumber,
            column: 1
          }
          const selection = editorRef.current.getSelection()
          const marginDecorations = editorRef.current.getModel()?.getAllMarginDecorations()
          if (selection && marginDecorations) {
            const currentGlyphIndex = marginDecorations.findIndex(g => g.range.startLineNumber === position.lineNumber)
            const currentGlyph = marginDecorations[currentGlyphIndex]
            const nextGlyph = marginDecorations[currentGlyphIndex + 1] || { range: { startLineNumber: editorRef.current.getModel()!.getLineCount() + 1 }}
            const selection = editorRef.current.getSelection()
            const selectedText = getSelectedText(editorRef.current)
            if (selection && selectedText && selection.startLineNumber >= currentGlyph.range.startLineNumber && selection.endLineNumber < nextGlyph.range.startLineNumber) {
              const normalizedStrippedSelectedText = stripSQLComments(normalizeQueryText(selectedText))
              if (normalizedStrippedSelectedText) {
                openDropdownAtPosition(e.clientX, e.clientY, position, true)
                return
              }
            }
          }
          editorRef.current.setPosition(position)
          toggleRunning()
        }
      }
    }
  }

  const handleRunQuery = () => {
    setDropdownOpen(false)
    if (targetPositionRef.current && editorRef.current) {
      editorRef.current.setPosition(targetPositionRef.current)
    }
    
    toggleRunning()
  }

  const handleRunSelection = () => {
    setDropdownOpen(false)
    toggleRunning()
  }

  const handleExplainQuery = () => {
    setDropdownOpen(false)
    if (targetPositionRef.current && editorRef.current) {
      editorRef.current.setPosition(targetPositionRef.current)
    }
    
    toggleRunning(false, true)
  }

  const applyLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor
  ) => {
    const model = editor.getModel()
    const editorValue = editor.getValue()

    if (!editorValue || !model) {
      return
    }
    
    const queryAtCursor = getQueryFromCursor(editor)
    const activeBufferId = activeBufferRef.current.id as number
    
    const lineMarkingDecorations: editor.IModelDeltaDecoration[] = []
    const bufferErrors = errorRefs.current[activeBufferId] || {}
    
    if (queryAtCursor) {
      const queryKey = createQueryKeyFromRequest(editor, queryAtCursor)
      const queryErrorBuffer = bufferErrors[queryKey]
      const hasError = queryErrorBuffer && queryErrorBuffer.error !== undefined
      const startLineNumber = queryAtCursor.row + 1
      const endLineNumber = queryAtCursor.endRow + 1
      
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
    updateQueryNotification(queryAtCursor ? createQueryKeyFromRequest(editor, queryAtCursor) : undefined)
    if (bufferErrors) {
      setErrorMarkerForQuery(monaco, editor, bufferErrors, queryAtCursor)
    }
  }

  const applyGlyphsAndLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor
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
      const endPosition = { lineNumber: endLine, column: 1 }
      
      queries = getQueriesInRange(editor, startPosition, endPosition)
    }
    
    const activeBufferId = activeBufferRef.current.id as number

    const allDecorations: editor.IModelDeltaDecoration[] = []
    
    // Add decorations for queries in range
    if (queries.length > 0) {
      queries.forEach(query => {
        const bufferErrors = errorRefs.current[activeBufferId] || {}
        const queryKey = createQueryKeyFromRequest(editor, query)
        const queryErrorBuffer = bufferErrors[queryKey]
        const hasError = queryErrorBuffer && queryErrorBuffer.error !== undefined
        const isSuccessful = queryNotificationsRef.current[queryKey]?.latest?.type === "success"
        
        // Convert 0-based row to 1-based line number for Monaco
        const startLineNumber = query.row + 1
        
        // Add glyph for all queries with line number in class name
        const glyphClassName =
          runningValueRef.current &&
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
      decorationCollectionRef.current.clear();
    }
    
    decorationCollectionRef.current = editor.createDecorationsCollection(allDecorations)
    
    applyLineMarkings(monaco, editor)
  }

  const onMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    monaco.editor.setTheme("dracula")
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
        if (!runningValueRef.current) {
          toggleRunning()
        }
      },
      dispatch,
      editorContext,
    })
    
    editor.onContextMenu((e) => {
      if (e.target.element && e.target.element.classList.contains("cursorQueryGlyph")) {
        const posX = e.event.posx, posY = e.event.posy
        if (editorRef.current) {
          const target = editorRef.current.getTargetAtClientPoint(posX, posY)
          
          if (target && target.position) {
            const linePosition = { lineNumber: target.position.lineNumber, column: 1 }
  
            const queryAtPosition = getQueriesFromPosition(editorRef.current, linePosition, linePosition)
            if (queryAtPosition) {
              openDropdownAtPosition(posX, posY, linePosition)
            }
          }
        }
      }
    })

    editor.onDidChangeCursorPosition(() => {
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
        if (monacoRef.current && editorRef.current) {
          applyLineMarkings(monaco, editor);
        }
        cursorChangeTimeoutRef.current = null;
      }, 50);
    })

    editor.onDidChangeModelContent((e) => {
      const model = editor.getModel()
      if (!model) return
      
      contentJustChangedRef.current = true
      
      const activeBufferId = activeBufferRef.current.id as number
      const bufferErrors = errorRefs.current[activeBufferId]
      
      const notificationUpdates: Array<() => void> = []
      
      e.changes.forEach(change => {
        const changeStartOffset = model.getOffsetAt({
          lineNumber: change.range.startLineNumber,
          column: change.range.startColumn
        })
        const offsetDelta = change.text.length - change.rangeLength
        
        if (bufferErrors) {
          const keysToUpdate: Array<{oldKey: QueryKey, newKey: QueryKey, data: any}> = []
          const keysToRemove: QueryKey[] = []
          
          Object.keys(bufferErrors).forEach((key) => {
            const queryKey = key as QueryKey
            const { queryText, startOffset, endOffset } = bufferErrors[queryKey]

            if (changeStartOffset < endOffset) {
              const newOffset = shiftOffset(startOffset, changeStartOffset, offsetDelta)
              if (validateQueryAtOffset(editor, queryText, newOffset)) {
                keysToUpdate.push({
                  oldKey: queryKey,
                  newKey: createQueryKey(queryText, newOffset),
                  data: { ...bufferErrors[queryKey], startOffset: newOffset }
                })
              } else {
                keysToRemove.push(queryKey)
                notificationUpdates.push(() => dispatch(actions.query.removeNotification(queryKey)))
              }
            }
          })
          
          keysToRemove.forEach(key => {
            delete bufferErrors[key]
          })

          keysToUpdate.forEach(({oldKey, newKey, data}) => {
            delete bufferErrors[oldKey]
            bufferErrors[newKey] = data
            notificationUpdates.push(() => dispatch(actions.query.updateNotificationKey(oldKey, newKey)))
          })
        }
        
        const currentNotifications = queryNotificationsRef.current
        Object.keys(currentNotifications).filter(key => !bufferErrors || !bufferErrors[key as QueryKey]).forEach((key) => {
          const queryKey = key as QueryKey
          const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)

          if (changeStartOffset < endOffset) {
            const newOffset = shiftOffset(startOffset, changeStartOffset, offsetDelta)
            if (validateQueryAtOffset(editor, queryText, newOffset)) {
              const newKey = createQueryKey(queryText, newOffset)
              notificationUpdates.push(() => dispatch(actions.query.updateNotificationKey(queryKey, newKey)))
            } else {
              notificationUpdates.push(() => dispatch(actions.query.removeNotification(queryKey)))
            }
          }
        })
      })
      
      if (bufferErrors && Object.keys(bufferErrors).length === 0) {
        delete errorRefs.current[activeBufferId]
      }
      errorRefs.current[activeBufferId] = bufferErrors

      applyGlyphsAndLineMarkings(monaco, editor)
      
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
              applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
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

    const executeQuery = params.get("executeQuery")
    if (executeQuery) {
      toggleRunning()
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
  }

  const runIndividualQuery = async (query: Request, isLast: boolean) => {
    const queryText = query.query
    const queryKey = createQueryKeyFromRequest(editorRef.current!, query)
    dispatch(actions.query.setResult(undefined))

    try {
      const result = await quest.queryRaw(normalizeQueryText(query.query), { limit: "0,1000", explain: true })
      const activeBufferId = activeBuffer.id as number

      if (errorRefs.current[activeBufferId]) {
        delete errorRefs.current[activeBufferId][queryKey]
        if (Object.keys(errorRefs.current[activeBufferId]).length === 0) {
          delete errorRefs.current[activeBufferId]
        }
      }

      if (result.type === QuestDB.Type.DDL || result.type === QuestDB.Type.DML) {
        dispatch(
          actions.query.addNotification({
            query: queryKey,
            content: <QueryInNotification query={query.query} />,
            updateActiveNotification: false,
          }),
        )
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      }

      if (result.type === QuestDB.Type.NOTICE) {
        dispatch(
          actions.query.addNotification({
            query: queryKey,
            content: (
              <Text color="foreground" ellipsis title={query.query}>
                {result.notice}
                {query.query !== undefined && query.query !== "" && `: ${query.query}`}
              </Text>
            ),
            sideContent: <QueryInNotification query={query.query} />,
            type: NotificationType.NOTICE,
            updateActiveNotification: false,
          }),
        )
        eventBus.publish(EventType.MSG_QUERY_SCHEMA)
      }

      if (result.type === QuestDB.Type.DQL) {
        setLastExecutedQuery(queryText)
        dispatch(
          actions.query.addNotification({
            query: queryKey,
            jitCompiled: result.explain?.jitCompiled ?? false,
            content: <QueryResult {...result.timings} rowCount={result.count} />,
            sideContent: <QueryInNotification query={query.query} />,
            updateActiveNotification: false,
          }),
        )
        eventBus.publish(EventType.MSG_QUERY_DATASET, result)
      }
      if (isLast) {
        dispatch(actions.query.setResult(result))
      }

      return true
    } catch (_error: unknown) {
      const error = _error as ErrorResult
      const activeBufferId = activeBuffer.id as number
        
      if (!errorRefs.current[activeBufferId]) {
        errorRefs.current[activeBufferId] = {}
      }
      
      const startOffset = getQueryStartOffset(editorRef.current!, query)
      errorRefs.current[activeBufferId][queryKey] = {
        error,
        queryText: query.query,
        startOffset,
        endOffset: startOffset + normalizeQueryText(query.query).length,
      }
      
      dispatch(
        actions.query.addNotification({
          query: queryKey,
          content: <Text color="red">{error.error}</Text>,
          sideContent: <QueryInNotification query={query.query} />,
          type: NotificationType.ERROR,
          updateActiveNotification: false,
        }),
      )
      return false
    }
  }

  const handleRunScript = async () => {
    let successfulQueries = 0
    let failedQueries = 0
    if (!editorRef.current || isRunningScript) return
    setIsRunningScript(true)

    notificationTimeoutRef.current = window.setTimeout(() => {
      dispatch(
        actions.query.setActiveNotification({
          type: NotificationType.LOADING,
          query: `${activeBufferRef.current.label}@${0}-${0}`,
          content: (
            <Box gap="1rem" align="center">
              <Text color="foreground">Running script...</Text>
            </Box>
          ),
          createdAt: new Date(),
        }),
      )
      notificationTimeoutRef.current = null
    }, 1000)
    const startTime = Date.now()

    const queries = getAllQueries(editorRef.current)

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      const result = await runIndividualQuery(query, i === queries.length - 1)
      if (result) {
        successfulQueries++
      } else {
        failedQueries++
      }
    }

    const duration = (Date.now() - startTime) * 1e6

    if (notificationTimeoutRef.current) {
      window.clearTimeout(notificationTimeoutRef.current)
      notificationTimeoutRef.current = null
    }

    const lastQuery = queries[queries.length - 1]
    if (editorRef.current && lastQuery) {
      const position = {
        lineNumber: lastQuery.row + 1,
        column: lastQuery.column
      }
      editorRef.current.revealPosition(position)
    }

    setTimeout(() => dispatch(
      actions.query.setActiveNotification({
        query: `${activeBufferRef.current.label}@${0}-${0}`,
        content: <Text color="foreground">
          Running script completed in {formatTiming(duration)} with
          {successfulQueries > 0 ? ` ${successfulQueries} successful` : ""}
          {successfulQueries > 0 && failedQueries > 0 ? " and" : ""}
          {failedQueries > 0 ? ` ${failedQueries} failed` : ""} queries
        </Text>,
        type: NotificationType.SUCCESS,
        createdAt: new Date(),
      }),
    ))
    
    setIsRunningScript(false)
  }

  useEffect(() => {
    // Remove all errors for the buffers that have been deleted
    Object.keys(errorRefs.current).map((key) => {
      if (!buffers.find((b) => b.id === parseInt(key))) {
        delete errorRefs.current[key]
      }
    })
  }, [buffers])

  useEffect(() => {
    activeBufferRef.current = activeBuffer
    currentBufferValueRef.current = activeBuffer.value
  }, [activeBuffer])

  useEffect(() => {
    queryNotificationsRef.current = queryNotifications
    if (monacoRef.current && editorRef.current && !isRunningScriptRef.current && !contentJustChangedRef.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [queryNotifications])

  useEffect(() => {
    if (isRunningScriptRef.current && !isRunningScript && monacoRef.current && editorRef.current) {
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
    isRunningScriptRef.current = isRunningScript
  }, [isRunningScript])

  useEffect(() => {
    if (!running.value && request) {
      quest.abort()
      dispatch(actions.query.stopRunning())
      setRequest(undefined)
    }
  }, [request, quest, dispatch, running])

  useEffect(() => {
    runningValueRef.current = running.value
    if (running.value && editorRef?.current) {
      if (monacoRef?.current) {
        clearModelMarkers(monacoRef.current, editorRef.current)
      }

      if (monacoRef?.current && editorRef?.current) {
        applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
      }

      const request = running.isRefresh
        ? getQueryRequestFromLastExecutedQuery(lastExecutedQuery)
        : getQueryRequestFromEditor(editorRef.current, running.isExplain)

      if (request?.query) {
        const originalQuery = running.isExplain && request.query.startsWith('EXPLAIN ') 
          ? request.query.substring(8) // Remove "EXPLAIN " prefix
          : request.query
        
        // give the notification a slight delay to prevent flashing for fast queries
        notificationTimeoutRef.current = window.setTimeout(() => {
          if (runningValueRef.current && requestRef.current && editorRef.current) {
            dispatch(
              actions.query.addNotification({
                type: NotificationType.LOADING,
                query: createQueryKeyFromRequest(editorRef.current, request),
                isExplain: running.isExplain,
                content: (
                  <Box gap="1rem" align="center">
                    <Text color="foreground">Running...</Text>
                    <CancelButton skin="error" onClick={() => toggleRunning()}>
                      <Stop size="18px" />
                    </CancelButton>
                  </Box>
                ),
                sideContent: <QueryInNotification query={request.query} />,
              }),
            )
          }
          notificationTimeoutRef.current = null
        }, 1000)

        void quest
          .queryRaw(normalizeQueryText(request.query), { limit: "0,1000", explain: true })
          .then((result) => {
            if (notificationTimeoutRef.current) {
              window.clearTimeout(notificationTimeoutRef.current)
              notificationTimeoutRef.current = null
            }
            
            setRequest(undefined)
            if (!editorRef.current) return

            let parentQuery: Request = request

            if (request.isSelection) {
              const query = getQueryFromCursor(editorRef.current)
              if (query) {
                parentQuery = query
              } else {
                const originalRequest = { ...request, query: originalQuery }
                parentQuery = originalRequest
              }
            } else {
              const originalRequest = { ...request, query: originalQuery }
              parentQuery = originalRequest
            }
            const parentQueryKey = createQueryKeyFromRequest(editorRef.current, parentQuery)
            const activeBufferId = activeBuffer.id as number
            
            if (errorRefs.current[activeBufferId] && editorRef.current) {
              delete errorRefs.current[activeBufferId][parentQueryKey]
              if (Object.keys(errorRefs.current[activeBufferId]).length === 0) {
                delete errorRefs.current[activeBufferId]
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
                  isExplain: running.isExplain,
                  content: <QueryInNotification query={request.query} />,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.NOTICE) {
              dispatch(
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: running.isExplain,
                  content: (
                    <Text color="foreground" ellipsis title={request.query}>
                      {result.notice}
                      {request.query !== undefined &&
                        request.query !== "" &&
                        `: ${request.query}`}
                    </Text>
                  ),
                  sideContent: <QueryInNotification query={request.query} />,
                  type: NotificationType.NOTICE,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.DQL) {
              setLastExecutedQuery(originalQuery)
              dispatch(
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: running.isExplain,
                  jitCompiled: result.explain?.jitCompiled ?? false,
                  content: (
                    <QueryResult {...result.timings} rowCount={result.count} />
                  ),
                  sideContent: <QueryInNotification query={request.query} />,
                }),
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
              if (running.isExplain && request.query.startsWith('EXPLAIN ')) {
                // Adjust error position to account for removed "EXPLAIN " prefix
                adjustedErrorPosition = Math.max(0, error.position - 8)
              }
              
              const originalRequest = {
                ...request,
                query: originalQuery
              }
              
              const errorRange = getErrorRange(
                editorRef.current,
                originalRequest,
                adjustedErrorPosition,
              )

              let parentQuery: Request = originalRequest
              let errorToStore = { ...error, position: adjustedErrorPosition }

              if (request.isSelection && errorRange && editorRef.current) {
                editorRef?.current.setPosition({
                  lineNumber: errorRange.startLineNumber,
                  column: errorRange.startColumn,
                })
                const query = getQueryFromCursor(editorRef.current)
                
                if (query) {
                  parentQuery = query
                  errorToStore = { ...error, position: query.query.indexOf(originalQuery) + adjustedErrorPosition }
                }
              }

              const parentQueryKey = createQueryKeyFromRequest(editorRef.current, parentQuery)
              const activeBufferId = activeBuffer.id as number
              if (!errorRefs.current[activeBufferId]) {
                errorRefs.current[activeBufferId] = {}
              }
              
              const startOffset = getQueryStartOffset(editorRef.current, parentQuery)
              errorRefs.current[activeBufferId][parentQueryKey] = {
                error: errorToStore,
                isSelection: request.isSelection,
                queryText: parentQuery.query,
                startOffset,
                endOffset: startOffset + normalizeQueryText(parentQuery.query).length,
              }
                            
              if (errorRange) {
                editorRef?.current.focus()

                editorRef?.current.setPosition({
                  lineNumber: errorRange.startLineNumber,
                  column: errorRange.startColumn,
                })

                editorRef?.current.revealPosition({
                  lineNumber: errorRange.startLineNumber,
                  column: errorRange.endColumn,
                })
              }

              dispatch(
                actions.query.addNotification({
                  query: parentQueryKey,
                  isExplain: running.isExplain,
                  content: <Text color="red">{error.error}</Text>,
                  sideContent: <QueryInNotification query={request.query} />,
                  type: NotificationType.ERROR,
                }),
              )
            }
          })
        setRequest(request)
      } else {
        dispatch(actions.query.stopRunning())
      }
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
    if (monacoRef.current && editorRef.current) {
      clearModelMarkers(monacoRef.current, editorRef.current)
      
      applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
    }
  }, [activeBuffer])

  useEffect(() => {
    window.addEventListener("focus", setCompletionProvider)
    return () => window.removeEventListener("focus", setCompletionProvider)
  }, [])

  useEffect(() => {
    return () => {
      if (cursorChangeTimeoutRef.current) {
        window.clearTimeout(cursorChangeTimeoutRef.current);
      }
      
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      
      if (notificationTimeoutRef.current) {
        window.clearTimeout(notificationTimeoutRef.current);
      }
      
      if (decorationCollectionRef.current) {
        decorationCollectionRef.current.clear();
      }
    };
  }, []);

  return (
    <>
      <Content onClick={handleEditorClick}>
        <RunScriptButton
          onClick={handleRunScript}
          skin="secondary"
          data-hook="run-script-button"
          prefixIcon={<PlayFilled size={18} />}
          disabled={isRunningScript}
        >
          {isRunningScript ? "Running..." : "Run script"}
        </RunScriptButton>

        <Editor
          beforeMount={beforeMount}
          defaultLanguage={QuestDBLanguageName}
          onMount={onMount}
          saveViewState={false}
          onChange={(value) => {
            const lineCount = editorRef.current?.getModel()?.getLineCount()
            if (lineCount && lineCount > 99999) {
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
      
      <DropdownMenu.Root open={dropdownOpen} onOpenChange={(open) => {
        setDropdownOpen(open)
        if (!open) {
          setDropdownPosition(null)
          isSelectionRef.current = false
        }
      }}>
        <DropdownMenu.Trigger asChild>
          <HiddenTrigger 
            style={{ 
              top: dropdownPosition?.y ? `${dropdownPosition.y}px` : '0px',
              left: dropdownPosition?.x ? `${dropdownPosition.x}px` : '0px'
            }} 
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <StyledDropdownContent>
            <StyledDropdownItem onClick={handleRunQuery} data-hook="dropdown-item-run-query">
              <IconWrapper><StyledPlayFilled size={18} color="#fff" /></IconWrapper>
              Run query
            </StyledDropdownItem>
            {isSelectionRef.current && <StyledDropdownItem onClick={handleRunSelection} data-hook="dropdown-item-run-selection">
              <IconWrapper><Cursor size={18} color="#fff" /></IconWrapper>
              Run selection
            </StyledDropdownItem>}
            {!isSelectionRef.current && <StyledDropdownItem onClick={handleExplainQuery} data-hook="dropdown-item-get-query-plan">
              <IconWrapper><Information size={18} /></IconWrapper>
              Get query plan
            </StyledDropdownItem>}
          </StyledDropdownContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )
}

export default MonacoEditor
