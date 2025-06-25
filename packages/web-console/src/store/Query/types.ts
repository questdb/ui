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

export type QueryKey = `${string}@${number}-${number}`

export enum NotificationType {
  ERROR = "error",
  INFO = "info",
  SUCCESS = "success",
  NOTICE = "notice",
  LOADING = "loading",
}

export type NotificationShape = Readonly<{
  query: QueryKey
  createdAt: Date
  content: ReactNode
  sideContent?: ReactNode
  line2?: ReactNode
  type: NotificationType
  jitCompiled?: boolean
  isMinimized?: boolean
  isExplain?: boolean
  updateActiveNotification?: boolean
}>

export type QueryNotifications = Readonly<{
  latest: NotificationShape
  regular?: NotificationShape
  explain?: NotificationShape
}>

export type RunningShape = Readonly<{
  value: boolean
  isRefresh: boolean
  isExplain?: boolean
}>

export type QueryStateShape = Readonly<{
  notifications: NotificationShape[]
  tables: Table[]
  columns: InformationSchemaColumn[]
  result?: QueryRawResult
  running: RunningShape
  queryNotifications: Record<QueryKey, QueryNotifications>
  activeNotification: NotificationShape | null
}>

export enum QueryAT {
  ADD_NOTIFICATION = "QUERY/ADD_NOTIFICATION",
  CLEANUP_NOTIFICATIONS = "QUERY/CLEANUP_NOTIFICATIONS",
  REMOVE_NOTIFICATION = "QUERY/REMOVE_NOTIFICATION",
  UPDATE_NOTIFICATION_KEY = "QUERY/UPDATE_NOTIFICATION_KEY",
  SET_RESULT = "QUERY/SET_RESULT",
  STOP_RUNNING = "QUERY/STOP_RUNNING",
  TOGGLE_RUNNING = "QUERY/TOGGLE_RUNNING",
  SET_TABLES = "QUERY/SET_TABLES",
  SET_COLUMNS = "QUERY/SET_COLUMNS",
  SET_ACTIVE_NOTIFICATION = "QUERY/SET_ACTIVE_NOTIFICATION",
}

type AddNotificationAction = Readonly<{
  payload: NotificationShape
  type: QueryAT.ADD_NOTIFICATION
}>

type CleanupNotificationsAction = Readonly<{
  type: QueryAT.CLEANUP_NOTIFICATIONS
}>

type RemoveNotificationAction = Readonly<{
  payload: QueryKey
  type: QueryAT.REMOVE_NOTIFICATION
}>

type SetResultAction = Readonly<{
  payload: QueryRawResult | undefined
  type: QueryAT.SET_RESULT
}>

type StopRunningAction = Readonly<{
  type: QueryAT.STOP_RUNNING
}>

type ToggleRunningAction = Readonly<{
  type: QueryAT.TOGGLE_RUNNING
  payload: Readonly<{
    isRefresh: boolean
    isExplain?: boolean
  }>
}>

type SetTablesAction = Readonly<{
  type: QueryAT.SET_TABLES
  payload: Readonly<{
    tables: Table[]
  }>
}>

type SetColumnsActions = Readonly<{
  type: QueryAT.SET_COLUMNS
  payload: Readonly<{
    columns: InformationSchemaColumn[]
  }>
}>

type SetActiveNotificationAction = Readonly<{
  type: QueryAT.SET_ACTIVE_NOTIFICATION
  payload: NotificationShape | null
}>

type UpdateNotificationKeyAction = Readonly<{
  type: QueryAT.UPDATE_NOTIFICATION_KEY
  payload: Readonly<{
    oldKey: QueryKey
    newKey: QueryKey
  }>
}>

export type QueryAction =
  | AddNotificationAction
  | CleanupNotificationsAction
  | RemoveNotificationAction
  | UpdateNotificationKeyAction
  | SetResultAction
  | StopRunningAction
  | ToggleRunningAction
  | SetTablesAction
  | SetColumnsActions
  | SetActiveNotificationAction
