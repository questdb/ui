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
import type { Monaco } from "@monaco-editor/react"
import { BusEvent } from "../../../consts"
import { actions } from "../../../store"
import { Dispatch } from "redux"

enum Command {
  EXECUTE = "execute",
  FOCUS_GRID = "focus_grid",
  CLEANUP_NOTIFICATIONS = "clean_notifications",
}

export const registerEditorActions = ({
  editor,
  monaco,
  toggleRunning,
  dispatch,
}: {
  editor: editor.IStandaloneCodeEditor
  monaco: Monaco
  toggleRunning: (isRefresh?: boolean) => void
  dispatch: Dispatch
}) => {
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
}
