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
import { AuthPayload } from "../../modules/OAuth2/types"

export type Query = {
  name?: string
  value: string
}

export type QueryGroup = {
  title?: string
  description?: string
  queries: Query[]
}

export type TopPanel = "tables" | undefined

export type Sidebar = "news" | "create" | undefined

export type BottomPanel = "result" | "zeroState" | "import"

export type ConsoleSettings = Readonly<{
  "acl.oidc.enabled": boolean
  "acl.oidc.client.id": string
  "acl.oidc.host": string
  "acl.oidc.port": number
  "acl.oidc.tls.enabled": boolean
  "acl.oidc.authorization.endpoint": string
  "acl.oidc.token.endpoint": string
  "acl.oidc.pkce.required": boolean
  "acl.basic.auth.realm.enabled"?: boolean
  "questdb.type"?: "open-source" | "enterprise"
  "questdb.version"?: string
}>

export type ConsoleSettingsShape = Readonly<ConsoleSettings>

export type ConsoleConfigShape = Readonly<{
  githubBanner: boolean
  readOnly?: boolean
  savedQueries: Array<Query | QueryGroup>
}>

export type ConsoleStateShape = Readonly<{
  config?: ConsoleConfigShape
  settings?: ConsoleSettingsShape
  sideMenuOpened: boolean
  activeTopPanel: TopPanel
  activeSidebar: Sidebar
  activeBottomPanel: BottomPanel
  authPayload?: AuthPayload
}>

export enum ConsoleAT {
  BOOTSTRAP = "CONSOLE/BOOTSTRAP",
  REFRESH_AUTH_TOKEN = "CONSOLE/REFRESH_AUTH_TOKEN",
  SET_CONFIG = "CONSOLE/SET_CONFIG",
  TOGGLE_SIDE_MENU = "CONSOLE/TOGGLE_SIDE_MENU",
  SET_ACTIVE_TOP_PANEL = "CONSOLE/SET_ACTIVE_TOP_PANEL",
  SET_ACTIVE_SIDEBAR = "CONSOLE/SET_ACTIVE_SIDEBAR",
  SET_ACTIVE_BOTTOM_PANEL = "CONSOLE/SET_ACTIVE_BOTTOM_PANEL",
  SET_SETTINGS = "CONSOLE/SET_SETTINGS",
}

export type BootstrapAction = Readonly<{
  type: ConsoleAT.BOOTSTRAP
}>

export type RefreshAuthTokenAction = Readonly<{
  payload: boolean
  type: ConsoleAT.REFRESH_AUTH_TOKEN
}>

type SetConfigAction = Readonly<{
  payload: ConsoleConfigShape
  type: ConsoleAT.SET_CONFIG
}>

type ToggleSideMenuAction = Readonly<{
  type: ConsoleAT.TOGGLE_SIDE_MENU
}>

type setActiveTopPanelAction = Readonly<{
  payload: TopPanel
  type: ConsoleAT.SET_ACTIVE_TOP_PANEL
}>

type setActiveSidebarAction = Readonly<{
  payload: Sidebar
  type: ConsoleAT.SET_ACTIVE_SIDEBAR
}>

type setActiveBottomPanelAction = Readonly<{
  payload: BottomPanel
  type: ConsoleAT.SET_ACTIVE_BOTTOM_PANEL
}>

type setSettingsAction = Readonly<{
  payload: ConsoleSettingsShape
  type: ConsoleAT.SET_SETTINGS
}>

export type ConsoleAction =
  | BootstrapAction
  | RefreshAuthTokenAction
  | SetConfigAction
  | ToggleSideMenuAction
  | setActiveTopPanelAction
  | setActiveSidebarAction
  | setActiveBottomPanelAction
  | setSettingsAction
