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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import * as QuestDB from "../../utils/questdb"
import { useAuth } from "../AuthProvider"
import { questClient } from "../../utils/questdb/queryClient"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { Button, Text } from "../../components"
import { Box } from "../../components/Box"
import { formatCommitHash, formatVersion } from "./services"
import { Versions } from "./types"
import {
  getBearerAuthorization,
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

const questExecution = new QuestDB.QueryExecutionManager()

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
  const { sessionData, refreshAuthToken } = useAuth()
  // Password credentials are shared across browser tabs; retain this tab's login.
  const [nonSSOAuthorization] = useState(() =>
    getStoredCredentialAuthorization(),
  )
  const telemetryConfig = useSelector(selectors.telemetry.getConfig)
  const [authCheckFinished, setAuthCheckFinished] = useState(
    !hasUIAuth(settings),
  )
  const [buildVersion, setBuildVersion] = useState<Versions>(
    defaultValues.buildVersion,
  )
  const [commitHash, setCommitHash] = useState<string>("")

  const [authCheckError, setAuthCheckError] = useState<string>()
  const [authCheckPending, setAuthCheckPending] = useState(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const finishAuthCheck = useCallback(async () => {
    const sessionId = ssoAuthState.getSessionId()
    setAuthCheckPending(true)
    try {
      await questClient.queryRaw("SELECT 1")
      if (mounted.current && ssoAuthState.getSessionId() === sessionId) {
        setAuthCheckFinished(true)
      }
    } catch (error) {
      const failure = error as Partial<QuestDB.ErrorResult>
      // AuthProvider handles session-ended/protocol-denied errors. Connection
      // listeners and toasts below this gate are not mounted yet, so report
      // other failures here rather than leaving a permanently blank page.
      if (
        mounted.current &&
        ssoAuthState.getSessionId() === sessionId &&
        !failure.sessionEnded &&
        String(failure.error) !== "Cancelled by user"
      ) {
        setAuthCheckError(failure.error || "Could not connect to QuestDB.")
      }
    } finally {
      if (mounted.current && ssoAuthState.getSessionId() === sessionId) {
        setAuthCheckPending(false)
      }
    }
  }, [])

  useEffect(() => {
    const authorization = sessionData
      ? getBearerAuthorization(sessionData)
      : nonSSOAuthorization
    questClient.setCommonHeaders(
      authorization ? { Authorization: authorization } : {},
    )
    questClient.refreshTokenMethod = sessionData
      ? (deadlineSignal, requestSignal) =>
          refreshAuthToken(
            settings,
            ssoAuthState.getAuthPayload()?.refresh_token,
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
    // TODO: Remove this, use info from `/settings` (`type` and `version`) and run this hook on `settings` dep
    // Get the build version info
    void questClient
      .queryRaw("select build", { limit: "0,1000" })
      .then((result) => {
        if (result.type === QuestDB.Type.DQL && result.count === 1) {
          setBuildVersion(formatVersion(result.dataset[0][0] as string))
          setCommitHash(formatCommitHash(result.dataset[0][0] as string))
        }
      })
      .catch(() => {
        // Authentication can end while the initial build query is waiting.
      })
  }, [])

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
      <Box flexDirection="column" gap="2rem" align="center">
        <div role="alert">
          <Text color="contentPrimary">{authCheckError}</Text>
        </div>
        <div role="status">
          <Text color="contentPrimary">
            {authCheckPending ? "Reconnecting…" : ""}
          </Text>
        </div>
        {/* Keep the button focusable while busy; native disabled can drop focus. */}
        <Button
          aria-disabled={authCheckPending}
          aria-busy={authCheckPending}
          onClick={() => {
            if (!authCheckPending) void finishAuthCheck()
          }}
        >
          Retry connection
        </Button>
      </Box>
    ) : null

  return (
    <QuestContext.Provider value={contextValue}>
      {children}
      <QueryExecutionConfirmDialog />
    </QuestContext.Provider>
  )
}
