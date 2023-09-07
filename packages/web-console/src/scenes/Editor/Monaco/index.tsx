import React, { useContext, useEffect, useRef, useState } from "react"
import type { BaseSyntheticEvent } from "react"
import Editor, { Monaco, loader } from "@monaco-editor/react"
import dracula from "./dracula"
import { editor } from "monaco-editor"
import type { IDisposable, IRange } from "monaco-editor"
import { theme } from "../../../theme"
import { QuestContext, useEditor } from "../../../providers"
import {
  appendQuery,
  getErrorRange,
  getQueryRequestFromEditor,
  getQueryRequestFromLastExecutedQuery,
  QuestDBLanguageName,
  setErrorMarker,
  clearModelMarkers,
  getQueryFromCursor,
  findMatches,
  AppendQueryOptions,
} from "./utils"
import type { Request } from "./utils"
import { PaneContent, Text } from "../../../components"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../../store"
import { BusEvent } from "../../../consts"
import type { ErrorResult } from "../../../utils/questdb"
import * as QuestDB from "../../../utils/questdb"
import { NotificationType } from "../../../types"
import QueryResult from "../QueryResult"
import Loader from "../Loader"
import styled from "styled-components"
import {
  conf as QuestDBLanguageConf,
  language as QuestDBLanguage,
  createQuestDBCompletionProvider,
  createSchemaCompletionProvider,
  documentFormattingEditProvider,
  documentRangeFormattingEditProvider,
} from "./questdb-sql"
import { color } from "../../../utils"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

