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
import { StoreShape, Sidebar, BottomPanel, TableDetailsTarget } from "types"

const getSideMenuOpened: (store: StoreShape) => boolean = (store) =>
  store.console.sideMenuOpened

const getActiveSidebar: (store: StoreShape) => Sidebar = (store) => {
  const { sidebarHistory, sidebarHistoryPosition, sidebarVisible } =
    store.console

  if (!sidebarVisible) {
    return null
  }

  if (
    sidebarHistoryPosition < 0 ||
    sidebarHistoryPosition >= sidebarHistory.length
  ) {
    return null
  }
  return sidebarHistory[sidebarHistoryPosition]
}

const getActiveBottomPanel: (store: StoreShape) => BottomPanel = (store) =>
  store.console.activeBottomPanel

const getTableDetailsTarget: (store: StoreShape) => TableDetailsTarget = (
  store,
) => {
  const { sidebarHistory, sidebarHistoryPosition } = store.console

  if (
    sidebarHistoryPosition >= 0 &&
    sidebarHistoryPosition < sidebarHistory.length
  ) {
    const current = sidebarHistory[sidebarHistoryPosition]
    if (current?.type === "tableDetails" && current.payload) {
      return current.payload
    }
  }

  for (let i = sidebarHistory.length - 1; i >= 0; i--) {
    const entry = sidebarHistory[i]
    if (entry?.type === "tableDetails" && entry.payload) {
      return entry.payload
    }
  }
  return null
}

const canGoBackInSidebar: (store: StoreShape) => boolean = (store) =>
  store.console.sidebarHistoryPosition > 0

const canGoForwardInSidebar: (store: StoreShape) => boolean = (store) =>
  store.console.sidebarHistoryPosition < store.console.sidebarHistory.length - 1

export default {
  getSideMenuOpened,
  getActiveSidebar,
  getActiveBottomPanel,
  getTableDetailsTarget,
  canGoBackInSidebar,
  canGoForwardInSidebar,
}
