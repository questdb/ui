import Editor, { loader, Monaco } from "@monaco-editor/react"
import { Box, Button } from "@questdb/react-components"
import { Stop } from "@styled-icons/remix-line"
import type { editor, IDisposable } from "monaco-editor"
import React, { useContext, useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { PaneContent, Text } from "../../../components"
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
  setErrorMarker,
  getAllQueries,
  getQueriesInRange,
} from "./utils"
import { DropdownMenu } from "../../../components/DropdownMenu"
import { Play, Information } from "@styled-icons/remix-line"

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
    margin-left: 1.2rem;
    left: 77px !important;

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
    }
  }

  .cursorQueryGlyph {
    &:after {
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTggNC45djE0LjJjMCAuNC41LjcuOC41bDEwLjQtNy4xYS41LjUgMCAwIDAgMC0uOEw4LjggNC42YS41LjUgMCAwIDAtLjguM3oiIGZpbGw9IiM1MGZhN2IiLz48L3N2Zz4=");
    }
  }

  .cursorQueryGlyphError {
    margin-left: 2rem;
    z-index: 1;
    cursor: pointer;

    &:after {
      display: block;
      content: "";
      width: 22px;
      height: 22px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgICA8ZGVmcz4KICAgICAgICA8Y2xpcFBhdGggaWQ9ImNsaXAwIj48cmVjdCB3aWR0aD0iMjQiIGhlaWdodD0iMjQiLz48L2NsaXBQYXRoPgogICAgPC9kZWZzPgogICAgPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwKSI+CiAgICAgICAgPHBhdGggZD0iTTggNC45MzR2MTQuMTMyYzAgLjQzMy40NjYuNzAyLjgxMi40ODRsMTAuNTYzLTcuMDY2YS41LjUgMCAwIDAgMC0uODMyTDguODEyIDQuNjE2QS41LjUgMCAwIDAgOCA0LjkzNFoiIGZpbGw9IiM1MGZhN2IiLz4KICAgICAgICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiNmZjU1NTUiLz4KICAgICAgICA8cmVjdCB4PSIxNyIgeT0iNCIgd2lkdGg9IjIiIGhlaWdodD0iNSIgZmlsbD0id2hpdGUiIHJ4PSIwLjUiLz4KICAgICAgICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjExIiByPSIxIiBmaWxsPSJ3aGl0ZSIvPgogICAgPC9nPgo8L3N2Zz4=");
    }
  }

  .cancelQueryGlyph {
    &:after {
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMjJweCIgd2lkdGg9IjIycHgiIGFyaWEtaGlkZGVuPSJ0cnVlIiBmb2N1c2FibGU9ImZhbHNlIiBmaWxsPSIjZmY1NTU1IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJTdHlsZWRJY29uQmFzZS1zYy1lYTl1bGotMCBqQ2hkR0siPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiPjwvcGF0aD48cGF0aCBkPSJNNyA3djEwaDEwVjdIN3pNNiA1aDEyYTEgMSAwIDAgMSAxIDF2MTJhMSAxIDAgMCAxLTEgMUg2YTEgMSAwIDAgMS0xLTFWNmExIDEgMCAwIDEgMS0xeiI+PC9wYXRoPjwvc3ZnPgo=");
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
`

const StyledDropdownItem = styled(DropdownMenu.Item)`
  font-size: 1.3rem;
  height: 2.6rem;
  font-family: "system-ui", sans-serif;
  cursor: pointer;
  color: rgb(248, 248, 242);
  display: flex;
  align-items: center;
  padding: 0 1.2rem;
  border-radius: 0.4rem;
  margin: 0;
  gap: 1rem;

  &[data-highlighted] {
    background-color: #45475a;
    color: rgb(240, 240, 240);
  }
`

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
`

const StyledPlay = styled(Play)`
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
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)
  const queryNotifications = useSelector(selectors.query.getQueryNotifications)
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
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

  // Buffer -> Query -> Error
  const errorRefs = useRef<
    Record<string, Record<string, { error?: ErrorResult }>>
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

  const updateQueryNotification = (query?: string) => {
    let newActiveNotification: NotificationShape | null = null

    if (query) {
      const notification = queryNotificationsRef.current[query]
      if (notification) {
        newActiveNotification = notification
      }
    }

    dispatch(actions.query.setActiveNotification(newActiveNotification))
  }

  const beforeMount = (monaco: Monaco) => {
    registerLanguageAddons(monaco)

    monaco.editor.defineTheme("dracula", dracula)
  }

  // To ensure the fixed position of the "run query" glyph we adjust the width of the line count element.
  // This width is represented in char numbers.
  const setLineCharsWidth = () => {
    const lineCount = editorRef.current?.getModel()?.getLineCount()
    if (lineCount) {
      setLineNumbersMinChars(
        DEFAULT_LINE_CHARS + (lineCount.toString().length - 1),
      )
    }
  }

  const handleEditorClick = (e: React.MouseEvent) => {
    if (dropdownOpen && 
        e.target instanceof Element && 
        !e.target.classList.contains("cursorQueryGlyph") &&
        !e.target.classList.contains("cursorQueryGlyphError")) {
      setDropdownOpen(false)
      return
    }
    
    if (
      e.target instanceof Element && 
      (e.target.classList.contains("cursorQueryGlyph") ||
      e.target.classList.contains("cursorQueryGlyphError") ||
      e.target.classList.contains("cancelQueryGlyph"))
    ) {  
      editorRef?.current?.focus()
      
      if (e.target.classList.contains("cancelQueryGlyph")) {
        toggleRunning()
        return
      }
      
      if (editorRef.current) {
        const target = editorRef.current.getTargetAtClientPoint(e.clientX, e.clientY)
        
        if (target && target.position) {
          targetPositionRef.current = {
            lineNumber: target.position.lineNumber,
            column: 1
          }
          const linePosition = { lineNumber: target.position.lineNumber, column: 1 }

          const queryAtPosition = getQueriesFromPosition(editorRef.current, linePosition, linePosition)
          if (queryAtPosition) {
            const editorContainer = editorRef.current.getDomNode()
            const containerRect = editorContainer?.getBoundingClientRect()
            
            if (containerRect) {
              const lineHeight = 24
              const lineNumber = target.position.lineNumber
              const scrollTop = editorRef.current.getScrollTop()
              
              const yPosition = containerRect.top + (lineNumber - 1) * lineHeight - scrollTop + lineHeight / 2 + 5
              const xPosition = containerRect.left + 115
              
              setDropdownPosition({ 
                x: xPosition, 
                y: yPosition 
              })
            } else {
              // Fallback to click coordinates
              setDropdownPosition({ x: e.clientX, y: e.clientY })
            }
            
            setDropdownOpen(true)
          }
        }
      }
    }
  }

  const handleRunQuery = () => {
    setDropdownOpen(false)
    console.log("targetPositionRef.current", targetPositionRef.current)
    if (targetPositionRef.current && editorRef.current) {
      editorRef.current.setPosition(targetPositionRef.current)
    }
    
    toggleRunning()
  }

  const handleExplainQuery = () => {
    setDropdownOpen(false)
    console.log("targetPositionRef.current", targetPositionRef.current)
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
      const hasError = bufferErrors[queryAtCursor.query]?.error !== undefined
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
    updateQueryNotification(queryAtCursor?.query)
    setErrorMarker(monaco, editor, bufferErrors, queryAtCursor)
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
        const hasError = bufferErrors[query.query]?.error !== undefined
        
        // Convert 0-based row to 1-based line number for Monaco
        const startLineNumber = query.row + 1
        
        // Add glyph for all queries
        allDecorations.push({
          range: new monaco.Range(
            startLineNumber,
            1,
            startLineNumber,
            1
          ),
          options: {
            isWholeLine: false,
            glyphMarginClassName:
              runningValueRef.current &&
                requestRef.current?.row &&
                requestRef.current?.row + 1 === startLineNumber
                ? "cancelQueryGlyph"
                : hasError
                ? "cursorQueryGlyphError"
                : "cursorQueryGlyph",
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

    editor.onDidChangeModelContent(() => {
      contentJustChangedRef.current = true;
      
      const activeBufferId = activeBufferRef.current.id as number
      const bufferErrors = errorRefs.current[activeBufferId]
      
      if (bufferErrors) {
        const currentQueries = getAllQueries(editor)
        const currentQueryTexts = new Set(currentQueries.map(q => q.query))
        
        // Remove errors for queries that no longer exist
        Object.keys(bufferErrors).forEach(queryText => {
          if (!currentQueryTexts.has(queryText)) {
            delete bufferErrors[queryText]
          }
        })
        if (Object.keys(bufferErrors).length === 0) {
          delete errorRefs.current[activeBufferId]
        }
      }

      applyGlyphsAndLineMarkings(monaco, editor);
      
      setTimeout(() => {
        contentJustChangedRef.current = false;
      }, 100);
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
      // Find if the query is already in the editor
      const matches = findMatches(model, query)
      if (matches && matches.length > 0) {
        editor.setSelection(matches[0].range)
        // otherwise, append the query
      } else {
        appendQuery(editor, query, { appendAt: "end" })
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
  }, [activeBuffer])

  useEffect(() => {
    queryNotificationsRef.current = queryNotifications
  }, [queryNotifications])

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
          if (runningValueRef.current && requestRef.current) {
            dispatch(
              actions.query.addNotification({
                type: NotificationType.LOADING,
                query: originalQuery,
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
          .queryRaw(request.query, { limit: "0,1000", explain: true })
          .then((result) => {
            if (notificationTimeoutRef.current) {
              window.clearTimeout(notificationTimeoutRef.current)
              notificationTimeoutRef.current = null
            }
            
            setRequest(undefined)
            const activeBufferId = activeBuffer.id as number
            
            if (errorRefs.current[activeBufferId]) {
              delete errorRefs.current[activeBufferId][originalQuery]
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
                  query: originalQuery,
                  content: <QueryInNotification query={request.query} />,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.NOTICE) {
              dispatch(
                actions.query.addNotification({
                  query: originalQuery,
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
                  query: originalQuery,
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
            
            const activeBufferId = activeBuffer.id as number
            
            if (!errorRefs.current[activeBufferId]) {
              errorRefs.current[activeBufferId] = {}
            }
            
            errorRefs.current[activeBufferId][originalQuery] = {
              error,
            }
            
            setRequest(undefined)
            dispatch(actions.query.stopRunning())
            dispatch(
              actions.query.addNotification({
                query: originalQuery,
                content: <Text color="red">{error.error}</Text>,
                sideContent: <QueryInNotification query={request.query} />,
                type: NotificationType.ERROR,
              }),
            )

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
              if (errorRange) {
                applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)

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
            }
          })
        setRequest(request)
      } else {
        dispatch(actions.query.stopRunning())
      }
    } else {
      if (monacoRef?.current && editorRef?.current) {
        applyGlyphsAndLineMarkings(monacoRef.current, editorRef.current)
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
        <Editor
          beforeMount={beforeMount}
          defaultLanguage={QuestDBLanguageName}
          onMount={onMount}
          saveViewState={false}
          onChange={(value) => {
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
      
      <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
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
            <StyledDropdownItem onClick={handleRunQuery}>
              <IconWrapper><StyledPlay size={16} /></IconWrapper>
              Run
            </StyledDropdownItem>
            <StyledDropdownItem onClick={handleExplainQuery}>
              <IconWrapper><Information size={16} /></IconWrapper>
              Get query plan
            </StyledDropdownItem>
          </StyledDropdownContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )
}

export default MonacoEditor
