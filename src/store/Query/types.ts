import type { ReactNode } from "react"
import type { EditorBatchTransfer } from "../../utils/notebooks/notebookTransfer"

import type {
  QueryRawResult,
  Table,
  InformationSchemaColumn,
} from "utils/questdb"
import type { Request } from "../../scenes/Editor/Monaco/utils"

export type QueryKey = `${string}@${number}-${number}`
export type NotificationNamespaceKey = string | number

export type QueryKeyUpdate = Readonly<{
  oldKey: QueryKey
  newKey: QueryKey
}>

export enum NotificationType {
  ERROR = "error",
  INFO = "info",
  SUCCESS = "success",
  NOTICE = "notice",
  LOADING = "loading",
}

export enum RunningType {
  SCRIPT = "script",
  EXPLAIN = "explain",
  REFRESH = "refresh",
  QUERY = "query",
  NONE = "none",
}

export type QueriesToRun = Readonly<Request[]>

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
  compact?: boolean
  hideTimestamp?: boolean
}>

export type QueryNotifications = Readonly<{
  latest: NotificationShape
  regular?: NotificationShape
  explain?: NotificationShape
}>

export type ScriptBatchTransfer = EditorBatchTransfer & { notificationAt: Date }

export type QueryStateShape = Readonly<{
  notifications: NotificationShape[]
  tables: Table[]
  columns: Record<string, InformationSchemaColumn[]>
  result?: QueryRawResult
  resultSource?: { bufferId?: number; fetchedAt: number }
  batchTransfer?: ScriptBatchTransfer
  executionCounts?: Record<string, number>
  running: RunningType
  queryNotifications: Record<
    NotificationNamespaceKey,
    Record<QueryKey, QueryNotifications>
  >
  activeNotification: NotificationShape | null
  queriesToRun: QueriesToRun
}>

export enum QueryAT {
  ADD_NOTIFICATION = "QUERY/ADD_NOTIFICATION",
  CLEANUP_NOTIFICATIONS = "QUERY/CLEANUP_NOTIFICATIONS",
  CLEANUP_BUFFER_NOTIFICATIONS = "QUERY/CLEANUP_BUFFER_NOTIFICATIONS",
  REMOVE_NOTIFICATION = "QUERY/REMOVE_NOTIFICATION",
  UPDATE_NOTIFICATION_KEY = "QUERY/UPDATE_NOTIFICATION_KEY",
  UPDATE_NOTIFICATION_KEYS = "QUERY/UPDATE_NOTIFICATION_KEYS",
  MOVE_NOTIFICATION_NAMESPACE = "QUERY/MOVE_NOTIFICATION_NAMESPACE",
  SET_RESULT = "QUERY/SET_RESULT",
  SET_BATCH_TRANSFER = "QUERY/SET_BATCH_TRANSFER",
  RECORD_QUERY_EXECUTION = "QUERY/RECORD_QUERY_EXECUTION",
  CLEAR_QUERY_EXECUTIONS = "QUERY/CLEAR_QUERY_EXECUTIONS",
  STOP_RUNNING = "QUERY/STOP_RUNNING",
  TOGGLE_RUNNING = "QUERY/TOGGLE_RUNNING",
  SET_TABLES = "QUERY/SET_TABLES",
  SET_COLUMNS = "QUERY/SET_COLUMNS",
  SET_ACTIVE_NOTIFICATION = "QUERY/SET_ACTIVE_NOTIFICATION",
  SET_QUERIES_TO_RUN = "QUERY/SET_QUERIES_TO_RUN",
}

type AddNotificationAction = Readonly<{
  payload: NotificationShape & { bufferId?: NotificationNamespaceKey }
  type: QueryAT.ADD_NOTIFICATION
}>

type CleanupNotificationsAction = Readonly<{
  type: QueryAT.CLEANUP_NOTIFICATIONS
}>

type CleanupBufferNotificationsAction = Readonly<{
  type: QueryAT.CLEANUP_BUFFER_NOTIFICATIONS
  payload: {
    bufferId: NotificationNamespaceKey
  }
}>

type RemoveNotificationAction = Readonly<{
  payload: QueryKey
  bufferId?: NotificationNamespaceKey
  type: QueryAT.REMOVE_NOTIFICATION
}>

type SetResultAction = Readonly<{
  payload: QueryRawResult | undefined
  source?: { bufferId?: number; fetchedAt: number }
  type: QueryAT.SET_RESULT
}>

type StopRunningAction = Readonly<{
  type: QueryAT.STOP_RUNNING
}>

type ToggleRunningAction = Readonly<{
  type: QueryAT.TOGGLE_RUNNING
  payload?: RunningType
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
  payload: {
    oldKey: QueryKey
    newKey: QueryKey
    bufferId?: NotificationNamespaceKey
    preserveOldKey?: boolean
  }
}>

type UpdateNotificationKeysAction = Readonly<{
  type: QueryAT.UPDATE_NOTIFICATION_KEYS
  payload: {
    updates: QueryKeyUpdate[]
    bufferId: NotificationNamespaceKey
  }
}>

type MoveNotificationNamespaceAction = Readonly<{
  type: QueryAT.MOVE_NOTIFICATION_NAMESPACE
  payload: {
    fromBufferId: NotificationNamespaceKey
    toBufferId: NotificationNamespaceKey
    newQueryKey: QueryKey
  }
}>

type SetQueriesToRunAction = Readonly<{
  type: QueryAT.SET_QUERIES_TO_RUN
  payload: QueriesToRun
}>

export type QueryAction =
  | { type: QueryAT.RECORD_QUERY_EXECUTION; payload: string }
  | { type: QueryAT.CLEAR_QUERY_EXECUTIONS }
  | {
      type: QueryAT.SET_BATCH_TRANSFER
      payload: ScriptBatchTransfer
    }
  | AddNotificationAction
  | CleanupNotificationsAction
  | CleanupBufferNotificationsAction
  | RemoveNotificationAction
  | UpdateNotificationKeyAction
  | UpdateNotificationKeysAction
  | MoveNotificationNamespaceAction
  | SetResultAction
  | StopRunningAction
  | ToggleRunningAction
  | SetTablesAction
  | SetColumnsActions
  | SetActiveNotificationAction
  | SetQueriesToRunAction
