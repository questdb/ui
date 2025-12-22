import { isServerError } from "../../utils"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { AuthPayload } from "../../modules/OAuth2/types"
import { API_VERSION } from "../../consts"
import {
  Type,
  ErrorResult,
  QueryRawResult,
  QueryResult,
  Table,
  Column,
  Options,
  RawData,
  RawResult,
  Release,
  NewsItem,
  FileCheckResponse,
  UploadModeSettings,
  UploadOptions,
  UploadResult,
  Value,
  Preferences,
  Permission,
  SymbolColumnDetails,
  View,
} from "./types"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"

export class Client {
  private _controllers: AbortController[] = []
  private commonHeaders: Record<string, string> = {}
  private static refreshTokenPending = false
  private static numOfPendingQueries = 0
  refreshTokenMethod: () => Promise<Partial<AuthPayload>> = async (): Promise<
    Partial<AuthPayload>
  > => {
    return Promise.resolve({})
  }

  private tokenNeedsRefresh() {
    const authPayload = ssoAuthState.getAuthPayload()
    return (
      authPayload &&
      authPayload.refresh_token &&
      new Date(authPayload.expires_at).getTime() - new Date().getTime() < 30000
    )
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
              Authorization: `Bearer ${
                newToken.groups_encoded_in_token
                  ? newToken.id_token
                  : newToken.access_token
              }`,
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

  static transformQueryRawResult = <T extends Record<string, unknown>>(
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

  async query<T extends Record<string, unknown>>(
    query: string,
    options?: Options,
  ): Promise<QueryResult<T>> {
    const result = await this.queryRaw(query, options)

    return Client.transformQueryRawResult<T>(result)
  }

  private removeController(controller: AbortController) {
    const index = this._controllers.indexOf(controller)
    if (index >= 0) {
      this._controllers.splice(index, 1)
    }
  }

  async queryRaw(query: string, options?: Options): Promise<QueryRawResult> {
    const controller = new AbortController()
    const payload = {
      count: true,
      src: "con",
      query,
      timings: true,
      version: API_VERSION,
      ...options,
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
      this.removeController(controller)
      Client.numOfPendingQueries--

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
        return Promise.reject({
          ...err,
          error:
            error.code === 20
              ? "Cancelled by user"
              : JSON.stringify(error).toString(),
        })
      }

      eventBus.publish(EventType.MSG_CONNECTION_ERROR, genericErrorPayload)

      return Promise.reject(genericErrorPayload)
    }

    try {
      if (
        response.ok ||
        response.status === 400 ||
        (response.ok && response.status === 403)
      ) {
        let responseText
        try {
          responseText = await response.text()
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return Promise.reject({
              position: -1,
              query,
              type: Type.ERROR,
              error: "Cancelled by user",
            })
          }
          return Promise.reject({
            error: `Failed to read response: ${error}`,
            type: Type.ERROR,
          })
        }
        const fetchTime = (new Date().getTime() - start.getTime()) * 1e6
        let data
        try {
          data = JSON.parse(responseText) as RawResult
        } catch (error) {
          return Promise.reject({
            error: `Invalid JSON response from the server: ${error}`,
            type: Type.ERROR,
          })
        }

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
          return Promise.reject({
            ...data,
            type: Type.ERROR,
          })
        }

        if (data.notice) {
          return {
            ...data,
            type: Type.NOTICE,
          }
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
        let errorText
        try {
          errorText = (await response.text()).trim()
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return Promise.reject({
              position: -1,
              query,
              type: Type.ERROR,
              error: "Cancelled by user",
            })
          }
          throw error
        }
        if (errorText.startsWith("{")) {
          const data = JSON.parse(errorText) as ErrorResult
          errorPayload.error = data.error
        } else {
          errorPayload.error = errorText
        }
        eventBus.publish(EventType.MSG_CONNECTION_FORBIDDEN, errorPayload)
      }

      return Promise.reject(errorPayload)
    } finally {
      this.removeController(controller)
      Client.numOfPendingQueries--
    }
  }

  async showTables(): Promise<QueryResult<Table>> {
    const response = await this.query<Table>("tables();")

    if (response.type === Type.DQL) {
      return {
        ...response,
        data: response.data.slice().sort((a, b) => {
          const aName = a.table_name
          const bName = b.table_name
          if (aName > bName) {
            return 1
          }

          if (aName < bName) {
            return -1
          }

          return 0
        }),
      }
    }

    return response
  }

  async showPermissions(user: string): Promise<QueryResult<Permission>> {
    return await this.query<Permission>(`SHOW PERMISSIONS '${user}';`)
  }

  async showColumns(table: string): Promise<QueryResult<Column>> {
    return await this.query<Column>(`SHOW COLUMNS FROM '${table}';`)
  }

  async showSymbolColumnDetails(
    table: string,
    column: string,
  ): Promise<
    QueryResult<{
      symbolCached: boolean
      symbolCapacity: number
      indexed: boolean
    }>
  > {
    return await this.query<SymbolColumnDetails>(
      `WITH cols as (SHOW COLUMNS FROM '${table}') SELECT symbolCached, symbolCapacity, indexed FROM cols WHERE column = '${column}';`,
    )
  }

  async showMatViewDDL(table: string): Promise<QueryResult<{ ddl: string }>> {
    return await this.query<{ ddl: string }>(
      `SHOW CREATE MATERIALIZED VIEW '${table}';`,
    )
  }

  async showViewDDL(viewName: string): Promise<QueryResult<{ ddl: string }>> {
    return await this.query<{ ddl: string }>(
      `SHOW CREATE VIEW '${viewName}';`,
    )
  }

  async showViews(): Promise<QueryResult<View>> {
    return await this.query<View>("views();")
  }

  async showTableDDL(table: string): Promise<QueryResult<{ ddl: string }>> {
    return await this.query<{ ddl: string }>(`SHOW CREATE TABLE '${table}';`)
  }

  async checkCSVFile(name: string): Promise<FileCheckResponse> {
    const response = await fetch(
      `chk?${Client.encodeParams({
        f: "json",
        j: name,
        version: API_VERSION,
      })}`,
      { headers: this.commonHeaders },
    )
    return (await response.json()) as FileCheckResponse
  }

  async uploadCSVFile({
    file,
    name,
    owner,
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
      owner,
      ...(partitionBy ? { partitionBy } : {}),
      ...(timestamp ? { timestamp } : {}),
      ...serializedSettings,
    }

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open("POST", `imp?${new URLSearchParams(params)}`)
      Object.keys(this.commonHeaders).forEach((key) => {
        request.setRequestHeader(key, this.commonHeaders[key])
      })
      request.upload.addEventListener("progress", (e) => {
        const percent_completed = (e.loaded / e.total) * 100
        onProgress(percent_completed)
      })
      request.onload = (_e) => {
        if (request.status === 200) {
          resolve(JSON.parse(request.response as string) as UploadResult)
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

  async savePreferences(
    preferences: Preferences,
  ): Promise<{ status: number; message?: string; success: boolean }> {
    const { version, ...prefs } = preferences
    const response: Response = await fetch(`settings?version=${version}`, {
      method: "PUT",
      headers: this.commonHeaders,
      body: JSON.stringify(prefs),
    })
    if (!response.ok) {
      let errorMessage: string
      try {
        errorMessage = await extractErrorMessage(response)
      } catch (e) {
        errorMessage = response.statusText
      }
      return { status: response.status, message: errorMessage, success: false }
    }
    return { status: response.status, success: true }
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
    email?: string
    message: string
    telemetryConfig?: TelemetryConfigShape
  }) {
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

async function extractErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type")
  if (contentType?.includes("application/json")) {
    const { error } = (await response.json()) as { error: string }
    return error
  } else {
    return response.text()
  }
}
