import Editor, { loader, Monaco } from "@monaco-editor/react"
import { Box, Button } from "@questdb/react-components"
import { Stop } from "@styled-icons/remix-line"
import type { editor, IDisposable, IRange } from "monaco-editor"
import React, { useContext, useEffect, useRef, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import styled from "styled-components"
import { PaneContent, Text } from "../../../components"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { QuestContext, useEditor } from "../../../providers"
import { actions, selectors } from "../../../store"
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
import type { Request } from "./utils"
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
} from "./utils"

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
      width: 18px;
      height: 18px;
    }
  }

  .cursorQueryGlyph {
    &:after {
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMThweCIgd2lkdGg9IjE4cHgiIGFyaWEtaGlkZGVuPSJ0cnVlIiBmb2N1c2FibGU9ImZhbHNlIiBmaWxsPSIjNTBmYTdiIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJTdHlsZWRJY29uQmFzZS1zYy1lYTl1bGotMCBrZkRiTmwiPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiPjwvcGF0aD48cGF0aCBkPSJNMTYuMzk0IDEyIDEwIDcuNzM3djguNTI2TDE2LjM5NCAxMnptMi45ODIuNDE2TDguNzc3IDE5LjQ4MkEuNS41IDAgMCAxIDggMTkuMDY2VjQuOTM0YS41LjUgMCAwIDEgLjc3Ny0uNDE2bDEwLjU5OSA3LjA2NmEuNS41IDAgMCAxIDAgLjgzMnoiPjwvcGF0aD48L3N2Zz4K");
    }
  }

  .cancelQueryGlyph {
    &:after {
      background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGhlaWdodD0iMThweCIgd2lkdGg9IjE4cHgiIGFyaWEtaGlkZGVuPSJ0cnVlIiBmb2N1c2FibGU9ImZhbHNlIiBmaWxsPSIjZmY1NTU1IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGNsYXNzPSJTdHlsZWRJY29uQmFzZS1zYy1lYTl1bGotMCBqQ2hkR0siPjxwYXRoIGZpbGw9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiPjwvcGF0aD48cGF0aCBkPSJNNyA3djEwaDEwVjdIN3pNNiA1aDEyYTEgMSAwIDAgMSAxIDF2MTJhMSAxIDAgMCAxLTEgMUg2YTEgMSAwIDAgMS0xLTFWNmExIDEgMCAwIDEgMS0xeiI+PC9wYXRoPjwvc3ZnPgo=");
    }
  }

  .errorGlyph {
    margin-left: 2.5rem;
    margin-top: 0.5rem;
    z-index: 1;
    width: 0.75rem !important;
    height: 0.75rem !important;
    border-radius: 50%;
    background: ${color("red")};
  }
