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
import { TelemetryConfigShape } from "../store/Telemetry/types"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import { AuthPayload } from "../modules/OAuth2/types"
import { StoreKey } from "./localStorage/types"

type ColumnDefinition = Readonly<{ name: string; type: string }>

type Value = string | number | boolean
type RawData = Record<string, Value>

export enum Type {
  DDL = "ddl",
  DML = "dml",
  DQL = "dql",
  ERROR = "error",
}

export type Timings = {
  compiler: number
  authentication: number
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
  dml: undefined
  error: undefined
  query: string
  timings: Timings
  explain?: Explain
}

type RawDdlResult = {
  ddl: "OK"
  dml: undefined
}

type RawDmlResult = {
  ddl: undefined
  dml: "OK"
}

type RawErrorResult = {
  ddl: undefined
  dml: undefined
  error: "<error message>"
  position: number
  query: string
}

type DdlResult = {
  query: string
  type: Type.DDL
}

type DmlResult = {
  query: string
  type: Type.DML
}

type RawResult = RawDqlResult | RawDmlResult | RawDdlResult | RawErrorResult

export type ErrorResult = RawErrorResult & {
  type: Type.ERROR
  status: number
}

export type QueryRawResult =
  | (Omit<RawDqlResult, "ddl" | "dml"> & { type: Type.DQL })
  | DmlResult
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
  | DmlResult
  | DdlResult

export type PartitionBy = "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" | "NONE"

export type Table = {
  table_name: string
  partitionBy: PartitionBy
  designatedTimestamp: string
  walEnabled: boolean
  dedup: boolean
}

export type Partition = {
  index: number
  partitionBy: PartitionBy
  name: string
  minTimestamp: string | null
  maxTimestamp: string | null
  numRows: string
  diskSize: string
  diskSizeHuman: string
  readOnly: boolean
  active: boolean
  attached: boolean
  detached: boolean
  attachable: boolean
}

export enum WalErrorTag {
  DISK_FULL = "DISK FULL",
  TOO_MANY_OPEN_FILES = "TOO MANY OPEN FILES",
  OUT_OF_MMAP_AREAS = "OUT OF MMAP AREAS",
  OUT_OF_MEMORY = "OUT OF MEMORY",
  NONE = "",
}

