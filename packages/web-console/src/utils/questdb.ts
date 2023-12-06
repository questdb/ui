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
import { isServerError } from "../utils"
import { TelemetryConfigShape } from "./../store/Telemetry/types"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"

type ColumnDefinition = Readonly<{ name: string; type: string }>

type Value = string | number | boolean
type RawData = Record<string, Value>

export enum Type {
  DDL = "ddl",
  DQL = "dql",
  ERROR = "error",
}

export type Timings = {
  compiler: number
  count: number
  execute: number
  fetch: number
}

export type Explain = { jitCompiled: boolean }

type DatasetType = Array<boolean | string | number>

type RawDqlResult = {
  columns: ColumnDefinition[]
  count: number
  dataset: DatasetType[]
  ddl: undefined
  error: undefined
  query: string
  timings: Timings
  explain?: Explain
}

type RawDdlResult = {
  ddl: "OK"
}

type RawErrorResult = {
  ddl: undefined
  error: "<error message>"
  position: number
  query: string
}

type DdlResult = {
  query: string
  type: Type.DDL
}

type RawResult = RawDqlResult | RawDdlResult | RawErrorResult

export type ErrorResult = RawErrorResult & {
  type: Type.ERROR
  status: number
}

export type QueryRawResult =
  | (Omit<RawDqlResult, "ddl"> & { type: Type.DQL })
  | DdlResult
  | ErrorResult

export type QueryResult<T extends Record<string, any>> =
  | {
      columns: ColumnDefinition[]
      count: number
      data: T[]
      timings: Timings
      type: Type.DQL
      explain?: Explain
    }
  | ErrorResult
  | DdlResult

export type Table = {
  table_name: string
  partitionBy: string
  designatedTimestamp: string
  walEnabled: boolean
  dedup: boolean
}

export type Column = {
  column: string
  indexed: boolean
  designated: boolean
  indexBlockCapacity: number
  symbolCached: boolean
  symbolCapacity: number
  type: string
  upsertKey: boolean
}

export type Options = {
  limit?: string
  explain?: boolean
}

export type Release = {
  assets: {
    browser_download_url: string
    name: string
    size: number
  }[]
  html_url: string
  name: string
  published_at: string
}

export type NewsThumbnail = {
  id: string
  width: number
  height: number
  url: string
  filename: string
  size: number
  type: string
  thumbnails: Record<
    "small" | "large" | "full",
    {
      url: string
      width: number
      height: number
    }
  >
}

export type NewsItem = {
  id: string
  title: string
  body: string
  thumbnail?: NewsThumbnail[]
  status: "published" | "draft"
  date: string
}

export enum FileCheckStatus {
  EXISTS = "Exists",
  DOES_NOT_EXIST = "Does not exist",
  RESERVED_NAME = "Reserved name",
}

export type FileCheckResponse = {
  status: FileCheckStatus
}

export type UploadModeSettings = {
  forceHeader: boolean
  overwrite: boolean
  skipLev: boolean
  delimiter: string
  atomicity: string
  maxUncommitedRows: number
}

export type SchemaColumn = {
  name: string
  type: string
  pattern?: string
  upsertKey?: boolean
}

type UploadOptions = {
  file: File
  name: string
  settings?: UploadModeSettings
  schema?: SchemaColumn[]
  partitionBy?: string
  timestamp?: string
  onProgress: (progress: number) => void
}

export type UploadResultColumn = {
  name: string
  type: string
  size: number
  errors: number
}

export type UploadResult = {
  columns: UploadResultColumn[]
  header: boolean
  location: string
  rowsImported: number
  rowsRejected: number
  status: string
}

export class Client {
  private readonly _host: string
  private _controllers: AbortController[] = []

  constructor(host?: string) {
    if (!host) {
      this._host = window.location.origin
    } else {
      this._host = host
    }
  }