`

const CancelButton = styled(Button)`
  padding: 1.2rem 0.6rem;
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
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
  const lineMarkingDecorationIdsRef = useRef<string[]>([])
  const runningValueRef = useRef(running.value)
  const activeBufferRef = useRef(activeBuffer)
  const requestRef = useRef(request)
  const contentJustChangedRef = useRef(false)
  const cursorChangeTimeoutRef = useRef<number | null>(null)
  const decorationCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  const errorRefs = useRef<
    Record<string, { error?: ErrorResult; range?: IRange }>
  >({})

  // Set the initial line number width in chars based on the number of lines in the active buffer
  const [lineNumbersMinChars, setLineNumbersMinChars] = useState(
    DEFAULT_LINE_CHARS +
    activeBuffer.value.split("\n").length.toString().length -
    1,
  )

  const toggleRunning = (isRefresh: boolean = false) => {
    dispatch(actions.query.toggleRunning(isRefresh))
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
    if (
      e.target instanceof Element && 
      (e.target.classList.contains("cursorQueryGlyph") ||
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
          editorRef.current.setPosition({
            lineNumber: target.position.lineNumber,
            column: 1
          })
        }
        toggleRunning()
      }
    }
  }

  // Update only line marking when cursor position changes
  const applyLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor
  ) => {
    const queryAtCursor = getQueryFromCursor(editor)
    const activeBufferId = activeBufferRef.current.id as number
    
    // Prepare line marking decorations
    const lineMarkingDecorations: editor.IModelDeltaDecoration[] = []
    
    // Add new line marking for current cursor position if there is one
    if (queryAtCursor) {
      const hasError =
        errorRefs.current &&
        errorRefs.current[activeBufferId]?.error?.query === queryAtCursor.query
      const startLineNumber = queryAtCursor.row + 1
      const endLineNumber = queryAtCursor.endRow + 1
      
      lineMarkingDecorations.push({
        range: new monaco.Range(
          startLineNumber,
          queryAtCursor.column + 2,
          endLineNumber,
          queryAtCursor.endColumn + 2
        ),
        options: {
          linesDecorationsClassName: `cursorQueryDecoration ${hasError ? "hasError" : ""}`,
          isWholeLine: false,
        }
      })
    }
    
    const newLineMarkingIds = editor.deltaDecorations(
      lineMarkingDecorationIdsRef.current,
      lineMarkingDecorations
    )
    
    lineMarkingDecorationIdsRef.current = newLineMarkingIds
  }

  const applyGlyphsAndLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor
  ) => {
    const allQueries = getAllQueries(editor)
    const activeBufferId = activeBufferRef.current.id as number
    
    const model = editor.getModel()
    if (model === null) {
      return
    }

    const allDecorations: editor.IModelDeltaDecoration[] = []
    
    if (allQueries.length > 0) {
      allQueries.forEach(query => {
        const hasError =
          errorRefs.current &&
          errorRefs.current[activeBufferId]?.error?.query === query.query
        const errorRange =
          errorRefs.current && errorRefs.current[activeBufferId]?.range
        
        // Convert 0-based row to 1-based line number for Monaco
        const startLineNumber = query.row + 1
        
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
                : "cursorQueryGlyph",
            glyphMarginHoverMessage: {
              value: runningValueRef.current ? "Cancel query" : "Run query",
            }
          },
        })
        
        if (hasError &&
          errorRange &&
          startLineNumber !== errorRange.startLineNumber) {
          allDecorations.push({
            range: new monaco.Range(
              errorRange.startLineNumber,
              0,
              errorRange.startLineNumber,
              0
            ),
            options: {
              isWholeLine: false,
              glyphMarginClassName: "errorGlyph",
            }
          })
        }
      })
    }
    
    if (decorationCollectionRef.current) {
      decorationCollectionRef.current.clear();
    }
    
    decorationCollectionRef.current = editor.createDecorationsCollection(allDecorations);
    
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
        return;
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
      contentJustChangedRef.current = true;
      
      applyGlyphsAndLineMarkings(monaco, editor);
      
      setTimeout(() => {
        contentJustChangedRef.current = false;
      }, 100);
    })

    editor.onDidChangeModel(() => {
      applyGlyphsAndLineMarkings(monaco, editor)
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
        : getQueryRequestFromEditor(editorRef.current)

      if (request?.query) {
        // give the notification a slight delay to prevent flashing for fast queries
        setTimeout(() => {
          if (runningValueRef.current) {
            dispatch(
              actions.query.addNotification({
                type: NotificationType.LOADING,
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
        }, 1000)

        void quest
          .queryRaw(request.query, { limit: "0,1000", explain: true })
          .then((result) => {
            setRequest(undefined)
            delete errorRefs.current[activeBuffer.id as number]

            dispatch(actions.query.stopRunning())
            dispatch(actions.query.setResult(result))

            if (
              result.type === QuestDB.Type.DDL ||
              result.type === QuestDB.Type.DML
            ) {
              dispatch(
                actions.query.addNotification({
                  content: <QueryInNotification query={result.query} />,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.NOTICE) {
              dispatch(
                actions.query.addNotification({
                  content: (
                    <Text color="foreground" ellipsis title={result.query}>
                      {result.notice}
                      {result.query !== undefined &&
                        result.query !== "" &&
                        `: ${result.query}`}
                    </Text>
                  ),
                  type: NotificationType.NOTICE,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.DQL) {
              setLastExecutedQuery(request.query)
              dispatch(
                actions.query.addNotification({
                  jitCompiled: result.explain?.jitCompiled ?? false,
                  content: (
                    <QueryResult {...result.timings} rowCount={result.count} />
                  ),
                  sideContent: <QueryInNotification query={result.query} />,
                }),
              )
              eventBus.publish(EventType.MSG_QUERY_DATASET, result)
            }
          })
          .catch((error: ErrorResult) => {
            errorRefs.current[activeBuffer.id as number] = {
              error,
            }
            setRequest(undefined)
            dispatch(actions.query.stopRunning())
            dispatch(
              actions.query.addNotification({
                content: <Text color="red">{error.error}</Text>,
                sideContent: <QueryInNotification query={request.query} />,
                type: NotificationType.ERROR,
              }),
            )

            if (editorRef?.current && monacoRef?.current) {
              const errorRange = getErrorRange(
                editorRef.current,
                request,
                error.position,
              )
              if (errorRange) {
                errorRefs.current[activeBuffer.id as number].range = errorRange
                setErrorMarker(
                  monacoRef?.current,
                  editorRef.current,
                  errorRange,
                  error.error,
                )

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
      
      if (decorationCollectionRef.current) {
        decorationCollectionRef.current.clear();
      }
    };
  }, []);

  return (
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
  )
}

export default MonacoEditor
