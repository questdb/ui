import type { BaseSyntheticEvent } from "react"
import React, { useContext, useEffect, useRef, useState } from "react"
import Editor, { loader, Monaco } from "@monaco-editor/react"
import dracula from "./dracula"
import type { editor, IDisposable, IRange } from "monaco-editor"
import { theme } from "../../../theme"
import { QuestContext, useEditor } from "../../../providers"
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
  stripSQLComments,
} from "./utils"
import { registerEditorActions, registerLanguageAddons } from "./editor-addons"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"
import { PaneContent, Text } from "../../../components"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import type { ErrorResult } from "../../../utils"
import * as QuestDB from "../../../utils/questdb"
import { NotificationType } from "../../../types"
import QueryResult from "../QueryResult"
import Loader from "../Loader"
import styled from "styled-components"
import { createSchemaCompletionProvider } from "./questdb-sql"
import { color } from "../../../utils"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"
import { QueryInNotification } from "./query-in-notification"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

const Content = styled(PaneContent)`
  position: relative;
  overflow: hidden;

  .monaco-editor .squiggly-error {
    background: none;
    border-bottom: 0.2rem ${color("red")} solid;
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
    addBuffer,
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
  const decorationsRef = useRef<editor.IEditorDecorationsCollection>()
  const runningValueRef = useRef(running.value)
  const activeBufferRef = useRef(activeBuffer)

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

  const handleEditorClick = (e: BaseSyntheticEvent) => {
    if (
      e.target.classList.contains("cursorQueryGlyph") ||
      e.target.classList.contains("cancelQueryGlyph")
    ) {
      editorRef?.current?.focus()
      toggleRunning()
    }
  }

  const renderLineMarkings = (
    monaco: Monaco,
    editor: editor.IStandaloneCodeEditor,
  ) => {
    const queryAtCursor = getQueryFromCursor(editor)
    const model = editor.getModel()
    if (queryAtCursor && model !== null) {
      const activeBufferId = activeBufferRef.current.id as number

      const cleanedModel = monaco.editor.createModel(
        stripSQLComments(model.getValue()),
        QuestDBLanguageName,
      )

      const matches = findMatches(cleanedModel, queryAtCursor.query)

      cleanedModel.dispose()

      if (matches.length > 0) {
        const hasError =
          errorRefs.current &&
          errorRefs.current[activeBufferId]?.error?.query ===
            queryAtCursor.query
        const errorRange =
          errorRefs.current && errorRefs.current[activeBufferId]?.range
        const cursorMatch = matches.find(
          (m) => m.range.startLineNumber === queryAtCursor.row + 1,
        )
        if (cursorMatch) {
          decorationsRef.current?.clear()
          decorationsRef.current = editor.createDecorationsCollection([
            {
              range: new monaco.Range(
                cursorMatch.range.startLineNumber,
                1,
                cursorMatch.range.endLineNumber,
                1,
              ),
              options: {
                isWholeLine: true,
                linesDecorationsClassName: `cursorQueryDecoration ${
                  hasError ? "hasError" : ""
                }`,
              },
            },
            {
              range: new monaco.Range(
                cursorMatch.range.startLineNumber,
                1,
                cursorMatch.range.startLineNumber,
                1,
              ),
              options: {
                isWholeLine: false,
                glyphMarginClassName: runningValueRef.current
                  ? "cancelQueryGlyph"
                  : "cursorQueryGlyph",
              },
            },
            ...(hasError &&
            errorRange &&
            cursorMatch.range.startLineNumber !== errorRange.startLineNumber
              ? [
                  {
                    range: new monaco.Range(
                      errorRange.startLineNumber,
                      0,
                      errorRange.startLineNumber,
                      0,
                    ),
                    options: {
                      isWholeLine: false,
                      glyphMarginClassName: "errorGlyph",
                    },
                  },
                ]
              : []),
          ])
        }
      }
    }
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
      toggleRunning,
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
      renderLineMarkings(monaco, editor)
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
      }
    }

    const executeQuery = params.get("executeQuery")
    if (executeQuery) {
      toggleRunning()
    }
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
        renderLineMarkings(monacoRef.current, editorRef?.current)
      }

      const request = running.isRefresh
        ? getQueryRequestFromLastExecutedQuery(lastExecutedQuery)
        : getQueryRequestFromEditor(editorRef.current)

      if (request?.query) {
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
                      {result.query !== undefined && result.query !== '' && `: ${result.query}`}
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

                const layoutInfo = editorRef?.current.getLayoutInfo()
                const editorWidth = layoutInfo.contentWidth

                const fontInfo = editorRef?.current
                  .getOptions()
                  .get(monacoRef?.current.editor.EditorOption.fontInfo)
                const charWidth = fontInfo.typicalHalfwidthCharacterWidth

                const columnsInViewport = Math.floor(editorWidth / charWidth)

                editorRef?.current.revealLineInCenter(
                  errorRange.startLineNumber,
                )

                if (errorRange.startColumn > columnsInViewport) {
                  const scrollLeft = (errorRange.startColumn - 1) * charWidth
                  editorRef?.current.setScrollPosition({ scrollLeft })
                }

                editorRef?.current.focus()

                editorRef?.current.setPosition({
                  lineNumber: errorRange.startLineNumber,
                  column: errorRange.startColumn,
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
        renderLineMarkings(monacoRef?.current, editorRef?.current)
      }
    }
  }, [running])

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
