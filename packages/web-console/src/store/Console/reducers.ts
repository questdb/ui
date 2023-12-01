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
  ConsoleConfigShape,
  ConsoleAction,
  ConsoleAT,
  ConsoleStateShape,
  TopPanel,
  Sidebar,
  BottomPanel,
} from "./types"

const getValidSidebar = (sidebar?: Sidebar) =>
  sidebar && ["create", "news"].includes(sidebar) ? sidebar : undefined

const getValidTopPanel = (topPanel?: TopPanel) =>
  topPanel && ["tables"].includes(topPanel) ? topPanel : undefined

const getValidBottomPanel = (bottomPanel?: BottomPanel): BottomPanel =>
  bottomPanel && ["result", "zeroState", "import"].includes(bottomPanel)
    ? bottomPanel
    : "zeroState"

export const getInitialState = (): ConsoleStateShape => {
  const url = new URL(window.location.href)
  const bottomPanel = (url.searchParams.get("bottomPanel") ?? "") as BottomPanel
  const sidebar = (url.searchParams.get("sidebar") ?? "") as Sidebar
  const topPanel = (url.searchParams.get("topPanel") ?? "") as TopPanel

  return {
    sideMenuOpened: getValidSidebar(sidebar) !== undefined,
    activeTopPanel: getValidTopPanel(topPanel),
    activeSidebar: getValidSidebar(sidebar),
    activeBottomPanel: getValidBottomPanel(bottomPanel),
  } as ConsoleStateShape
}

const setUrlParam = (key: string, value?: TopPanel | BottomPanel | Sidebar) => {
  const url = new URL(window.location.href)
  if (value) {
    url.searchParams.set(key, value)
  } else {
    url.searchParams.delete(key)
  }
  window.history.replaceState({}, "", url.toString())
}

export const defaultConfig: ConsoleConfigShape = {
  githubBanner: false,
  readOnly: false,
  savedQueries: [],
}

const _console = (
  state = getInitialState(),
  action: ConsoleAction,
): ConsoleStateShape => {
  const url = new URL(window.location.href)
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
      setUrlParam("topPanel", getValidTopPanel(action.payload))
      return {
        ...state,
        activeTopPanel: action.payload,
      }
    }

    case ConsoleAT.SET_ACTIVE_SIDEBAR: {
      setUrlParam("sidebar", getValidSidebar(action.payload))
      return {
        ...state,
        activeSidebar: action.payload,
      }
    }

    case ConsoleAT.SET_ACTIVE_BOTTOM_PANEL: {
      setUrlParam("bottomPanel", getValidBottomPanel(action.payload))
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
