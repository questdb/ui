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

import {
  createDetachedQueryKey,
  parseQueryKey,
} from "../../scenes/Editor/Monaco/utils"
import {
  NotificationShape,
  NotificationType,
  QueryAction,
  QueryAT,
  QueryStateShape,
  RunningType,
} from "../../types"
import type { InformationSchemaColumn } from "utils/questdb"
import type { PendingLoadingNotification } from "./types"

// Only in-flight executions are indexed. Rekey/cleanup operations may inspect
// this small set; settling a query never traverses completed history/groups.
const updatePendingLoading = (
  pending: QueryStateShape["pendingLoadingNotifications"],
  update: (
    entry: PendingLoadingNotification,
  ) => PendingLoadingNotification | undefined,
): QueryStateShape["pendingLoadingNotifications"] => {
  let next = pending
  for (const [id, entry] of Object.entries(pending)) {
    const updated = update(entry)
    if (updated === entry) continue
    if (next === pending) next = { ...pending }
    if (updated) next[Number(id)] = updated
    else delete next[Number(id)]
  }
  return next
}

export const initialState: QueryStateShape = {
  notifications: [],
  tables: [],
  columns: {},
  running: RunningType.NONE,
  queryNotifications: {},
  activeNotification: null,
  pendingLoadingNotifications: {},
  queriesToRun: [],
}