  static encodeParams = (
    params: Record<string, string | number | boolean | undefined>,
  ) =>
    Object.keys(params)
      .filter((k) => typeof params[k] !== "undefined")
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(
            params[k] as string | number | boolean,
          )}`,
      )
      .join("&")

  abort = () => {
    this._controllers.forEach((controller) => {
      controller.abort()
    })
    this._controllers = []
  }

  async query<T>(query: string, options?: Options): Promise<QueryResult<T>> {
    const result = await this.queryRaw(query, options)

    if (result.type === Type.DQL) {
      const { columns, count, dataset, timings } = result

      const parsed = dataset.map(
        (row) =>
          row.reduce(
            (acc: RawData, val: Value, idx) => ({
              ...acc,
              [columns[idx].name]: val,
            }),
            {},
          ) as RawData,
      ) as unknown as T[]

      return {
        columns,
        count,
        data: parsed,
        timings,
        type: Type.DQL,
        ...(result.explain ? { explain: result.explain } : {}),
      }
    }

    return result
  }

  async queryRaw(query: string, options?: Options): Promise<QueryRawResult> {
    const controller = new AbortController()
    const payload = {
      ...options,
      count: true,
      src: "con",
      query,
      timings: true,
    }

    this._controllers.push(controller)
    let response: Response
    const start = new Date()

    try {
      response = await fetch(
        `${this._host}/exec?${Client.encodeParams(payload)}`,
        { signal: controller.signal },
      )
    } catch (error) {
      const err = {
        position: -1,
        query,
        type: Type.ERROR,
      }

      const genericErrorPayload = {
        ...err,
        error: "An error occured, please try again",
      }

      if (error instanceof DOMException) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return await Promise.reject({
          ...err,
          error:
            error.code === 20
              ? "Cancelled by user"
              : JSON.stringify(error).toString(),
        })
      }

      eventBus.publish(EventType.MSG_CONNECTION_ERROR, genericErrorPayload)

      // eslint-disable-next-line prefer-promise-reject-errors
      return await Promise.reject(genericErrorPayload)
    } finally {
      const index = this._controllers.indexOf(controller)

      if (index >= 0) {
        this._controllers.splice(index, 1)
      }
    }

    if (response.ok || response.status === 400) {
      // 400 is only for SQL errors
      const fetchTime = (new Date().getTime() - start.getTime()) * 1e6
      const data = (await response.json()) as RawResult

      eventBus.publish(EventType.MSG_CONNECTION_OK)

      if (data.ddl) {
        return {
          query,
          type: Type.DDL,
        }
      }

      if (data.error) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return await Promise.reject({
          ...data,
          type: Type.ERROR,
        })
      }

      return {
        ...data,
        timings: {
          ...data.timings,
          fetch: fetchTime,
        },
        type: Type.DQL,
      }
    }

    const errorPayload: Record<string, string | number> = {
      status: response.status,
      error: response.statusText,
    }

    if (isServerError(response)) {
      errorPayload.error = `QuestDB is not reachable [${response.status}]`
      errorPayload.position = -1
      errorPayload.query = query
      errorPayload.type = Type.ERROR
      eventBus.publish(EventType.MSG_CONNECTION_ERROR, errorPayload)
    }

    // eslint-disable-next-line prefer-promise-reject-errors
    return await Promise.reject(errorPayload)
  }

  async showTables(): Promise<QueryResult<Table>> {
    type BackwardsCompatibleTable = Table & {
      /** @deprecated use `table_name` instead  */
      name: string
    }

    const response = await this.query<BackwardsCompatibleTable>("tables();")

    if (response.type === Type.DQL) {
      return {
        ...response,
        data: response.data
          .slice()
          .sort((a, b) => {
            const aName = a.table_name ?? a.name
            const bName = b.table_name ?? b.name
            if (aName > bName) {
              return 1
            }

            if (aName < bName) {
              return -1
            }

            return 0
          })

          // @TODO: remove this once upstream questdb releases version with `table_name`
          .map((table) => ({
            ...table,
            table_name: table.table_name ?? table.name,
          })),
      }
    }

    return response
  }

  async showColumns(table: string): Promise<QueryResult<Column>> {
    return await this.query<Column>(`SHOW COLUMNS FROM '${table}';`)
  }

  async checkCSVFile(name: string): Promise<FileCheckResponse> {
    try {
      const response: Response = await fetch(
        `${this._host}/chk?${Client.encodeParams({
          f: "json",
          j: name,
        })}`,
      )
      return await response.json()
    } catch (error) {
      throw error
    }
  }

  async uploadCSVFile({
    file,
    name,
    settings,
    schema,
    partitionBy,
    timestamp,
    onProgress,
  }: UploadOptions): Promise<UploadResult> {
    const formData = new FormData()
    if (schema) {
      formData.append("schema", JSON.stringify(schema))
    }
    formData.append("data", file)
    const serializedSettings = settings
      ? Object.keys(settings).reduce(
          (acc, key) => ({
            ...acc,
            [key]: settings[key as keyof UploadModeSettings].toString(),
          }),
          {},
        )
      : {}
    const params = {
      fmt: "json",
      name,
      ...(partitionBy ? { partitionBy } : {}),
      ...(timestamp ? { timestamp } : {}),
      ...serializedSettings,
    }

    return new Promise((resolve, reject) => {
      let request = new XMLHttpRequest()
      request.open("POST", `${this._host}/imp?${new URLSearchParams(params)}`)
      request.upload.addEventListener("progress", (e) => {
        let percent_completed = (e.loaded / e.total) * 100
        onProgress(percent_completed)
      })
      request.onload = (_e) => {
        if (request.status === 200) {
          resolve(JSON.parse(request.response))
        } else {
          reject({
            status: request.status,
            statusText: request.statusText,
          })
        }
      }
      request.onerror = () => {
        reject({
          status: request.status,
          statusText: request.statusText,
        })
      }
      request.send(formData)
    })
  }

  async getLatestRelease() {
    try {
      const response: Response = await fetch(
        `https://api.github.com/repos/questdb/questdb/releases/latest`,
      )
      return (await response.json()) as Release
    } catch (error) {
      // eslint-disable-next-line prefer-promise-reject-errors
      throw error
    }
  }

  async sendFeedback({
    email,
    message,
    telemetryConfig,
  }: {
    email: string
    message: string
    telemetryConfig?: TelemetryConfigShape
  }) {
    try {
      const response: Response = await fetch(
        `https://cloud.questdb.com/api/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            message,
            telemetryConfig,
            category: "web-console",
          }),
        },
      )
      return (await response.json()) as { status: string }
    } catch (error) {
      // eslint-disable-next-line prefer-promise-reject-errors
      throw error
    }
  }

  async getNews({
    category,
    telemetryConfig,
  }: {
    category: string
    telemetryConfig?: TelemetryConfigShape
  }) {
    try {
      const response: Response = await fetch(
        `https://cloud.questdb.com/api/news?category=${category}&telemetryUserId=${telemetryConfig?.id}`,
      )
      return (await response.json()) as NewsItem[]
    } catch (error) {
      // eslint-disable-next-line prefer-promise-reject-errors
      throw error
    }
  }
}
