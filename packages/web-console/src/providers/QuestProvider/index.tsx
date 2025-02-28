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

import React, {
  createContext,
  PropsWithChildren,
  useEffect,
  useState,
} from "react"
import * as QuestDB from "../../utils/questdb"
import { useAuth } from "../AuthProvider"
import { AuthPayload } from "../../modules/OAuth2/types"
import { getValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { formatCommitHash, formatVersion } from "./services"
import { Versions } from "./types"
import { hasUIAuth } from "../../modules/OAuth2/utils"
import { useSettings } from "../SettingsProvider"
import { useDispatch } from "react-redux"
import { actions } from "../../store"

const questClient = new QuestDB.Client()

type Props = {}

type ContextProps = {
  quest: QuestDB.Client
  buildVersion: Versions
  commitHash: string
}

const defaultValues: ContextProps = {
  quest: questClient,
  buildVersion: {
    type: "oss",
    version: "",
  },
  commitHash: "",
}

export const QuestContext = createContext<ContextProps>(defaultValues)

export const QuestProvider = ({ children }: PropsWithChildren<Props>) => {
  const dispatch = useDispatch()
  const { settings } = useSettings()
  const { sessionData, refreshAuthToken } = useAuth()
  const [authCheckFinished, setAuthCheckFinished] = useState(
    !hasUIAuth(settings),
  )
  const [buildVersion, setBuildVersion] = useState<Versions>(
    defaultValues.buildVersion,
  )
  const [commitHash, setCommitHash] = useState<string>("")

  const finishAuthCheck = async () => {
    // The initial check tells us if the user has permission to use the HTTP protocol.
    // If not, this will trigger a full-screen error page, preventing the subsequent requests to be made.
    await questClient.queryRaw("SELECT 1")

    setAuthCheckFinished(true)
  }

  const setupClient = async (sessionData: Partial<AuthPayload>) => {
    questClient.setCommonHeaders({
      Authorization: `Bearer ${
        sessionData.groups_encoded_in_token
          ? sessionData.id_token
          : sessionData.access_token
      }`,
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

  useEffect(() => {
    const restToken = getValue(StoreKey.REST_TOKEN)
    // User has provided the basic auth credentials
    if (restToken) {
      questClient.setCommonHeaders({
        Authorization: `Bearer ${restToken}`,
      })
      void finishAuthCheck()
    } else {
      const basicAuth = getValue(StoreKey.BASIC_AUTH_HEADER)
      if (basicAuth) {
        questClient.setCommonHeaders({
          Authorization: basicAuth,
        })
        void finishAuthCheck()
      }
    }

    // TODO: Remove this, use info from `/settings` (`type` and `version`) and run this hook on `settings` dep
    // Get the build version info
    questClient.queryRaw("select build", { limit: "0,1000" }).then((result) => {
      if (result.type === QuestDB.Type.DQL && result.count === 1) {
        setBuildVersion(formatVersion(result.dataset[0][0] as string))
        setCommitHash(formatCommitHash(result.dataset[0][0]))
      }
    })
  }, [])

  // Telemetry queries use SQL, and therefore need to have auth header set if needed.
  // Defer starting until the authorization is properly set for all HTTP requests.
  useEffect(() => {
    if (authCheckFinished) {
      dispatch(actions.telemetry.start())
    }
  }, [authCheckFinished])

  if (!authCheckFinished) return null

  return (
    <QuestContext.Provider
      value={{
        quest: questClient,
        buildVersion,
        commitHash,
      }}
    >
      {children}
    </QuestContext.Provider>
  )
}
