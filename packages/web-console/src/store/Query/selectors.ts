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

import { NotificationShape, RunningShape, StoreShape } from "types"
import type {
  QueryRawResult,
  Table,
  InformationSchemaColumn,
} from "utils/questdb"

const getNotifications: (store: StoreShape) => NotificationShape[] = (store) =>
  store.query.notifications.map((query) => store.query.queryNotifications[query])

const getQueryNotifications: (store: StoreShape) => Record<string, NotificationShape> = (store) =>
  store.query.queryNotifications

const getActiveNotification: (store: StoreShape) => NotificationShape | null = (store) =>
  store.query.activeNotification

const getResult: (store: StoreShape) => undefined | QueryRawResult = (store) =>
  store.query.result

const getRunning: (store: StoreShape) => RunningShape = (store) =>
  store.query.running

const getTables: (store: StoreShape) => Table[] = (store) => store.query.tables

const getColumns: (store: StoreShape) => InformationSchemaColumn[] = (store) =>
  store.query.columns

export default {
  getNotifications,
  getQueryNotifications,
  getActiveNotification,
  getResult,
  getRunning,
  getTables,
  getColumns,
}
