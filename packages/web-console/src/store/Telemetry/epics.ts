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
import { delay, filter, map, switchMap, withLatestFrom } from "rxjs/operators"
import { from, NEVER, of } from "rxjs"

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
  TelemetryRemoteConfigShape,
} from "../../types"

import { fromFetch } from "../../utils"
import * as QuestDB from "../../utils/questdb"
import { getValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { AuthPayload } from "../../modules/OAuth2/types"

const quest = new QuestDB.Client()

export const getConfig: Epic<StoreAction, TelemetryAction, StoreShape> = (
  action$,
) =>
  action$.pipe(
    ofType<StoreAction, TelemetryAction>(TelemetryAT.START),
    switchMap(() => {
      // Set an authorization header for the QuestDB client instance within the telemetry epic
      const authPayload =
        getValue(StoreKey.AUTH_PAYLOAD) !== ""
          ? getValue(StoreKey.AUTH_PAYLOAD)
          : "{}"
      const token = JSON.parse(authPayload) as AuthPayload
      if (token.access_token) {
        quest.setCommonHeaders({
          Authorization: `Bearer ${token.access_token}`,
        })
      } else {
          const restToken = getValue(StoreKey.REST_TOKEN)
          if (restToken) {
              quest.setCommonHeaders({
                  Authorization: `Bearer ${restToken}`
              })
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

export const getRemoteConfig: Epic<StoreAction, TelemetryAction, StoreShape> = (
  action$,
  state$,
) =>
  action$.pipe(
    ofType<StoreAction, SetTelemetryConfigAction>(TelemetryAT.SET_CONFIG),
    withLatestFrom(state$),
    switchMap(([_, state]) => {
      const config = selectors.telemetry.getConfig(state)
      if (config?.enabled) {
        return fromFetch<Partial<TelemetryRemoteConfigShape>>(
          `${API}/config`,
          {
            method: "POST",
            body: JSON.stringify(config),
          },
          false,
        )
      }

      return NEVER
    }),
    switchMap((response) => {
      if (response.error) {
        return NEVER
      }

      return of(actions.telemetry.setRemoteConfig(response.data))
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

      if (remoteConfig?.lastUpdated) {
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
        )
      }

      return NEVER
    }),
    withLatestFrom(state$),
    switchMap(([result, state]) => {
      const remoteConfig = selectors.telemetry.getRemoteConfig(state)
      const config = selectors.telemetry.getConfig(state)

      if (
        config?.id != null &&
        result.type === QuestDB.Type.DQL &&
        result.count > 0
      ) {
        return fromFetch<{ _: void }>(
          `${API}/add`,
          {
            method: "POST",
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
        ).pipe(
          map((response) => {
            if (!response.error) {
              const timestamp = result.dataset[result.count - 1][0] as string

              return actions.telemetry.setRemoteConfig({
                ...remoteConfig,
                lastUpdated: timestamp,
              })
            }
          }),
          delay(36e5),
          filter((a): a is TelemetryAction => !!a),
        )
      }

      return NEVER
    }),
  )

export default [getConfig, getRemoteConfig, startTelemetry]
