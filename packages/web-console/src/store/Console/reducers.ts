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
  ConsoleAction,
  ConsoleAT,
  ConsoleConfigShape,
  ConsoleStateShape,
} from "./types"

export const initialState: ConsoleStateShape = {
  sideMenuOpened: false,
  activeTopPanel: "tables",
  activeSidebar: undefined,
  activeBottomPanel: "zeroState",
}

export const defaultConfig: ConsoleConfigShape = {
  githubBanner: false,
  readOnly: false,
  savedQueries: [],
}

const _console = (
  state = initialState,
  action: ConsoleAction,
): ConsoleStateShape => {
  switch (action.type) {
    case ConsoleAT.SET_CONFIG: {
      return {
        ...state,
        config: {
          ...defaultConfig,
          ...action.payload,
        },
      }
    }

    case ConsoleAT.TOGGLE_SIDE_MENU: {
      return {
        ...state,
        sideMenuOpened: !state.sideMenuOpened,
      }
    }

    case ConsoleAT.SET_ACTIVE_TOP_PANEL: {
      return {
        ...state,
        activeTopPanel: action.payload,
      }
    }

    case ConsoleAT.SET_ACTIVE_SIDEBAR: {
      return {
        ...state,
        activeSidebar: action.payload,
      }
    }

    case ConsoleAT.SET_ACTIVE_BOTTOM_PANEL: {
      return {
        ...state,
        activeBottomPanel: action.payload,
      }
    }

    default:
      return state
  }
}

export default _console