export type WalTable = {
  name: string
  suspended: boolean
  writerTxn: string
  writerLagTxtCount: string
  sequencerTxn: string
  errorTag?: WalErrorTag
  errorMessage?: string
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
  nm?: boolean
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

export type InformationSchemaColumn = {
  table_name: string
  ordinal_position: number
  column_name: string
  data_type: string
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

export type Parameter = {
  property_path: string
  env_var_name: string
  value: string | null
  value_source: string
  sensitive: boolean
  dynamic: boolean
}

export class Client {
  private _controllers: AbortController[] = []
  private commonHeaders: Record<string, string> = {}
  private static refreshTokenPending = false
  private static numOfPendingQueries = 0
  refreshTokenMethod: () => Promise<Partial<AuthPayload>> = async (): Promise<
    Partial<AuthPayload>
  > => {
    return {}
  }
  private tokenNeedsRefresh() {
    const authPayload = localStorage.getItem(StoreKey.AUTH_PAYLOAD)
    const refreshToken = localStorage.getItem(StoreKey.AUTH_REFRESH_TOKEN)
    if (authPayload) {
      const parsed = JSON.parse(authPayload)
      return (
        new Date(parsed.expires_at).getTime() - new Date().getTime() < 30000 &&
        refreshToken !== ""
      )
    }
  }

  setCommonHeaders(headers: Record<string, string>) {
    this.commonHeaders = headers
  }

  private refreshAuthToken = async () => {
    Client.refreshTokenPending = true
    await new Promise((resolve) => {
      const interval = setInterval(async () => {
        if (Client.numOfPendingQueries === 0) {
          clearInterval(interval)
          const newToken = await this.refreshTokenMethod()
          if (newToken.access_token) {
            this.setCommonHeaders({
              ...this.commonHeaders,
              Authorization: `Bearer ${newToken.access_token}`,
            })
          }
          Client.refreshTokenPending = false
          return resolve(true)
        }
      }, 50)
    })
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

  static transformQueryRawResult = <T>(
    result: QueryRawResult,
  ): QueryResult<T> => {
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

  async query<T>(query: string, options?: Options): Promise<QueryResult<T>> {
    const result = await this.queryRaw(query, options)

    return Client.transformQueryRawResult<T>(result)
  }

  async mockQueryResult<T>(result: QueryRawResult): Promise<QueryResult<T>> {
    return Client.transformQueryRawResult<T>(result)
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

    if (this.tokenNeedsRefresh() && !Client.refreshTokenPending) {
      await this.refreshAuthToken()
    }

    if (Client.refreshTokenPending) {
      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (!Client.refreshTokenPending) {
            clearInterval(interval)
            return resolve(true)
          }
        }, 50)
      })
    }

    Client.numOfPendingQueries++

    const start = new Date()
    try {
      response = await fetch(`exec?${Client.encodeParams(payload)}`, {
        signal: controller.signal,
        headers: this.commonHeaders,
      })
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
        return Promise.reject({
          ...err,
          error:
            error.code === 20
              ? "Cancelled by user"
              : JSON.stringify(error).toString(),
        })
      }

      eventBus.publish(EventType.MSG_CONNECTION_ERROR, genericErrorPayload)

      // eslint-disable-next-line prefer-promise-reject-errors
      return Promise.reject(genericErrorPayload)
    } finally {
      const index = this._controllers.indexOf(controller)

      if (index >= 0) {
        this._controllers.splice(index, 1)
      }

      Client.numOfPendingQueries--
    }

    if (
      response.ok ||
      response.status === 400 ||
      (response.ok && response.status === 403)
    ) {
      const fetchTime = (new Date().getTime() - start.getTime()) * 1e6
      const data = (await response.json()) as RawResult

      eventBus.publish(EventType.MSG_CONNECTION_OK)

      if (response.status === 403) {
        eventBus.publish(EventType.MSG_CONNECTION_FORBIDDEN, data)
      }

      if (data.ddl) {
        return {
          query,
          type: Type.DDL,
        }
      }

      if (data.dml) {
        return {
          query,
          type: Type.DML,
        }
      }

      if (data.error) {
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject({
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

    if (response.status === 401) {
      errorPayload.error = `Unauthorized`
      eventBus.publish(EventType.MSG_CONNECTION_UNAUTHORIZED, errorPayload)
    }

    if (response.status === 403) {
      const errorText = (await response.text()).trim()
      if (errorText.startsWith("{")) {
        const data = JSON.parse(errorText) as ErrorResult
        errorPayload.error = data.error
      } else {
        errorPayload.error = errorText
      }
      eventBus.publish(EventType.MSG_CONNECTION_FORBIDDEN, errorPayload)
    }

    // eslint-disable-next-line prefer-promise-reject-errors
    return Promise.reject(errorPayload)
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
        `chk?${Client.encodeParams({
          f: "json",
          j: name,
        })}`,
        { headers: this.commonHeaders },
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
      request.open("POST", `imp?${new URLSearchParams(params)}`)
      Object.keys(this.commonHeaders).forEach((key) => {
        request.setRequestHeader(key, this.commonHeaders[key])
      })
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

  async exportQueryToCsv(query: string) {
    try {
      const response: Response = await fetch(
        `exp?${Client.encodeParams({ query })}`,
        { headers: this.commonHeaders },
      )
      const blob = await response.blob()
      const filename = response.headers
        .get("Content-Disposition")
        ?.split("=")[1]
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
        ? filename.replaceAll(`"`, "")
        : `questdb-query-${new Date().getTime()}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      throw error
    }
  }

  async getLatestRelease() {
    try {
      const response: Response = await fetch(
        `https://github-api.questdb.io/github/latest`,
      )
      return (await response.json()) as Release
    } catch (error) {
      return Promise.reject(error)
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
      return Promise.reject(error)
    }
  }
}
