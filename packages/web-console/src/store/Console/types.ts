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

export type Sidebar = "news" | "create" | undefined

export type BottomPanel = "result" | "zeroState" | "import"

export type ImportType = "csv" | "parquet"

export type ImageToZoom = {
  src: string
  alt: string
  width: number
  height: number
}

export type ConsoleStateShape = Readonly<{
  sideMenuOpened: boolean
  activeSidebar: Sidebar
  activeBottomPanel: BottomPanel
  importType: ImportType
  imageToZoom: ImageToZoom | undefined
}>

export enum ConsoleAT {
  TOGGLE_SIDE_MENU = "CONSOLE/TOGGLE_SIDE_MENU",
  SET_ACTIVE_SIDEBAR = "CONSOLE/SET_ACTIVE_SIDEBAR",
  SET_ACTIVE_BOTTOM_PANEL = "CONSOLE/SET_ACTIVE_BOTTOM_PANEL",
  SET_IMPORT_TYPE = "CONSOLE/SET_IMPORT_TYPE",
  SET_IMAGE_TO_ZOOM = "CONSOLE/SET_IMAGE_TO_ZOOM",
}

type ToggleSideMenuAction = Readonly<{
  type: ConsoleAT.TOGGLE_SIDE_MENU
}>

type setActiveSidebarAction = Readonly<{
  payload: Sidebar
  type: ConsoleAT.SET_ACTIVE_SIDEBAR
}>

type setActiveBottomPanelAction = Readonly<{
  payload: BottomPanel
  type: ConsoleAT.SET_ACTIVE_BOTTOM_PANEL
}>

type setImportTypeAction = Readonly<{
  payload: ImportType
  type: ConsoleAT.SET_IMPORT_TYPE
}>

type setImageToZoomAction = Readonly<{
  payload?: ImageToZoom
  type: ConsoleAT.SET_IMAGE_TO_ZOOM
}>

export type ConsoleAction =
  | ToggleSideMenuAction
  | setActiveSidebarAction
  | setActiveBottomPanelAction
  | setImportTypeAction
  | setImageToZoomAction
