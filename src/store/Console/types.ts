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

export type TableDetailsTarget = {
  tableName: string
  isMatView: boolean
  isView: boolean
} | null

export type SidebarType = "news" | "aiChat" | "tableDetails"

export type Sidebar = {
  type: SidebarType
  payload?: TableDetailsTarget
} | null

export type BottomPanel = "result" | "zeroState" | "import"

export type ConsoleStateShape = Readonly<{
  sideMenuOpened: boolean
  activeBottomPanel: BottomPanel
  sidebarHistory: Sidebar[]
  sidebarHistoryPosition: number
  sidebarVisible: boolean
}>

export enum ConsoleAT {
  TOGGLE_SIDE_MENU = "CONSOLE/TOGGLE_SIDE_MENU",
  SET_ACTIVE_BOTTOM_PANEL = "CONSOLE/SET_ACTIVE_BOTTOM_PANEL",
  PUSH_SIDEBAR_HISTORY = "CONSOLE/PUSH_SIDEBAR_HISTORY",
  GO_BACK_IN_SIDEBAR = "CONSOLE/GO_BACK_IN_SIDEBAR",
  GO_FORWARD_IN_SIDEBAR = "CONSOLE/GO_FORWARD_IN_SIDEBAR",
  REPLACE_SIDEBAR_HISTORY = "CONSOLE/REPLACE_SIDEBAR_HISTORY",
  CLOSE_SIDEBAR = "CONSOLE/CLOSE_SIDEBAR",
  OPEN_SIDEBAR = "CONSOLE/OPEN_SIDEBAR",
}

type ToggleSideMenuAction = Readonly<{
  type: ConsoleAT.TOGGLE_SIDE_MENU
}>

type SetActiveBottomPanelAction = Readonly<{
  payload: BottomPanel
  type: ConsoleAT.SET_ACTIVE_BOTTOM_PANEL
}>

type PushSidebarHistoryAction = Readonly<{
  payload: Sidebar
  type: ConsoleAT.PUSH_SIDEBAR_HISTORY
}>

type GoBackInSidebarAction = Readonly<{
  type: ConsoleAT.GO_BACK_IN_SIDEBAR
}>

type GoForwardInSidebarAction = Readonly<{
  type: ConsoleAT.GO_FORWARD_IN_SIDEBAR
}>

type ReplaceSidebarHistoryAction = Readonly<{
  payload: Sidebar
  type: ConsoleAT.REPLACE_SIDEBAR_HISTORY
}>

type CloseSidebarAction = Readonly<{
  type: ConsoleAT.CLOSE_SIDEBAR
}>

type OpenSidebarAction = Readonly<{
  type: ConsoleAT.OPEN_SIDEBAR
}>

export type ConsoleAction =
  | ToggleSideMenuAction
  | SetActiveBottomPanelAction
  | PushSidebarHistoryAction
  | ReplaceSidebarHistoryAction
  | GoBackInSidebarAction
  | GoForwardInSidebarAction
  | CloseSidebarAction
  | OpenSidebarAction
