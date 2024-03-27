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
import { useSelector } from "react-redux"
import { selectors } from "../../store"
import { useAuth } from "../AuthProvider"
import { AuthPayload } from "../../modules/OAuth2/types"
import { getValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { formatCommitHash, formatVersion } from "./services"
import { Versions } from "./types"

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
    kind: "open-source",
    version: "",
  },
  commitHash: "",
}

export const QuestContext = createContext<ContextProps>(defaultValues)

export const QuestProvider = ({ children }: PropsWithChildren<Props>) => {
  const settings = useSelector(selectors.console.getSettings)
  const { sessionData, refreshAuthToken } = useAuth()
  const [authCheckFinished, setAuthCheckFinished] = useState(
    settings["acl.basic.auth.realm.enabled"] ||
      (!settings["acl.oidc.enabled"] &&
        !settings["acl.basic.auth.realm.enabled"]),
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

  useEffect(() => {
    const token = getValue(StoreKey.REST_TOKEN)
    // User has provided the basic auth credentials
    if (token) {
      questClient.setCommonHeaders({
        Authorization: `Bearer ${token}`,
      })

      void finishAuthCheck()
    }

    // Get the build version info
    questClient.queryRaw("select build", { limit: "0,1000" }).then((result) => {
      if (result.type === QuestDB.Type.DQL && result.count === 1) {
        setBuildVersion(formatVersion(result.dataset[0][0] as string))
        setCommitHash(formatCommitHash(result.dataset[0][0]))
      }
    })
  }, [])

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
