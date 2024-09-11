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

import Dexie from "dexie"
import type { Table } from "dexie"
import type { Buffer } from "./buffers"
import type { Tab, TabContent } from "./tabs"
import { makeTab, makeTabContent, defaultEditorViewState, fallbackTab } from "./tabs";
import { StoreKey } from "../utils/localStorage/types"
import { getValue } from "../utils/localStorage"

type EditorSettings = {
  key: string
  value: string | number
}

export class Storage extends Dexie {
  buffers!: Table<Buffer, number>
  editor_settings!: Table<EditorSettings, number>
  read_notifications!: Table<{ newsId: string }, number>
  tabs!: Table<Tab, number>
  tab_contents!: Table<TabContent, number>

  constructor() {
    super("web-console")
    this.version(1).stores({
      buffers: "++id, label",
      editor_settings: "++id, key",
    })
    this.version(2).stores({
      read_notifications: "++id, newsId",
    })
    this.version(3).stores({
      tabs: "++id, name",
      tab_contents: "id",
    }).upgrade(tx => {
        tx.table("buffers").toCollection().each((buffer, cursor) => {
            tx.table("tabs").add({id: buffer.id, name: buffer.label, archived: false})
            tx.table("tab_contents").add({id: buffer.id, sql: buffer.value, editorViewState: buffer.editorViewState})

            tx.table("editor_settings").add({key: "activeTabId", value: 1})
            tx.table("editor_settings").add({key: "returnTo", value: ""})
            tx.table("editor_settings").add({key: "returnToLabel", value: ""})
        })
    })

    // add initial buffer on db creation
    // this is only called once, when DB is not available yet
    this.on("populate", () => {
      // populate initial buffer with value from localStorage, then clear it.
      // this is to migrate from localStorage to indexedDB
      const valueFromDeprecatedStorage = getValue(StoreKey.QUERY_TEXT)
      if (typeof valueFromDeprecatedStorage !== "undefined") {
        localStorage.removeItem(StoreKey.QUERY_TEXT)
      }

      this.tabs.add(
        makeTab({
          name: "SQL 1",
          archived: false,
        }),
      )

      this.tab_contents.add(
          makeTabContent({
          id: 1,
          sql: valueFromDeprecatedStorage ?? "",
          editorViewState: defaultEditorViewState,
        }),
      )

      this.editor_settings.add({
        key: "activeTabId",
        value: 1,
      })

      this.editor_settings.add({
        key: "returnTo",
        value: "",
      })

      this.editor_settings.add({
        key: "returnToLabel",
        value: "",
      })
    })

    // ensure `tabs` table is not empty when DB is ready
    // user should always have at least one tab.
    this.on("ready", async () => {
      if ((await this.tabs.count()) === 0) {
          this.tabs.add(
              makeTab({
                  name: "SQL 1",
                  archived: false,
              }),
          )

          this.tab_contents.add(
              makeTabContent({
                  id: 1,
                  sql: "",
                  editorViewState: defaultEditorViewState,
              }),
          )
      }

      const url = new URL(window.location.href)
      const keys = ["returnTo", "returnToLabel"]

      await Promise.all(
        keys.map(async (key) => {
            if (url.searchParams.has(key)) {
            const value = url.searchParams.get(key) ?? ""

            const hasValue =
              (await this.editor_settings.where("key").equals(key).count()) !==
              0

            if (hasValue) {
              this.editor_settings.where("key").equals(key).modify({ value })
            } else {
              this.editor_settings.add({
                key,
                value,
              })
            }

            url.searchParams.delete(key)
          }
        }),
      )

      // clear search params from the address bar
      window.history.replaceState({}, "", url)
    })
  }
}

// singleton
export const db = new Storage()