const Content = styled(PaneContent)`
  position: relative;
  overflow: hidden;

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

  .cursorQueryGlyph {
    margin-left: 2rem;
    z-index: 1;
    cursor: pointer;

    &:after {
      content: "◃";
      font-size: 2.5rem;
      transform: rotate(180deg) scaleX(0.8);
      color: ${color("green")};
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

enum Command {
  EXECUTE = "execute",
  FOCUS_GRID = "focus_grid",
  CLEANUP_NOTIFICATIONS = "clean_notifications",
}

const MonacoEditor = () => {
  const {
    editorRef,
    monacoRef,
    insertTextAtCursor,
    activeBuffer,
    updateBuffer,
  } = useEditor()
  const { quest } = useContext(QuestContext)
  const [request, setRequest] = useState<Request | undefined>()
  const [editorReady, setEditorReady] = useState<boolean>(false)
  const [lastExecutedQuery, setLastExecutedQuery] = useState("")
  const dispatch = useDispatch()
  const running = useSelector(selectors.query.getRunning)
  const tables = useSelector(selectors.query.getTables)
  const [schemaCompletionHandle, setSchemaCompletionHandle] =
    useState<IDisposable>()
  const decorationsRef = useRef<string[]>([])
  const errorRef = useRef<ErrorResult | undefined>()
  const errorRangeRef = useRef<IRange | undefined>()

  const toggleRunning = (isRefresh: boolean = false) => {
    dispatch(actions.query.toggleRunning(isRefresh))
  }

  const handleEditorBeforeMount = (monaco: Monaco) => {
    monaco.languages.register({ id: QuestDBLanguageName })

    monaco.languages.setMonarchTokensProvider(
      QuestDBLanguageName,
      QuestDBLanguage,
    )

    monaco.languages.setLanguageConfiguration(
      QuestDBLanguageName,
      QuestDBLanguageConf,
    )

    monaco.languages.registerCompletionItemProvider(
      QuestDBLanguageName,
      createQuestDBCompletionProvider(),
    )

    monaco.languages.registerDocumentFormattingEditProvider(
      QuestDBLanguageName,
      documentFormattingEditProvider,
    )

    monaco.languages.registerDocumentRangeFormattingEditProvider(
      QuestDBLanguageName,
      documentRangeFormattingEditProvider,
    )

    setSchemaCompletionHandle(
      monaco.languages.registerCompletionItemProvider(
        QuestDBLanguageName,
        createSchemaCompletionProvider(tables),
      ),
    )

    monaco.editor.defineTheme("dracula", dracula)
  }

  const handleEditorClick = (e: BaseSyntheticEvent) => {
    if (e.target.classList.contains("cursorQueryGlyph")) {
      editorRef?.current?.focus()
      toggleRunning()
    }
  }

  const renderLineMarkings = (
    monaco: Monaco,
    editor: IStandaloneCodeEditor,
  ) => {
    const queryAtCursor = getQueryFromCursor(editor)
    const model = editor.getModel()
    if (queryAtCursor && model !== null) {
      const matches = findMatches(model, queryAtCursor.query)

      if (matches.length > 0) {
        const hasError = errorRef.current?.query === queryAtCursor.query
        const cursorMatch = matches.find(
          (m) => m.range.startLineNumber === queryAtCursor.row + 1,
        )
        if (cursorMatch) {
          decorationsRef.current = editor.deltaDecorations(
            decorationsRef.current,
            [
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
                  glyphMarginClassName: "cursorQueryGlyph",
                },
              },
              ...(errorRangeRef.current &&
              cursorMatch.range.startLineNumber !==
                errorRangeRef.current.startLineNumber
                ? [
                    {
                      range: new monaco.Range(
                        errorRangeRef.current.startLineNumber,
                        0,
                        errorRangeRef.current.startLineNumber,
                        0,
                      ),
                      options: {
                        isWholeLine: false,
                        glyphMarginClassName: "errorGlyph",
                      },
                    },
                  ]
                : []),
            ],
          )
        }
      }
    }
  }

  const handleEditorDidMount = (
    editor: IStandaloneCodeEditor,
    monaco: Monaco,
  ) => {
    monaco.editor.setTheme("dracula")
    editor.setModel(
      monaco.editor.createModel(activeBuffer.value, QuestDBLanguageName),
    )

    if (monacoRef) {
      monacoRef.current = monaco
      setEditorReady(true)
    }

    if (editorRef) {
      editorRef.current = editor

      // Support legacy bus events for non-react codebase
      window.bus.on(BusEvent.MSG_EDITOR_INSERT_COLUMN, (_event, column) => {
        insertTextAtCursor(column)
      })

      window.bus.on(
        BusEvent.MSG_QUERY_FIND_N_EXEC,
        (_event, payload: { query: string; options?: AppendQueryOptions }) => {
          const text = `${payload.query};`
          appendQuery(editor, text, payload.options)
          toggleRunning()
        },
      )

      window.bus.on(BusEvent.MSG_QUERY_EXEC, (_event, query: { q: string }) => {
        // TODO: Display a query marker on correct line
        toggleRunning(true)
      })

      window.bus.on(
        BusEvent.MSG_QUERY_EXPORT,
        (_event, request?: { q: string }) => {
          if (request) {
            window.location.href = `/exp?query=${encodeURIComponent(request.q)}`
          }
        },
      )

      window.bus.on(BusEvent.MSG_EDITOR_FOCUS, () => {
        const position = editor.getPosition()
        if (position) {
          editor.setPosition({
            lineNumber: position.lineNumber + 1,
            column: position?.column,
          })
        }
        editor.focus()
      })

      editor.addAction({
        id: Command.FOCUS_GRID,
        label: "Focus Grid",
        keybindings: [monaco.KeyCode.F2],
        run: () => {
          window.bus.trigger(BusEvent.GRID_FOCUS)
        },
      })

      editor.addAction({
        id: Command.EXECUTE,
        label: "Execute command",
        keybindings: [
          monaco.KeyCode.F9,
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        ],
        run: () => {
          toggleRunning()
        },
      })

      editor.addAction({
        id: Command.CLEANUP_NOTIFICATIONS,
        label: "Clear all notifications",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
        run: () => {
          dispatch(actions.query.cleanupNotifications())
        },
      })

      editor.onDidChangeCursorPosition(() => {
        renderLineMarkings(monaco, editor)
      })
    }

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
    if (!running.value && request) {
      quest.abort()
      dispatch(actions.query.stopRunning())
      setRequest(undefined)
    }
  }, [request, quest, dispatch, running])

  useEffect(() => {
    if (running.value && editorRef?.current) {
      if (monacoRef?.current) {
        clearModelMarkers(monacoRef.current, editorRef.current)
      }

      const request = running.isRefresh
        ? getQueryRequestFromLastExecutedQuery(lastExecutedQuery)
        : getQueryRequestFromEditor(editorRef.current)

      if (request?.query) {
        void quest
          .queryRaw(request.query, { limit: "0,1000", explain: true })
          .then((result) => {
            setRequest(undefined)
            errorRef.current = undefined
            errorRangeRef.current = undefined
            dispatch(actions.query.stopRunning())
            dispatch(actions.query.setResult(result))

            if (monacoRef?.current && editorRef?.current) {
              renderLineMarkings(monacoRef.current, editorRef?.current)
            }

            if (result.type === QuestDB.Type.DDL) {
              dispatch(
                actions.query.addNotification({
                  content: (
                    <Text color="foreground" ellipsis title={result.query}>
                      {result.query}
                    </Text>
                  ),
                }),
              )
              bus.trigger(BusEvent.MSG_QUERY_SCHEMA)
            }

            if (result.type === QuestDB.Type.DQL) {
              setLastExecutedQuery(request.query)
              dispatch(
                actions.query.addNotification({
                  jitCompiled: result.explain?.jitCompiled ?? false,
                  content: (
                    <QueryResult {...result.timings} rowCount={result.count} />
                  ),
                  sideContent: (
                    <Text color="foreground" ellipsis title={result.query}>
                      {result.query}
                    </Text>
                  ),
                }),
              )
              bus.trigger(BusEvent.MSG_QUERY_DATASET, result)
            }
          })
          .catch((error: ErrorResult) => {
            errorRef.current = error
            setRequest(undefined)
            dispatch(actions.query.stopRunning())
            dispatch(
              actions.query.addNotification({
                content: <Text color="red">{error.error}</Text>,
                sideContent: (
                  <Text color="foreground" ellipsis title={request.query}>
                    {request.query}
                  </Text>
                ),
                type: NotificationType.ERROR,
              }),
            )

            if (editorRef?.current && monacoRef?.current) {
              const errorRange = getErrorRange(
                editorRef.current,
                request,
                error.position,
              )
              errorRangeRef.current = errorRange ?? undefined
              if (errorRange) {
                setErrorMarker(
                  monacoRef?.current,
                  editorRef.current,
                  errorRange,
                  error.error,
                )
                renderLineMarkings(monacoRef?.current, editorRef?.current)
              }
            }
          })
        setRequest(request)
      } else {
        dispatch(actions.query.stopRunning())
      }
    }
  }, [quest, dispatch, running])

  useEffect(() => {
    if (editorReady && monacoRef?.current) {
      schemaCompletionHandle?.dispose()
      setSchemaCompletionHandle(
        monacoRef.current.languages.registerCompletionItemProvider(
          QuestDBLanguageName,
          createSchemaCompletionProvider(tables),
        ),
      )
    }
  }, [tables, monacoRef, editorReady])

  return (
    <Content onClick={handleEditorClick}>
      <Editor
        beforeMount={handleEditorBeforeMount}
        defaultLanguage={QuestDBLanguageName}
        onMount={handleEditorDidMount}
        saveViewState={false}
        onChange={(value) => {
          updateBuffer(activeBuffer.id as number, { value })
        }}
        options={{
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
        }}
        theme="vs-dark"
      />
      <Loader show={!!request || !tables} />
    </Content>
  )
}

export default MonacoEditor
