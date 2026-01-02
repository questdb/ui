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
import type { Monaco } from "@monaco-editor/react"

import {
  conf as QuestDBLanguageConf,
  documentFormattingEditProvider,
  documentRangeFormattingEditProvider,
  language as QuestDBLanguage,
} from "./questdb-sql"

import { QuestDBLanguageName } from "./utils"
import { bufferStore } from "../../../store/buffers"
import type { editor, IDisposable } from "monaco-editor"
import { eventBus } from "../../../modules/EventBus"
import { EventType } from "../../../modules/EventBus/types"

enum Command {
  EXECUTE = "execute",
  RUN_SCRIPT = "run_script",
  FOCUS_GRID = "focus_grid",
  ADD_NEW_TAB = "add_new_tab",
  CLOSE_ACTIVE_TAB = "close_active_tab",
  SEARCH_DOCS = "search_docs",
  EXPLAIN_QUERY = "explain_query",
}

export const registerEditorActions = ({
  editor,
  monaco,
  runQuery,
  runScript,
  onTabClosed,
  deleteBuffer,
  addBuffer,
}: {
  editor: editor.IStandaloneCodeEditor
  monaco: Monaco
  runQuery: () => void
  runScript: () => void
  deleteBuffer: (id: number) => void
  addBuffer: () => void
  onTabClosed?: () => void
}) => {
  const actions: IDisposable[] = []
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    () => {},
  )

  actions.push(
    editor.addAction({
      id: Command.EXECUTE,
      label: "Execute command",
      keybindings: [
        monaco.KeyCode.F9,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      ],
      run: () => {
        runQuery()
      },
    }),
  )

  actions.push(
    editor.addAction({
      id: Command.RUN_SCRIPT,
      label: "Run script",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      ],
      run: () => {
        runScript()
      },
    }),
  )

  actions.push(
    editor.addAction({
      id: Command.ADD_NEW_TAB,
      label: "Add new tab",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyT],
      run: () => {
        addBuffer()
      },
    }),
  )

  actions.push(
    editor.addAction({
      id: Command.CLOSE_ACTIVE_TAB,
      label: "Close current tab",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyW],
      run: async () => {
        const buffers = await bufferStore.getAll()
        const activeId = await bufferStore.getActiveId()
        if (
          buffers.length > 1 &&
          activeId?.value &&
          typeof activeId?.value === "number"
        ) {
          deleteBuffer(activeId.value)
          if (onTabClosed) {
            onTabClosed()
          }
        }
      },
    }),
  )

  actions.push(
    editor.addAction({
      id: Command.SEARCH_DOCS,
      label: "Search QuestDB Docs",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      run: () => {
        const docSearchButton =
          document.querySelector<HTMLButtonElement>(".DocSearch-Button")
        if (docSearchButton) {
          docSearchButton.click()
        }
      },
    }),
  )

  actions.push(
    editor.addAction({
      id: Command.EXPLAIN_QUERY,
      label: "Explain query",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
      run: () => {
        eventBus.publish(EventType.EXPLAIN_QUERY_EXEC)
      },
    }),
  )

  return () => {
    actions.forEach((action) => {
      action.dispose()
    })
  }
}

export const registerLanguageAddons = (monaco: Monaco) => {
  monaco.languages.register({ id: QuestDBLanguageName })

  monaco.languages.setMonarchTokensProvider(
    QuestDBLanguageName,
    QuestDBLanguage,
  )

  monaco.languages.setLanguageConfiguration(
    QuestDBLanguageName,
    QuestDBLanguageConf,
  )

  monaco.languages.registerDocumentFormattingEditProvider(
    QuestDBLanguageName,
    documentFormattingEditProvider,
  )

  monaco.languages.registerDocumentRangeFormattingEditProvider(
    QuestDBLanguageName,
    documentRangeFormattingEditProvider,
  )
}
