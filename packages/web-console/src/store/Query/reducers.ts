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

import { QueryAction, QueryAT, QueryStateShape } from "../../types"

export const initialState: QueryStateShape = {
  notifications: [],
  tables: [],
  columns: [],
  running: {
    value: false,
    isRefresh: false,
    isExplain: false,
  },
  queryNotifications: {},
  activeNotification: null,
}

const query = (state = initialState, action: QueryAction): QueryStateShape => {
  switch (action.type) {
    case QueryAT.ADD_NOTIFICATION: {
      const { query: queryText, isExplain = false, updateActiveNotification = true } = action.payload
      
      const notificationWithTimestamp = {
        ...action.payload,
        createdAt: action.payload.createdAt || new Date()
      }
      
      const existingQueryNotifications = state.queryNotifications[queryText] || {}
      const updatedQueryNotifications = {
        ...existingQueryNotifications,
        latest: notificationWithTimestamp,
        [isExplain ? 'explain' : 'regular']: notificationWithTimestamp
      }

      return {
        ...state,
        notifications: [...state.notifications, notificationWithTimestamp],
        queryNotifications: { 
          ...state.queryNotifications, 
          [queryText]: updatedQueryNotifications 
        },
        ...(updateActiveNotification ? { activeNotification: notificationWithTimestamp } : {}),
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

    case QueryAT.SET_ACTIVE_NOTIFICATION: {
      return {
        ...state,
        activeNotification: action.payload,
      }
    }

    case QueryAT.REMOVE_NOTIFICATION: {
      const filteredNotifications = state.notifications.filter(
        (notification) => notification.query !== action.payload,
      )
      
      const updatedQueryNotifications = { ...state.queryNotifications }
      delete updatedQueryNotifications[action.payload]
      
      return {
        ...state,
        notifications: filteredNotifications,
        queryNotifications: updatedQueryNotifications,
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
        running: {
          value: false,
          isRefresh: false,
          isExplain: false,
        },
      }
    }

    case QueryAT.TOGGLE_RUNNING: {
      return {
        ...state,
        running: {
          value: !state.running.value,
          isRefresh: action.payload.isRefresh,
          isExplain: action.payload.isExplain || false,
        },
      }
    }

    case QueryAT.SET_TABLES: {
      return {
        ...state,
        tables: action.payload.tables,
      }
    }

    case QueryAT.SET_COLUMNS: {
      return {
        ...state,
        columns: action.payload.columns,
      }
    }

    default:
      return state
  }
}

export default query
