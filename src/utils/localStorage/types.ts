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

export enum StoreKey {
  RELEASE_TYPE = "RELEASE_TYPE",
  OAUTH_PROMPT = "oauth.prompt",
  OAUTH_REDIRECT_COUNT = "oauth.redirect.count",
  OAUTH_STATE = "oauth.state",
  PKCE_CODE_VERIFIER = "pkce.code.verifier",
  QUERY_TEXT = "query.text",
  EDITOR_LINE = "editor.line",
  EDITOR_COL = "editor.col",
  EXAMPLE_QUERIES_VISITED = "editor.exampleQueriesVisited",
  EDITOR_SPLITTER_BASIS = "splitter.editor.basis",
  RESULTS_SPLITTER_BASIS = "splitter.results.basis",
  REST_TOKEN = "rest.token",
  BASIC_AUTH_HEADER = "basic.auth.header",
  AUTO_REFRESH_TABLES = "auto.refresh.tables",
  SSO_USERNAME = "sso.username",
  LEFT_PANEL_STATE = "left.panel.state",
  AI_ASSISTANT_SETTINGS = "ai.assistant.settings",
  AI_ASSISTANT_PROMO = "ai.assistant.promo",
}
