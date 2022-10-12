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

export type Buffer = {
  /** auto incremented number by Dexie */
  id?: number
  label: string
  value: string
}

export const makeBuffer = ({
  label,
  value,
}: {
  label: string
  value?: string
}): Omit<Buffer, "id"> => ({
  label,
  value: value ?? "",
})

export const fallbackBuffer = { id: 1, ...makeBuffer({ label: "SQL" }) }

export const bufferStore = {
  getActiveId: () =>
    db.editor_settings.where("key").equals("activeBufferId").first(),

  setActiveId: (id: number) =>
    db.editor_settings
      .where("key")
      .equals("activeBufferId")
      .modify({ value: id }),

  update: (id: number, buffer: Partial<Buffer>) =>
    db.buffers.update(id, buffer),

  delete: (id: number) => db.buffers.delete(id),
}
