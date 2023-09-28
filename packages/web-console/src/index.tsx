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

import "core-js/features/promise"
import "./js/console"
import "docsearch.js/dist/cdn/docsearch.min.css"

import { hot } from "react-hot-loader/root"
import React from "react"
import ReactDOM from "react-dom"
import { Provider } from "react-redux"
import { applyMiddleware, compose, createStore } from "redux"
import { persistStore, persistReducer } from "redux-persist"
import { PersistGate } from "redux-persist/integration/react"
import storage from "redux-persist/lib/storage"
import { createEpicMiddleware } from "redux-observable"
import { ThemeProvider } from "styled-components"

import {
  createGlobalFadeTransition,
  ScreenSizeProvider,
  TransitionDuration,
  ToastContainer,
} from "./components"
import { actions, rootEpic, rootReducer } from "./store"
import { StoreAction, StoreShape } from "./types"

import Layout from "./scenes/Layout"
import { theme } from "./theme"
import { LocalStorageProvider } from "./providers/LocalStorageProvider"

const epicMiddleware = createEpicMiddleware<
  StoreAction,
  StoreAction,
  StoreShape
>()

const persistConfig = {
  key: "root",
  storage,
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

const store = createStore(
  persistedReducer,
  compose(applyMiddleware(epicMiddleware)),
)
const persistor = persistStore(store)

epicMiddleware.run(rootEpic)
store.dispatch(actions.console.bootstrap())

const FadeReg = createGlobalFadeTransition("fade-reg", TransitionDuration.REG)

const FadeSlow = createGlobalFadeTransition(
  "fade-slow",
  TransitionDuration.SLOW,
)

const App = hot(() => (
  <ScreenSizeProvider>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider theme={theme}>
          {ReactDOM.createPortal(<ToastContainer />, document.body)}
          <LocalStorageProvider>
            <FadeSlow />
            <FadeReg />
            <Layout />
          </LocalStorageProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  </ScreenSizeProvider>
))

ReactDOM.render(<App />, document.getElementById("root"))
