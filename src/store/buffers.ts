import { RefreshRate } from "../scenes/Editor/Metrics/utils"
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
import {
  MetricType,
  MetricViewMode,
  SampleBy,
} from "scenes/Editor/Metrics/utils"

export enum BufferType {
  SQL = "SQL",
  METRICS = "Metrics",
}

export type Metric = {
  tableId?: number
  metricType: MetricType
  position: number
  color: string
  removed: boolean
}

export type MetricsViewState = {
  dateFrom?: string
  dateTo?: string
  refreshRate?: RefreshRate
  sampleBy?: SampleBy
  viewMode?: MetricViewMode
  metrics?: Metric[]
}

export type Buffer = {
  /** auto incremented number by Dexie */
  id?: number
  label: string
  value: string
  position: number
  archived?: boolean
  archivedAt?: number
  editorViewState?: editor.ICodeEditorViewState
  metricsViewState?: MetricsViewState
  isTemporary?: boolean
  isDiffBuffer?: boolean
  diffContent?: {
    original: string
    modified: string
    explanation: string
    queryStartOffset: number
    originalQuery: string
    queryKey?: string // Links the diff buffer to its source conversation
  }
}

const defaultEditorViewState: editor.ICodeEditorViewState = {
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

export const makeBuffer = ({
  label,
  value,
  editorViewState = defaultEditorViewState,
  metricsViewState,
  position,
  archived,
  archivedAt,
  isTemporary,
  isDiffBuffer,
  diffContent,
}: {
  label: string
  value?: string
  editorViewState?: editor.ICodeEditorViewState
  metricsViewState?: MetricsViewState
  position: number
  archived?: boolean
  archivedAt?: number
  isTemporary?: boolean
  isDiffBuffer?: boolean
  diffContent?: {
    original: string
    modified: string
    explanation: string
    queryStartOffset: number
    originalQuery: string
    queryKey?: string
  }
}): Omit<Buffer, "id"> => ({
  label,
  value: value ?? "",
  editorViewState: metricsViewState ? undefined : editorViewState,
  metricsViewState,
  position,
  archived,
  archivedAt,
  isTemporary,
  isDiffBuffer,
  diffContent,
})

export const makeFallbackBuffer = (bufferType: BufferType): Buffer => {
  return {
    id: 1,
    ...makeBuffer({ label: bufferType, position: 0 }),
  }
}

export const fallbackBuffer = {
  id: 1,
  ...makeBuffer({ label: "SQL", position: 0 }),
}

export const bufferStore = {
  getAll: () => db.buffers.toArray(),

  getById: (id: number) => db.buffers.get(id),

  getMetaById: (id: number) =>
    db.buffers.get(id).then((buffer) => ({
      archived: buffer?.archived,
      archivedAt: buffer?.archivedAt,
      label: buffer?.label,
      type: buffer?.metricsViewState ? BufferType.METRICS : BufferType.SQL,
    })),

  getActiveId: () =>
    db.editor_settings.where("key").equals("activeBufferId").first(),

  setActiveId: (id: number) =>
    db.editor_settings
      .where("key")
      .equals("activeBufferId")
      .modify({ value: id }),

  getBufferTypeById: (id: number) =>
    db.buffers
      .get(id)
      .then((buffer) =>
        buffer?.metricsViewState ? BufferType.METRICS : BufferType.SQL,
      ),

  update: (id: number, buffer: Partial<Buffer>) =>
    db.buffers.update(id, buffer),

  delete: (id: number) => db.buffers.delete(id),

  deleteAll: () => db.buffers.clear(),
}
