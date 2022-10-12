/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, { useContext, useEffect, useRef, useState } from "react"
import type { BaseSyntheticEvent } from "react"
import Editor, { Monaco, loader } from "@monaco-editor/react"
import dracula from "./dracula"
import { editor } from "monaco-editor"
import type { IDisposable, IRange } from "monaco-editor"
import { theme } from "../../../theme"
import { QuestContext, useEditor } from "../../../providers"
import { usePreferences } from "./usePreferences"
import {
  appendQuery,
  getErrorRange,
  getQueryRequestFromEditor,
  getQueryRequestFromLastExecutedQuery,
  QuestDBLanguageName,
  setErrorMarker,
  clearModelMarkers,
  getQueryFromCursor,
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
import { createSchemaCompletionProvider } from "./questdb-sql"
import { color } from "../../../utils"
import { EditorTabs } from "./editor-tabs"
import { registerEditorActions, registerLanguageAddons } from "./editor-addons"
import { registerLegacyEventBusEvents } from "./legacy-event-bus"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`

const Content = styled(PaneContent)`
  position: relative;
  overflow: hidden;

  .monaco-scrollable-element > .scrollbar > .slider {
    background: ${color("draculaSelection")};
  }

  .cursorQueryDecoration {
    width: 0.2rem !important;
    background: ${color("draculaGreen")};
    margin-left: 1.2rem;

    &.hasError {
      background: ${color("draculaRed")};
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
      color: ${color("draculaGreen")};
    }
  }

  .errorGlyph {
    margin-left: 2.5rem;
    margin-top: 0.5rem;
    z-index: 1;
    width: 0.75rem !important;
    height: 0.75rem !important;
    border-radius: 50%;
    background: ${color("draculaRed")};
  }
`

const MonacoEditor = () => {
  const {
    editorRef,
    monacoRef,
    insertTextAtCursor,
    activeBuffer,
    updateBuffer,
  } = useEditor()
  const { loadPreferences, savePreferences } = usePreferences()
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

  const beforeMount = (monaco: Monaco) => {
    registerLanguageAddons(monaco)

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
      const matches = model.findMatches(
        queryAtCursor.query,
        true,
        false,
        true,
        null,
        true,
      )
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

  const onMount = (editor: IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    monaco.editor.setTheme("dracula")
    setEditorReady(true)

    // Support legacy bus events for non-react codebase
    registerLegacyEventBusEvents({ editor, insertTextAtCursor, toggleRunning })
    registerEditorActions({ editor, monaco, toggleRunning, dispatch })
    editor.onDidChangeCursorPosition(() => renderLineMarkings(monaco, editor))

    loadPreferences(editor)

    // Insert query, if one is found in the URL
    const params = new URLSearchParams(window.location.search)
    // Support multi-line queries (URL encoded)
    const query = params.get("query")
    const model = editor.getModel()
    if (query) {
      // Find if the query is already in the editor
      const matches = model?.findMatches(query, true, false, true, null, true)
      if (matches && matches.length > 0) {
        editor.setSelection(matches[0].range)
        // otherwise, append the query
      } else {
        appendQuery(editor, query, { appendAt: "end" })
      }
    }

    if (params.get("executeQuery")) {
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
                    <Text
                      color="draculaForeground"
                      ellipsis
                      title={result.query}
                    >
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
                    <Text
                      color="draculaForeground"
                      ellipsis
                      title={result.query}
                    >
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
                content: <Text color="draculaRed">{error.error}</Text>,
                sideContent: (
                  <Text
                    color="draculaForeground"
                    ellipsis
                    title={request.query}
                  >
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
    const editor = editorRef?.current

    if (running.value && editor) {
      savePreferences(editor)
    }
  }, [running, savePreferences])

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
    <Root>
      <EditorTabs />
      <Content onClick={handleEditorClick}>
        <Editor
          beforeMount={beforeMount}
          onMount={onMount}
          defaultLanguage={QuestDBLanguageName}
          defaultValue={activeBuffer.value}
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
          path={activeBuffer.label}
          theme="vs-dark"
        />
        <Loader show={!!request || !tables} />
      </Content>
    </Root>
  )
}

export default MonacoEditor
