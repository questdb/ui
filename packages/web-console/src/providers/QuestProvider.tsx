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

import React, { createContext, PropsWithChildren, useEffect } from "react"
import * as QuestDB from "../utils/questdb"
import { useSelector } from "react-redux"
import { selectors } from "../store"
import { useAuth } from "./AuthProvider"
import { AuthPayload } from "../modules/OAuth2/types"
import { getValue } from "../utils/localStorage"
import { StoreKey } from "../utils/localStorage/types"

const questClient = new QuestDB.Client()

type Props = {}

type ContextProps = {
  quest: QuestDB.Client
}

const defaultValues = {
  quest: questClient,
}

export const QuestContext = createContext<ContextProps>(defaultValues)

export const QuestProvider = ({ children }: PropsWithChildren<Props>) => {
  const settings = useSelector(selectors.console.getSettings)
  const { sessionData, refreshAuthToken } = useAuth()
  const [authCheckFinished, setAuthCheckFinished] = React.useState(settings["acl.basic.auth.realm.enabled"])

  const finishAuthCheck = async () => {
    // The initial check tells us if the user has permission to use the HTTP protocol.
    // If not, this will trigger a full-screen error page, preventing the subsequent requests to be made.
    await questClient.queryRaw("SELECT 1")

    setAuthCheckFinished(true)
  }

  const setupClient = async (sessionData: Partial<AuthPayload>) => {
    questClient.setCommonHeaders({
      Authorization: `Bearer ${sessionData.access_token}`,
    })

    questClient.refreshTokenMethod = () => {
      return refreshAuthToken(settings)
    }

    void finishAuthCheck()
  }

  // User has been logged in with OAuth2
  useEffect(() => {
    if (sessionData) {
      void setupClient(sessionData)
    }
  }, [sessionData])

  // User has provided the basic auth credentials
  useEffect(() => {
    const token = getValue(StoreKey.REST_TOKEN)
    if (token) {
      questClient.setCommonHeaders({
        Authorization: `Bearer ${token}`,
      })

      void finishAuthCheck()
    }
  })

  if (!authCheckFinished) return null

  return (
    <QuestContext.Provider
      value={{
        quest: questClient,
      }}
    >
      {children}
    </QuestContext.Provider>
  )
}