const query = (state = initialState, action: QueryAction): QueryStateShape => {
  switch (action.type) {
    case QueryAT.RESET_SESSION:
      return initialState
    case QueryAT.ADD_NOTIFICATION: {
      const {
        query: queryText,
        isExplain = false,
        updateActiveNotification = true,
        bufferId,
      } = action.payload

      const notificationWithTimestamp = {
        ...action.payload,
        createdAt: action.payload.createdAt || new Date(),
      }
      const { bufferId: _, ...cleanNotification } = notificationWithTimestamp
      const isLoading = cleanNotification.type === NotificationType.LOADING
      // Loading is transient selection/active state, never retained log history.
      const notifications = isLoading
        ? state.notifications
        : [...state.notifications, cleanNotification]

      if (bufferId !== undefined) {
        // A running query may have been rekeyed, accepted into the editor, or
        // moved to another buffer. Publish its outcome to those destinations,
        // not just the namespace/key captured when execution began.
        const pending =
          !isLoading && cleanNotification.queryId !== undefined
            ? state.pendingLoadingNotifications[cleanNotification.queryId]
            : undefined
        const destination = pending?.bufferId ?? bufferId
        const bufferNotifications = state.queryNotifications[destination] || {}
        const updatedBufferNotifications = { ...bufferNotifications }
        for (const key of pending?.queryKeys ?? [queryText]) {
          const group = bufferNotifications[key]
          if (
            pending &&
            (group?.latest.type !== NotificationType.LOADING ||
              group.latest.queryId !== cleanNotification.queryId)
          ) {
            // Never overwrite a newer execution or resurrect a removed key.
            continue
          }
          const notification =
            key === queryText
              ? cleanNotification
              : { ...cleanNotification, query: key }
          updatedBufferNotifications[key] = {
            ...group,
            latest: notification,
            // Loading must not replace the last completed run.
            ...(!isLoading
              ? { [isExplain ? "explain" : "regular"]: notification }
              : {}),
          }
        }

        return {
          ...state,
          notifications,
          pendingLoadingNotifications:
            isLoading && cleanNotification.queryId !== undefined
              ? {
                  ...state.pendingLoadingNotifications,
                  [cleanNotification.queryId]: {
                    bufferId,
                    queryKeys: [queryText],
                  },
                }
              : state.pendingLoadingNotifications,
          queryNotifications: {
            ...state.queryNotifications,
            [destination]: updatedBufferNotifications,
          },
          ...(updateActiveNotification
            ? { activeNotification: cleanNotification }
            : {}),
        }
      }

      return {
        ...state,
        notifications,
        ...(updateActiveNotification
          ? { activeNotification: cleanNotification }
          : {}),
      }
    }

    case QueryAT.CLEANUP_NOTIFICATIONS: {
      return {
        ...state,
        notifications: [],
        queryNotifications: {},
        pendingLoadingNotifications: {},
        activeNotification: null,
      }
    }

    case QueryAT.CLEANUP_BUFFER_NOTIFICATIONS: {
      const { bufferId } = action.payload
      const bufferNotifications = state.queryNotifications[bufferId] || {}

      const filteredNotifications = state.notifications.filter(
        (notification) => !bufferNotifications[notification.query],
      )

      const updatedQueryNotifications = { ...state.queryNotifications }
      delete updatedQueryNotifications[bufferId]

      const updatedActiveNotification =
        state.activeNotification &&
        bufferNotifications[state.activeNotification.query]
          ? null
          : state.activeNotification

      return {
        ...state,
        notifications: filteredNotifications,
        queryNotifications: updatedQueryNotifications,
        pendingLoadingNotifications: updatePendingLoading(
          state.pendingLoadingNotifications,
          (entry) => (entry.bufferId === bufferId ? undefined : entry),
        ),
        activeNotification: updatedActiveNotification,
      }
    }

    case QueryAT.SET_ACTIVE_NOTIFICATION: {
      return {
        ...state,
        activeNotification: action.payload,
      }
    }

    case QueryAT.REMOVE_NOTIFICATION: {
      const { bufferId } = action
      const filteredNotifications = state.notifications.filter(
        (notification) => notification.query !== action.payload,
      )

      if (bufferId !== undefined) {
        const bufferNotifications = state.queryNotifications[bufferId] || {}
        const updatedBufferNotifications = { ...bufferNotifications }
        delete updatedBufferNotifications[action.payload]

        return {
          ...state,
          notifications: filteredNotifications,
          pendingLoadingNotifications: updatePendingLoading(
            state.pendingLoadingNotifications,
            (entry) => {
              if (entry.bufferId !== bufferId) return entry
              const queryKeys = entry.queryKeys.filter(
                (key) => key !== action.payload,
              )
              return queryKeys.length === 0
                ? undefined
                : { ...entry, queryKeys }
            },
          ),
          queryNotifications: {
            ...state.queryNotifications,
            [bufferId]: updatedBufferNotifications,
          },
        }
      }

      return {
        ...state,
        notifications: filteredNotifications,
      }
    }

    case QueryAT.SETTLE_LOADING_NOTIFICATION: {
      const { queryId } = action.payload
      const matches = (notification?: NotificationShape | null) =>
        notification?.type === NotificationType.LOADING &&
        notification.queryId === queryId
      const pending = state.pendingLoadingNotifications[queryId]
      const activeNotification = matches(state.activeNotification)
        ? null
        : state.activeNotification
      // Script progress has no indexed history: settle it in O(1), and never
      // touch newer progress or scan retained notification groups.
      if (!pending)
        return activeNotification === state.activeNotification
          ? state
          : { ...state, activeNotification }
      const bufferNotifications =
        state.queryNotifications[pending.bufferId] || {}
      let updatedBufferNotifications = bufferNotifications
      for (const key of pending.queryKeys) {
        const group = bufferNotifications[key]
        if (!matches(group?.latest)) continue
        if (updatedBufferNotifications === bufferNotifications) {
          updatedBufferNotifications = { ...bufferNotifications }
        }
        if (action.payload.discardPrevious) {
          delete updatedBufferNotifications[key]
          continue
        }
        const { regular, explain } = group
        const latest =
          regular && explain
            ? regular.createdAt >= explain.createdAt
              ? regular
              : explain
            : (regular ?? explain)
        if (latest) {
          updatedBufferNotifications[key] = { ...group, latest }
        } else {
          delete updatedBufferNotifications[key]
        }
      }
      const pendingLoadingNotifications = {
        ...state.pendingLoadingNotifications,
      }
      delete pendingLoadingNotifications[queryId]
      return {
        ...state,
        activeNotification,
        pendingLoadingNotifications,
        queryNotifications:
          updatedBufferNotifications === bufferNotifications
            ? state.queryNotifications
            : {
                ...state.queryNotifications,
                [pending.bufferId]: updatedBufferNotifications,
              },
      }
    }

    case QueryAT.UPDATE_NOTIFICATION_KEY: {
      const { oldKey, newKey, bufferId, preserveOldKey } = action.payload
      if (newKey === oldKey) {
        return { ...state }
      }

      if (bufferId !== undefined) {
        const bufferNotifications = state.queryNotifications[bufferId] || {}
        const updatedBufferNotifications = { ...bufferNotifications }

        const moved = updatedBufferNotifications[oldKey]
        const existing = updatedBufferNotifications[newKey]
        if (
          moved &&
          existing &&
          existing.latest.createdAt > moved.latest.createdAt
        ) {
          return state
        }

        if (moved) {
          updatedBufferNotifications[newKey] = moved
          if (!preserveOldKey) {
            delete updatedBufferNotifications[oldKey]
          }
        }

        const updatedNotifications = state.notifications.map((notification) =>
          notification.query === oldKey
            ? { ...notification, query: newKey }
            : notification,
        )

        const updatedActiveNotification =
          state.activeNotification?.query === oldKey
            ? { ...state.activeNotification, query: newKey }
            : state.activeNotification

        return {
          ...state,
          notifications: updatedNotifications,
          pendingLoadingNotifications: updatePendingLoading(
            state.pendingLoadingNotifications,
            (entry) => {
              if (
                entry.bufferId !== bufferId ||
                !entry.queryKeys.includes(oldKey)
              ) {
                return entry
              }
              const queryKeys = preserveOldKey
                ? [...new Set([...entry.queryKeys, newKey])]
                : entry.queryKeys.map((key) => (key === oldKey ? newKey : key))
              return { ...entry, queryKeys }
            },
          ),
          queryNotifications: {
            ...state.queryNotifications,
            [bufferId]: updatedBufferNotifications,
          },
          activeNotification: updatedActiveNotification,
        }
      }

      const updatedNotifications = state.notifications.map((notification) =>
        notification.query === oldKey
          ? { ...notification, query: newKey }
          : notification,
      )

      const updatedActiveNotification =
        state.activeNotification?.query === oldKey
          ? { ...state.activeNotification, query: newKey }
          : state.activeNotification

      return {
        ...state,
        notifications: updatedNotifications,
        activeNotification: updatedActiveNotification,
      }
    }

    case QueryAT.UPDATE_NOTIFICATION_KEYS: {
      const { updates, bufferId } = action.payload
      const effectiveUpdates = updates.filter(
        ({ oldKey, newKey }) => oldKey !== newKey,
      )
      if (effectiveUpdates.length === 0) return state

      const bufferNotifications = state.queryNotifications[bufferId] || {}
      const updatedBufferNotifications = { ...bufferNotifications }
      const keyMap = new Map(
        effectiveUpdates.map(({ oldKey, newKey }) => [oldKey, newKey]),
      )

      // Vacate every source before writing any destination so chained moves
      // such as 0 -> 10 and 10 -> 20 cannot collide with transient keys.
      effectiveUpdates.forEach(({ oldKey }) => {
        delete updatedBufferNotifications[oldKey]
      })

      effectiveUpdates.forEach(({ oldKey, newKey }) => {
        const moved = bufferNotifications[oldKey]
        if (!moved) return
        const existing = updatedBufferNotifications[newKey]
        if (!existing || existing.latest.createdAt <= moved.latest.createdAt) {
          updatedBufferNotifications[newKey] = moved
        }
      })

      const updatedNotifications = state.notifications.map((notification) => {
        const newKey = keyMap.get(notification.query)
        return newKey ? { ...notification, query: newKey } : notification
      })

      const activeNotificationKey = state.activeNotification
        ? keyMap.get(state.activeNotification.query)
        : undefined

      return {
        ...state,
        notifications: updatedNotifications,
        pendingLoadingNotifications: updatePendingLoading(
          state.pendingLoadingNotifications,
          (entry) =>
            entry.bufferId === bufferId
              ? {
                  ...entry,
                  queryKeys: entry.queryKeys.map(
                    (key) => keyMap.get(key) ?? key,
                  ),
                }
              : entry,
        ),
        queryNotifications: {
          ...state.queryNotifications,
          [bufferId]: updatedBufferNotifications,
        },
        activeNotification:
          state.activeNotification && activeNotificationKey
            ? { ...state.activeNotification, query: activeNotificationKey }
            : state.activeNotification,
      }
    }

    case QueryAT.MOVE_NOTIFICATION_NAMESPACE: {
      const { fromBufferId, toBufferId, newQueryKey } = action.payload
      if (fromBufferId === toBufferId) {
        return state
      }

      const fromNotifications = state.queryNotifications[fromBufferId] || {}
      if (Object.keys(fromNotifications).length === 0) {
        return state
      }

      const toNotifications = state.queryNotifications[toBufferId] || {}
      const mergedNotifications = {
        ...toNotifications,
        ...fromNotifications,
      }
      const { queryText } = parseQueryKey(newQueryKey)
      const detachedQueryKey = createDetachedQueryKey(queryText)
      // Keeping the original query key to separate chat window vs. editor notifications from now on
      if (fromNotifications[detachedQueryKey]) {
        mergedNotifications[newQueryKey] = fromNotifications[detachedQueryKey]
      }
      const updatedQueryNotifications = { ...state.queryNotifications }
      updatedQueryNotifications[toBufferId] = mergedNotifications
      delete updatedQueryNotifications[fromBufferId]

      return {
        ...state,
        queryNotifications: updatedQueryNotifications,
        pendingLoadingNotifications: updatePendingLoading(
          state.pendingLoadingNotifications,
          (entry) =>
            entry.bufferId === fromBufferId
              ? {
                  bufferId: toBufferId,
                  queryKeys: entry.queryKeys.includes(detachedQueryKey)
                    ? [...new Set([...entry.queryKeys, newQueryKey])]
                    : entry.queryKeys,
                }
              : entry,
        ),
      }
    }

    case QueryAT.SET_RESULT: {
      return {
        ...state,
        result: action.payload,
      }
    }

    case QueryAT.STOP_RUNNING: {
      return {
        ...state,
        running: RunningType.NONE,
      }
    }

    case QueryAT.TOGGLE_RUNNING: {
      if (action.payload !== undefined) {
        return {
          ...state,
          running: action.payload,
        }
      }
      if (state.running !== RunningType.NONE) {
        return {
          ...state,
          running: RunningType.NONE,
        }
      }
      return {
        ...state,
        running: RunningType.QUERY,
      }
    }

    case QueryAT.SET_TABLES: {
      return {
        ...state,
        tables: action.payload.tables,
      }
    }

    case QueryAT.SET_COLUMNS: {
      const { columns } = action.payload
      const categorizedColumns = columns.reduce(
        (acc, column) => {
          acc[column.table_name] = [...(acc[column.table_name] || []), column]
          return acc
        },
        {} as Record<string, InformationSchemaColumn[]>,
      )
      return {
        ...state,
        columns: categorizedColumns,
      }
    }

    case QueryAT.SET_QUERIES_TO_RUN: {
      return {
        ...state,
        queriesToRun: action.payload,
      }
    }

    default:
      return state
  }
}

export default query
