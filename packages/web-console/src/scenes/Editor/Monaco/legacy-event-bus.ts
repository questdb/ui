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

import { editor } from "monaco-editor"
import { BusEvent } from "../../../consts"
import { appendQuery } from "./utils"

export const registerLegacyEventBusEvents = ({
  editor,
  insertTextAtCursor,
  toggleRunning,
}: {
  editor: editor.IStandaloneCodeEditor
  insertTextAtCursor: (text: string) => void
  toggleRunning: (isRefresh?: boolean) => void
}) => {
  window.bus.on(BusEvent.MSG_EDITOR_INSERT_COLUMN, (_event, column) => {
    insertTextAtCursor(column)
  })

  window.bus.on(BusEvent.MSG_QUERY_FIND_N_EXEC, (_event, query: string) => {
    const text = `${query};`
    appendQuery(editor, text)
    toggleRunning()
  })

  window.bus.on(BusEvent.MSG_QUERY_EXEC, (_event, query: { q: string }) => {
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
}
