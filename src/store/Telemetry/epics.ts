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

import { Epic, ofType } from "redux-observable"
import {
  delay,
  map,
  switchMap,
  withLatestFrom,
  retryWhen,
  tap,
  catchError,
  scan,
  delayWhen,
} from "rxjs/operators"
import { defer, from, NEVER, of, timer, throwError } from "rxjs"

const MAX_RETRIES = 5
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 30000
const TELEMETRY_INTERVAL_MS = 36e5 // 1 hour

import { API, TelemetryTable } from "../../consts"
import { actions, selectors } from "../../store"
import {
  SetTelemetryConfigAction,
  SetTelemetryRemoteConfigAction,
  StoreAction,
  StoreShape,
  TelemetryAction,
  TelemetryAT,
  TelemetryConfigShape,
} from "../../types"

import { fromFetch } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { getValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { AuthPayload } from "../../modules/OAuth2/types"
import {
  sendServerInfoTelemetry,
  getTelemetryTimestamp,
} from "../../utils/telemetry"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"

const quest = new QuestDB.Client()

export const getServerInfo: Epic<StoreAction, TelemetryAction, StoreShape> = (
  action$,
) =>
  action$.pipe(
    ofType<StoreAction, TelemetryAction>(TelemetryAT.START),
    switchMap(() => {
      // Set an authorization header for the QuestDB client instance within the telemetry epic
      const authPayload = ssoAuthState.getAuthPayload()
      const token = authPayload ?? ({} as AuthPayload)
      if (token.access_token) {
        quest.setCommonHeaders({
          Authorization: `Bearer ${token.groups_encoded_in_token ? token.id_token : token.access_token}`,
        })
      } else {
        const restToken = getValue(StoreKey.REST_TOKEN)
        if (restToken) {
          quest.setCommonHeaders({
            Authorization: `Bearer ${restToken}`,
          })
        } else {
          const basicAuth = getValue(StoreKey.BASIC_AUTH_HEADER)
          if (basicAuth) {
            quest.setCommonHeaders({
              Authorization: basicAuth,
            })
          }
        }
      }
      return from(
        quest.query<TelemetryConfigShape>(`${TelemetryTable.CONFIG} limit -1`),
      )
    }),
    switchMap((response) => {
      if (response.type === QuestDB.Type.DQL) {
        return of(actions.telemetry.setConfig(response.data[0]))
      }

      return NEVER
    }),
  )

export const getLatestTelemetryTimestamp: Epic<
  StoreAction,
  TelemetryAction,
  StoreShape
> = (action$, state$) =>
  action$.pipe(
    ofType<StoreAction, SetTelemetryConfigAction>(TelemetryAT.SET_CONFIG),
    withLatestFrom(state$),
    switchMap(([_, state]) => {
      const serverInfo = selectors.telemetry.getConfig(state)
      if (serverInfo) {
        void sendServerInfoTelemetry(serverInfo)
      }
      return getTelemetryTimestamp(serverInfo)
    }),
    map((response) => {
      // Start the loop even if fetching remote config fails.
      // startTelemetry will handle missing lastUpdated by scheduling next check.
      return actions.telemetry.setRemoteConfig(
        response.error ? {} : response.data,
      )
    }),
  )

export const startTelemetry: Epic<StoreAction, TelemetryAction, StoreShape> = (
  action$,
  state$,
) =>
  action$.pipe(
    ofType<StoreAction, SetTelemetryRemoteConfigAction>(
      TelemetryAT.SET_REMOTE_CONFIG,
    ),
    withLatestFrom(state$),
    switchMap(([_, state]) => {
      const remoteConfig = selectors.telemetry.getRemoteConfig(state)

      if (!remoteConfig?.lastUpdated) {
        // No lastUpdated yet, schedule next check in 1 hour
        return of({ type: "skip" as const, remoteConfig })
      }

      const ts = new Date(remoteConfig.lastUpdated).toISOString()
      return from(
        quest.queryRaw(
          `with tel as (
            SELECT cast(created as long), event, origin
            FROM ${TelemetryTable.MAIN}
            WHERE created > '${ts}'
            LIMIT -10000
          )
          SELECT cast(created as long), cast(1000 as short), cast(case when sm >= 0 then sm else 32767 end as short) FROM (
            SELECT created, cast(ceil(sum(rowCount) / 1000.0) as short) sm
            FROM ${TelemetryTable.WAL}
            WHERE created > '${ts}' and rowCount > 0
            SAMPLE BY 1h align to calendar
          )
          UNION ALL
          SELECT cast(created as long), cast(2000 as short), cast(case when sm >= 0 then sm else 32767 end as short) FROM (
            SELECT created, cast(count() as short) sm
            FROM ${TelemetryTable.WAL}
            WHERE created > '${ts}' and rowCount > 0
            SAMPLE BY 1h align to calendar
          )
          UNION ALL
          SELECT cast(created as long), cast(3000 as short), cast(case when sm >= 0 then sm else 32767 end as short) FROM (
            SELECT created, cast(max(latency) / 1000.0 as short) sm
            FROM ${TelemetryTable.WAL}
            WHERE created > '${ts}' and rowCount > 0
            SAMPLE BY 1h align to calendar
           )
           UNION ALL
           SELECT * FROM tel
           `
            .replace(/\s+/g, " ")
            .trim(),
        ),
      ).pipe(map((result) => ({ type: "data" as const, result, remoteConfig })))
    }),
    withLatestFrom(state$),
    switchMap(([payload, state]) => {
      const config = selectors.telemetry.getConfig(state)

      if (payload.type === "skip") {
        // No lastUpdated, schedule next check
        return of(null).pipe(
          delay(TELEMETRY_INTERVAL_MS),
          map(() =>
            actions.telemetry.setRemoteConfig(payload.remoteConfig ?? {}),
          ),
        )
      }

      const { result, remoteConfig } = payload

      if (
        config?.id != null &&
        result.type === QuestDB.Type.DQL &&
        result.count > 0
      ) {
        return defer(() =>
          fromFetch<{ _: void }>(
            `${API}/add`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                columns: result.columns,
                dataset: result.dataset,
                id: config.id,
                version: config.version,
                os: config.os,
                package: config.package,
              }),
            },
            false,
          ),
        ).pipe(
          tap((response) => {
            if (response.error) {
              throw new Error("Telemetry request failed")
            }
          }),
          retryWhen((errors) =>
            errors.pipe(
              scan((retryCount) => retryCount + 1, 0),
              delayWhen((retryCount) => {
                if (retryCount > MAX_RETRIES) {
                  return throwError(() => new Error("Max retries exceeded"))
                }
                const delayMs = Math.min(
                  RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1),
                  RETRY_MAX_DELAY_MS,
                )
                return timer(delayMs)
              }),
            ),
          ),
          map(() => {
            const timestamp = result.dataset[result.count - 1][0] as string
            return { ...remoteConfig, lastUpdated: timestamp }
          }),
          catchError(() => of(remoteConfig)),
          delay(TELEMETRY_INTERVAL_MS),
          map((cfg) => actions.telemetry.setRemoteConfig(cfg ?? {})),
        )
      }

      // No data to send, but still schedule next check in 1 hour
      return of(null).pipe(
        delay(TELEMETRY_INTERVAL_MS),
        map(() => actions.telemetry.setRemoteConfig(remoteConfig ?? {})),
      )
    }),
  )

export default [getServerInfo, getLatestTelemetryTimestamp, startTelemetry]
