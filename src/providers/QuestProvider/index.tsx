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

import React, { createContext, useEffect, useMemo, useState } from "react"
import styled from "styled-components"
import * as QuestDB from "../../utils/questdb"
import { useAuth } from "../AuthProvider"
import { questClient } from "../../utils/questdb/queryClient"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { questExecution } from "../../utils/questdb/queryExecution"
import { AuthCheckRecovery, useAuthCheck } from "./AuthCheckRecovery"
import { formatCommitHash, formatVersion } from "./services"
import { Versions } from "./types"
import {
  getStoredCredentialAuthorization,
  hasUIAuth,
} from "../../modules/OAuth2/utils"
import { useSettings } from "../SettingsProvider"
import { useDispatch, useSelector } from "react-redux"
import { actions, selectors } from "../../store"
import {
  start as startConsoleEvents,
  stop as stopConsoleEvents,
} from "../../modules/ConsoleEventTracker"
import { QueryExecutionConfirmDialog } from "../../components/QueryExecutionConfirmDialog"
import { CenteredLayout, Text } from "../../components"

const ConsoleMain = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
`

type ContextProps = {
  quest: QuestDB.Client
  questExecution: QuestDB.QueryExecutionManager
  buildVersion: Versions
  commitHash: string
}

const defaultValues: ContextProps = {
  quest: questClient,
  questExecution,
  buildVersion: {
    type: "oss",
    version: "",
  },
  commitHash: "",
}

export const QuestContext = createContext<ContextProps>(defaultValues)

export const QuestProvider: React.FC = ({ children }) => {
  const dispatch = useDispatch()
  const { settings } = useSettings()
  const { sessionData, refreshAuthToken, signInAgain } = useAuth()
  // Password credentials are shared across browser tabs; retain this tab's login.
  const [nonSSOAuthorization] = useState(() =>
    getStoredCredentialAuthorization(),
  )
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const {
    finished: authCheckFinished,
    error: authCheckError,
    pending: authCheckPending,
    finish: finishAuthCheck,
    retry,
    consoleRef,
  } = useAuthCheck(!!hasUIAuth(settings))
  const [showAuthCheckStatus, setShowAuthCheckStatus] = useState(false)
  useEffect(() => {
    setShowAuthCheckStatus(false)
    if (!authCheckPending) return
    const timer = setTimeout(() => setShowAuthCheckStatus(true), 500)
    return () => clearTimeout(timer)
  }, [authCheckPending])
  const [buildVersion, setBuildVersion] = useState<Versions>(
    defaultValues.buildVersion,
  )
  const [commitHash, setCommitHash] = useState<string>("")

  useEffect(
    () => () => {
      questClient.resetCredentials()
    },
    [],
  )

  useEffect(() => {
    // SSO bearer headers are derived from the installed payload at fetch time.
    const authorization = sessionData ? undefined : nonSSOAuthorization
    questClient.setCommonHeaders(
      authorization ? { Authorization: authorization } : {},
    )
    questClient.refreshTokenMethod = sessionData
      ? (deadlineSignal, requestSignal) =>
          refreshAuthToken(
            settings,
            authSessionState.getAuthPayload()?.refresh_token,
            deadlineSignal,
            requestSignal,
          )
      : undefined
    if (!authCheckFinished) void finishAuthCheck()
  }, [
    sessionData,
    nonSSOAuthorization,
    settings,
    refreshAuthToken,
    authCheckFinished,
    finishAuthCheck,
  ])

  useEffect(() => {
    if (!authCheckFinished) return
    // TODO: Remove this, use info from `/settings` (`type` and `version`) and run this hook on `settings` dep
    // Get the build version info
    void questClient
      .queryRaw("select build", { limit: "0,1000", background: true })
      .then((result) => {
        if (result.type === QuestDB.Type.DQL && result.count === 1) {
          setBuildVersion(formatVersion(result.dataset[0][0] as string))
          setCommitHash(formatCommitHash(result.dataset[0][0] as string))
        }
      })
      .catch(() => {
        // Authentication can end while the initial build query is waiting.
      })
  }, [authCheckFinished])

  // Telemetry queries use SQL, and therefore need to have auth header set if needed.
  // Defer starting until the authorization is properly set for all HTTP requests.
  useEffect(() => {
    if (authCheckFinished) {
      dispatch(actions.telemetry.start())
    }
  }, [authCheckFinished])

  useEffect(() => {
    if (telemetryConfig?.enabled && telemetryConfig?.id) {
      void startConsoleEvents(telemetryConfig)
      return () => {
        stopConsoleEvents()
      }
    }
  }, [telemetryConfig?.enabled, telemetryConfig?.id])

  const contextValue = useMemo(
    () => ({
      quest: questClient,
      questExecution,
      buildVersion,
      commitHash,
    }),
    [buildVersion, commitHash],
  )

  if (!authCheckFinished)
    return authCheckError ? (
      <AuthCheckRecovery
        error={authCheckError}
        pending={authCheckPending}
        onRetry={retry}
        onSignIn={signInAgain}
      />
    ) : showAuthCheckStatus ? (
      <CenteredLayout>
        <div role="status">
          <Text color="contentPrimary">Checking your session…</Text>
        </div>
      </CenteredLayout>
    ) : null

  return (
    <QuestContext.Provider value={contextValue}>
      <ConsoleMain ref={consoleRef} aria-label="QuestDB console">
        {children}
        <QueryExecutionConfirmDialog />
      </ConsoleMain>
    </QuestContext.Provider>
  )
}
