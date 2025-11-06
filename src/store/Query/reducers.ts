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

import { QueryAction, QueryAT, QueryStateShape, RunningType } from "../../types"
import type { InformationSchemaColumn } from "utils/questdb"

export const initialState: QueryStateShape = {
  notifications: [],
  tables: [],
  columns: {},
  running: RunningType.NONE,
  queryNotifications: {},
  activeNotification: null,
  queriesToRun: [],
}

const query = (state = initialState, action: QueryAction): QueryStateShape => {
  switch (action.type) {
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

      if (bufferId !== undefined) {
        const bufferNotifications = state.queryNotifications[bufferId] || {}
        const existingQueryNotifications = bufferNotifications[queryText] || {}
        const updatedQueryNotifications = {
          ...existingQueryNotifications,
          latest: cleanNotification,
          [isExplain ? "explain" : "regular"]: cleanNotification,
        }

        return {
          ...state,
          notifications: [...state.notifications, cleanNotification],
          queryNotifications: {
            ...state.queryNotifications,
            [bufferId]: {
              ...bufferNotifications,
              [queryText]: updatedQueryNotifications,
            },
          },
          ...(updateActiveNotification
            ? { activeNotification: cleanNotification }
            : {}),
        }
      }

      return {
        ...state,
        notifications: [...state.notifications, cleanNotification],
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

    case QueryAT.UPDATE_NOTIFICATION_KEY: {
      const { oldKey, newKey, bufferId } = action.payload
      if (newKey === oldKey) {
        return { ...state }
      }

      if (bufferId !== undefined) {
        const bufferNotifications = state.queryNotifications[bufferId] || {}
        const updatedBufferNotifications = { ...bufferNotifications }

        if (updatedBufferNotifications[oldKey]) {
          updatedBufferNotifications[newKey] =
            updatedBufferNotifications[oldKey]
          delete updatedBufferNotifications[oldKey]
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
      const currentRunning = state.running
      if (currentRunning !== RunningType.NONE) {
        return {
          ...state,
          running: RunningType.NONE,
        }
      }
      return {
        ...state,
        running: action.payload ?? RunningType.QUERY,
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
