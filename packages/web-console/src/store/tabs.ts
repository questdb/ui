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

import { db } from "./db"
import type { editor } from "monaco-editor"

export type Tab = {
  /** auto incremented number by Dexie */
  id?: number
  name: string
  archived: boolean
}

export type TabContent = {
  id: number
  sql: string
  editorViewState?: editor.ICodeEditorViewState
}

export const defaultEditorViewState: editor.ICodeEditorViewState = {
  cursorState: [
    {
      inSelectionMode: false,
      selectionStart: {
        lineNumber: 1,
        column: 1,
      },
      position: {
        lineNumber: 1,
        column: 1,
      },
    },
  ],
  contributionsState: [
    {
      "editor.contrib.wordHighlighter": false,
      "editor.contrib.folding": {
        lineCount: 1,
        provider: "indent",
        foldedImports: false,
      },
    },
  ],
  viewState: {
    scrollLeft: 0,
    firstPosition: {
      lineNumber: 1,
      column: 1,
    },
    firstPositionDeltaTop: 0,
  },
}

export const makeTab = ({
  name,
  archived = false
}: {
  name: string,
  archived: boolean
}): Omit<Tab, "id"> => ({
  name,
  archived
})

export const makeTabContent = ({
  id,
  sql,
  editorViewState = defaultEditorViewState,
}: {
  id: number,
  sql: string,
  editorViewState: editor.ICodeEditorViewState
}): TabContent => ({
  id,
  sql: sql ?? "",
  editorViewState,
})

export const fallbackTab = { id: 1, ...makeTab({ name: "SQL 1", archived: false }) }

export const tabStore = {
  getAll: () => db.tabs.toArray(),

  getById: (id: number) => db.tabs.get(id),

  getActiveId: () =>
    db.editor_settings.where("key").equals("activeTabId").first(),

  setActiveId: (id: number) =>
    db.editor_settings
      .where("key")
      .equals("activeTabId")
      .modify({ value: id }),

  update: (id: number, tab: Partial<Tab>) =>
    db.tabs.update(id, tab),

  delete: (id: number) => db.tabs.delete(id),
}

export const tabContentStore = {
  getById: (id: number) => db.tab_contents.get(id),

  update: (id: number, tabContent: Partial<TabContent>) =>
    db.tab_contents.update(id, tabContent),

  delete: (id: number) => db.tab_contents.delete(id),
}
