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

import { ConsoleAction, ConsoleAT, ConsoleStateShape } from "./types"

const MAX_HISTORY_SIZE = 20

export const initialState: ConsoleStateShape = {
  sideMenuOpened: false,
  activeBottomPanel: "zeroState",
  imageToZoom: undefined,
  sidebarHistory: [],
  sidebarHistoryPosition: -1,
  sidebarVisible: false,
}

const _console = (
  state = initialState,
  action: ConsoleAction,
): ConsoleStateShape => {
  switch (action.type) {
    case ConsoleAT.TOGGLE_SIDE_MENU: {
      return {
        ...state,
        sideMenuOpened: !state.sideMenuOpened,
      }
    }

    case ConsoleAT.SET_ACTIVE_BOTTOM_PANEL: {
      return {
        ...state,
        activeBottomPanel: action.payload,
      }
    }

    case ConsoleAT.SET_IMAGE_TO_ZOOM: {
      return {
        ...state,
        imageToZoom: action.payload,
      }
    }

    case ConsoleAT.PUSH_SIDEBAR_HISTORY: {
      const newSidebar = action.payload
      const { sidebarHistory, sidebarHistoryPosition, sidebarVisible } = state

      const current =
        sidebarHistoryPosition >= 0
          ? sidebarHistory[sidebarHistoryPosition]
          : null
      const areSidebarsEqual =
        JSON.stringify(current) === JSON.stringify(newSidebar)

      if (areSidebarsEqual && sidebarVisible) {
        return state
      }

      if (areSidebarsEqual && !sidebarVisible) {
        return {
          ...state,
          sidebarVisible: true,
        }
      }

      const truncatedHistory = sidebarHistory.slice(
        0,
        sidebarHistoryPosition + 1,
      )

      const newHistory = [...truncatedHistory, newSidebar].slice(
        -MAX_HISTORY_SIZE,
      )

      return {
        ...state,
        sidebarHistory: newHistory,
        sidebarHistoryPosition: newHistory.length - 1,
        sidebarVisible: true,
      }
    }

    case ConsoleAT.GO_BACK_IN_SIDEBAR: {
      if (state.sidebarHistoryPosition <= 0) return state
      return {
        ...state,
        sidebarHistoryPosition: state.sidebarHistoryPosition - 1,
      }
    }

    case ConsoleAT.GO_FORWARD_IN_SIDEBAR: {
      if (state.sidebarHistoryPosition >= state.sidebarHistory.length - 1)
        return state
      return {
        ...state,
        sidebarHistoryPosition: state.sidebarHistoryPosition + 1,
      }
    }

    case ConsoleAT.CLOSE_SIDEBAR: {
      return {
        ...state,
        sidebarVisible: false,
      }
    }

    case ConsoleAT.OPEN_SIDEBAR: {
      if (state.sidebarHistoryPosition < 0) return state
      return {
        ...state,
        sidebarVisible: true,
      }
    }

    default:
      return state
  }
}

export default _console
