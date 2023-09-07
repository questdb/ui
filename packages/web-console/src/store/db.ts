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
import { makeBuffer, fallbackBuffer } from "./buffers"
import { StoreKey } from "../utils/localStorage/types"
import { getValue } from "../utils/localStorage"

type EditorSettings = {
  key: string
  value: string | number
}

export class Storage extends Dexie {
  buffers!: Table<Buffer, number>
  editor_settings!: Table<EditorSettings, number>

  constructor() {
    super("web-console")
    this.version(1).stores({
      buffers: "++id, label",
      editor_settings: "++id, key",
    })

    // add initial buffer on db creation
    // this is only called once, when DB is not available yet
    this.on("populate", () => {
      // populate intial buffer with value from localStorage, then clear it.
      // this is to migrate from localStorage to indexedDB
      const valueFromDeprecatedStorage = getValue(StoreKey.QUERY_TEXT)
      if (typeof valueFromDeprecatedStorage !== "undefined") {
        localStorage.removeItem(StoreKey.QUERY_TEXT)
      }

      this.buffers.add(
        makeBuffer({
          label: "SQL",
          value: valueFromDeprecatedStorage ?? "",
        }),
      )
      this.editor_settings.add({
        key: "activeBufferId",
        value: fallbackBuffer.id,
      })
    })

    // ensure `buffers` table is not empty when DB is ready
    // user should always have at least one buffer.
    this.on("ready", async () => {
      if ((await this.buffers.count()) === 0) {
        this.buffers.add(
          makeBuffer({
            label: "SQL",
            value: "",
          }),
        )
      }
    })
  }
}

// singleton
export const db = new Storage()
