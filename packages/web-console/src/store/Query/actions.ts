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

import type { ReactNode } from "react"

import type {
  QueryRawResult,
  Table,
  InformationSchemaColumn,
} from "utils/questdb"

import {
  NotificationShape,
  NotificationType,
  QueryAction,
  QueryAT,
  QueryKey,
  RunningType,
  QueriesToRun,
} from "../../types"

const setTables = (payload: Table[]): QueryAction => ({
  payload: {
    tables: payload,
  },
  type: QueryAT.SET_TABLES,
})

const setColumns = (payload: InformationSchemaColumn[]): QueryAction => ({
  payload: {
    columns: payload,
  },
  type: QueryAT.SET_COLUMNS,
})

const addNotification = (
  payload: Partial<NotificationShape> & { content: ReactNode, query: QueryKey },
  bufferId?: number,
): QueryAction => ({
  payload: {
    createdAt: new Date(),
    type: NotificationType.SUCCESS,
    ...payload,
    bufferId,
  },
  type: QueryAT.ADD_NOTIFICATION,
})

const cleanupNotifications = (): QueryAction => ({
  type: QueryAT.CLEANUP_NOTIFICATIONS,
})

const cleanupBufferNotifications = (bufferId: number): QueryAction => ({
  type: QueryAT.CLEANUP_BUFFER_NOTIFICATIONS,
  payload: {
    bufferId,
  },
})

const removeNotification = (payload: QueryKey, bufferId?: number): QueryAction => ({
  payload,
  bufferId,
  type: QueryAT.REMOVE_NOTIFICATION,
})

const setResult = (payload: QueryRawResult | undefined): QueryAction => ({
  payload,
  type: QueryAT.SET_RESULT,
})

const stopRunning = (): QueryAction => ({
  type: QueryAT.STOP_RUNNING,
})

const toggleRunning = (
  payload?: RunningType
): QueryAction => ({
  type: QueryAT.TOGGLE_RUNNING,
  payload,
})

const setActiveNotification = (payload: NotificationShape | null): QueryAction => ({
  type: QueryAT.SET_ACTIVE_NOTIFICATION,
  payload,
})

const updateNotificationKey = (oldKey: QueryKey, newKey: QueryKey, bufferId?: number): QueryAction => ({
  type: QueryAT.UPDATE_NOTIFICATION_KEY,
  payload: {
    oldKey,
    newKey,
    bufferId,
  },
})

const setQueriesToRun = (payload: QueriesToRun): QueryAction => ({
  type: QueryAT.SET_QUERIES_TO_RUN,
  payload,
})

export default {
  addNotification,
  cleanupNotifications,
  cleanupBufferNotifications,
  removeNotification,
  updateNotificationKey,
  setResult,
  stopRunning,
  toggleRunning,
  setTables,
  setColumns,
  setActiveNotification,
  setQueriesToRun,
}
