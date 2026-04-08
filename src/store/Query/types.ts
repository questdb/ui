import type { ReactNode } from "react"

import type {
  QueryRawResult,
  Table,
  InformationSchemaColumn,
} from "utils/questdb"
import type { Request } from "../../scenes/Editor/Monaco/utils"

export type QueryKey = `${string}@${number}-${number}`
export type NotificationNamespaceKey = string | number

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
}>

export type QueryNotifications = Readonly<{
  latest: NotificationShape
  regular?: NotificationShape
  explain?: NotificationShape
}>

export type ActiveQueryExecution = {
  bufferId: NotificationNamespaceKey
  queryKey: QueryKey
} | null

export type QueryStateShape = Readonly<{
  notifications: NotificationShape[]
  tables: Table[]
  columns: Record<string, InformationSchemaColumn[]>
  result?: QueryRawResult
  running: RunningType
  queryNotifications: Record<
    NotificationNamespaceKey,
    Record<QueryKey, QueryNotifications>
  >
  activeNotification: NotificationShape | null
  queriesToRun: QueriesToRun
  activeQueryExecution: ActiveQueryExecution
}>

export enum QueryAT {
  ADD_NOTIFICATION = "QUERY/ADD_NOTIFICATION",
  CLEANUP_NOTIFICATIONS = "QUERY/CLEANUP_NOTIFICATIONS",
  CLEANUP_BUFFER_NOTIFICATIONS = "QUERY/CLEANUP_BUFFER_NOTIFICATIONS",
  REMOVE_NOTIFICATION = "QUERY/REMOVE_NOTIFICATION",
  UPDATE_NOTIFICATION_KEY = "QUERY/UPDATE_NOTIFICATION_KEY",
  MOVE_NOTIFICATION_NAMESPACE = "QUERY/MOVE_NOTIFICATION_NAMESPACE",
  SET_RESULT = "QUERY/SET_RESULT",
  STOP_RUNNING = "QUERY/STOP_RUNNING",
  TOGGLE_RUNNING = "QUERY/TOGGLE_RUNNING",
  SET_TABLES = "QUERY/SET_TABLES",
  SET_COLUMNS = "QUERY/SET_COLUMNS",
  SET_ACTIVE_NOTIFICATION = "QUERY/SET_ACTIVE_NOTIFICATION",
  SET_QUERIES_TO_RUN = "QUERY/SET_QUERIES_TO_RUN",
  START_QUERY_EXECUTION = "QUERY/START_QUERY_EXECUTION",
  STOP_QUERY_EXECUTION = "QUERY/STOP_QUERY_EXECUTION",
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

type StartQueryExecutionAction = Readonly<{
  type: QueryAT.START_QUERY_EXECUTION
  payload: { bufferId: NotificationNamespaceKey; queryKey: QueryKey }
}>

type StopQueryExecutionAction = Readonly<{
  type: QueryAT.STOP_QUERY_EXECUTION
}>

export type QueryAction =
  | AddNotificationAction
  | CleanupNotificationsAction
  | CleanupBufferNotificationsAction
  | RemoveNotificationAction
  | UpdateNotificationKeyAction
  | MoveNotificationNamespaceAction
  | SetResultAction
  | StopRunningAction
  | ToggleRunningAction
  | SetTablesAction
  | SetColumnsActions
  | SetActiveNotificationAction
  | SetQueriesToRunAction
  | StartQueryExecutionAction
  | StopQueryExecutionAction
