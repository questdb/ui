import { isServerError } from "../../utils"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { AuthPayload, AuthSessionEndedError } from "../../modules/OAuth2/types"
import { API_VERSION } from "../../consts"
import {
  Type,
  ErrorResult,
  QueryRawResult,
  QueryResult,
  Table,
  Column,
  Options,
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
  LiveView,
  MaterializedView,
  TableKind,
  ValidateQueryResult,
  ValidateQuerySuccessResult,
  ValidateQueryErrorResult,
} from "./types"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import {
  getBearerAuthorization,
  TOKEN_REQUEST_TIMEOUT_MS,
} from "../../modules/OAuth2/utils"
import { withDeadline } from "../withDeadline"

export type QueryId = number

export const REFRESH_TIMEOUT_MS = TOKEN_REQUEST_TIMEOUT_MS
const REFRESH_RETRY_DELAY_MS = 5_000
const MAX_REFRESH_RETRY_DELAY_MS = 30_000
const REFRESH_WINDOW_MS = 30_000
const MIN_SUCCESS_REFRESH_INTERVAL_MS = 30_000

export const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''")

export const buildDDLQuery = (name: string, kind: TableKind): string => {
  const escapedName = escapeSqlLiteral(name)
  switch (kind) {
    case "table":
      return `SHOW CREATE TABLE '${escapedName}';`
    case "matview":
      return `SHOW CREATE MATERIALIZED VIEW '${escapedName}';`
    case "view":
      return `SHOW CREATE VIEW '${escapedName}';`
    case "liveview":
      return `SHOW CREATE LIVE VIEW '${escapedName}';`
  }
}

export class Client {
  private _controllers = new Map<QueryId, AbortController>()
  private _nextQueryId: QueryId = 1
  private _activeQueryId: QueryId | null = null
  private commonHeaders: Record<string, string> = {}
  private static refreshPromise: Promise<void> | null = null
  private static refreshSessionId: number | null = null
  private static refreshRetryCount = 0
  private static retryRefreshAfter = 0
  private static retryForAuthPayload: AuthPayload | null = null
  refreshTokenMethod?: (
    deadlineSignal?: AbortSignal,
  ) => Promise<Partial<AuthPayload> | undefined>

  private static resetRefreshBackoff(authPayload: AuthPayload | null) {
    Client.retryForAuthPayload = authPayload
    Client.refreshRetryCount = 0
    Client.retryRefreshAfter = 0
  }

  private static syncRefreshSession() {
    if (Client.refreshSessionId !== ssoAuthState.getSessionId()) {
      // A hung request from a logged-out session must not block a new login.
      // Its provider-side installation guard will discard the eventual reply.
      Client.refreshPromise = null
      Client.refreshSessionId = null
    }
    const authPayload = ssoAuthState.getAuthPayload()
    if (Client.retryForAuthPayload !== authPayload) {
      // A new login must never inherit the previous session's backoff.
      Client.resetRefreshBackoff(authPayload)
    }
  }

  static __resetRefreshStateForTests() {
    Client.refreshPromise = null
    Client.refreshSessionId = null
    Client.resetRefreshBackoff(null)
  }

  private tokenNeedsRefresh() {
    const authPayload = ssoAuthState.getAuthPayload()
    return !!(
      authPayload?.refresh_token &&
      new Date(authPayload.expires_at).getTime() - Date.now() <
        REFRESH_WINDOW_MS
    )
  }

  setCommonHeaders(headers: Record<string, string>) {
    this.commonHeaders = headers
  }

  private startRefresh() {
    if (Client.refreshPromise || !this.refreshTokenMethod) return
    const originalSession = ssoAuthState.getAuthPayload()
    const sessionId = ssoAuthState.getSessionId()
    const deadlineController = new AbortController()
    const refreshMethod = this.refreshTokenMethod
    let failureReported = false
    const reportFailure = (error: unknown) => {
      if (failureReported || ssoAuthState.getAuthPayload() !== originalSession)
        return
      failureReported = true
      Client.refreshRetryCount++
      const now = Date.now()
      const expiry = originalSession
        ? new Date(originalSession.expires_at).getTime()
        : NaN
      const retryAfter =
        now +
        Math.min(
          REFRESH_RETRY_DELAY_MS * 2 ** (Client.refreshRetryCount - 1),
          MAX_REFRESH_RETRY_DELAY_MS,
        )
      // Retry by expiry if it is still ahead. Once expired, keep ordinary
      // backoff so a failing provider cannot be hammered by polling queries.
      Client.retryRefreshAfter =
        expiry > now ? Math.min(expiry, retryAfter) : retryAfter
      console.error("Failed to refresh the auth token", error)
      if (
        ssoAuthState.isSSOAuthenticated() &&
        !ssoAuthState.hasRefreshFailed()
      ) {
        ssoAuthState.markRefreshFailed()
        eventBus.publish(EventType.MSG_AUTH_REFRESH_FAILED)
      }
    }
    const request = Promise.resolve()
      .then(() => refreshMethod(deadlineController.signal))
      .then((newToken) => {
        const currentSession = ssoAuthState.getAuthPayload()
        if (
          !newToken ||
          !currentSession ||
          ssoAuthState.getSessionId() !== sessionId
        )
          return
        const authorization = getBearerAuthorization(newToken)
        if (!authorization) return
        this.setCommonHeaders({
          ...this.commonHeaders,
          Authorization: authorization,
        })
        Client.resetRefreshBackoff(currentSession)
        const remaining =
          new Date(currentSession.expires_at).getTime() - Date.now()
        // Bound successful refreshes too: skew (or very short ID tokens) can
        // leave every new token inside the refresh window. Remember the new
        // payload so the next query's session sync doesn't erase the throttle.
        Client.retryRefreshAfter =
          Date.now() +
          (remaining > 0
            ? Math.max(
                1,
                Math.min(MIN_SUCCESS_REFRESH_INTERVAL_MS, remaining / 2),
              )
            : MIN_SUCCESS_REFRESH_INTERVAL_MS)
      })
      .catch(reportFailure)
    const wait = withDeadline(request, REFRESH_TIMEOUT_MS, () => {
      // Mark late errors as stale, but don't abort the network request: the
      // provider may have rotated the refresh token before sending its body.
      deadlineController.abort()
    }).catch(reportFailure)
    Client.refreshPromise = wait
    Client.refreshSessionId = sessionId
    // Retain even a timed-out request's slot until it settles, preventing
    // overlapping refreshes that would reuse a rotated token.
    const clearRefresh = () => {
      if (Client.refreshPromise === wait) Client.refreshPromise = null
    }
    void request.then(clearRefresh, clearRefresh)
  }

  private awaitRefresh = (refresh: Promise<void>, signal: AbortSignal) => {
    if (signal.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"))
    }
    // Cancelling one query must not cancel the shared refresh or other waiters.
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"))
      signal.addEventListener("abort", onAbort, { once: true })
      void refresh.then(
        () => {
          signal.removeEventListener("abort", onAbort)
          resolve()
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort)
          reject(error)
        },
      )
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

  abort = (queryId?: QueryId) => {
    if (queryId !== undefined) {
      const controller = this._controllers.get(queryId)
      if (controller) {
        controller.abort()
        this._controllers.delete(queryId)
      }
      if (this._activeQueryId === queryId) {
        this._activeQueryId = null
      }
      return
    }
    this._controllers.forEach((controller) => controller.abort())
    this._controllers.clear()
    this._activeQueryId = null
  }

  abortActive = () => {
    if (this._activeQueryId !== null) {
      this.abort(this._activeQueryId)
    }
  }

  static transformQueryRawResult = <T extends Record<string, unknown>>(
    result: QueryRawResult,
    options?: { convertLongsToBigInt?: boolean },
  ): QueryResult<T> => {
    if (result.type === Type.DQL) {
      const { columns, count, dataset, timings } = result

      const parsed = dataset.map((row) =>
        row.reduce<Record<string, unknown>>((acc, val: Value | null, idx) => {
          const column = columns[idx]
          let value: unknown = val

          if (
            options?.convertLongsToBigInt &&
            column.type === "LONG" &&
            val !== null
          ) {
            if (typeof val === "string" && /^-?\d+$/.test(val)) {
              value = BigInt(val)
            } else if (typeof val === "number" && Number.isSafeInteger(val)) {
              value = BigInt(val)
            } else {
              throw new TypeError(
                `Invalid LONG value for column ${column.name}: ${String(val)}`,
              )
            }
          }

          acc[column.name] = value
          return acc
        }, {}),
      ) as T[]

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

  /**
   * QuestDB returns LONG columns as decimal strings for console requests so
   * their full 64-bit precision survives JSON. Catalog consumers opt into
   * bigint conversion here; regular query results intentionally stay as-is.
   */
  async queryCatalog<T extends Record<string, unknown>>(
    query: string,
    options?: Options,
  ): Promise<QueryResult<T>> {
    const result = await this.queryRaw(query, options)
    return Client.transformQueryRawResult<T>(result, {
      convertLongsToBigInt: true,
    })
  }

  private removeController(queryId: QueryId) {
    this._controllers.delete(queryId)
    if (this._activeQueryId === queryId) {
      this._activeQueryId = null
    }
  }

  queryRaw(
    query: string,
    options: Options & { cancellable: true },
  ): { promise: Promise<QueryRawResult>; queryId: QueryId }
  queryRaw(query: string, options?: Options): Promise<QueryRawResult>
  queryRaw(
    query: string,
    options?: Options,
  ):
    | Promise<QueryRawResult>
    | { promise: Promise<QueryRawResult>; queryId: QueryId } {
    const queryId = this._nextQueryId++
    const controller = new AbortController()
    this._controllers.set(queryId, controller)

    const promise = this._executeQueryRaw(query, options, controller, queryId)

    if (options?.cancellable) {
      this._activeQueryId = queryId
      return { promise, queryId }
    }

    return promise
  }

  private async _executeQueryRaw(
    query: string,
    options: Options | undefined,
    controller: AbortController,
    queryId: QueryId,
  ): Promise<QueryRawResult> {
    const { cancellable: _, onRequestStart, ...queryOptions } = options ?? {}
    const payload = {
      count: true,
      src: "con",
      query,
      timings: true,
      version: API_VERSION,
      ...queryOptions,
    }

    let response: Response
    let fetchStartedAt = 0
    let authorizationAtFetch: string | undefined

    try {
      const originalSession = ssoAuthState.getAuthPayload()
      const originalSessionId = ssoAuthState.getSessionId()
      Client.syncRefreshSession()
      if (this.tokenNeedsRefresh() && Date.now() >= Client.retryRefreshAfter) {
        this.startRefresh()
      }
      const refreshedForRequest = !!Client.refreshPromise
      if (Client.refreshPromise) {
        await this.awaitRefresh(Client.refreshPromise, controller.signal)
      }
      const ensureSession = () => {
        if (
          originalSession &&
          (!ssoAuthState.isSSOAuthenticated() ||
            ssoAuthState.getSessionId() !== originalSessionId)
        ) {
          throw new AuthSessionEndedError()
        }
        if (controller.signal.aborted)
          throw new DOMException("Aborted", "AbortError")
      }
      ensureSession()
      const send = () => {
        onRequestStart?.()
        const headers = this.commonHeaders
        authorizationAtFetch = headers.Authorization
        fetchStartedAt = Date.now()
        return fetch(`exec?${Client.encodeParams(payload)}`, {
          signal: controller.signal,
          headers,
        })
      }
      const sessionAtFetch = ssoAuthState.getAuthPayload()
      response = await send()
      if (
        response.status === 401 &&
        !refreshedForRequest &&
        sessionAtFetch?.refresh_token &&
        sessionAtFetch === ssoAuthState.getAuthPayload() &&
        authorizationAtFetch === getBearerAuthorization(sessionAtFetch) &&
        !ssoAuthState.hasRefreshFailed() &&
        this.refreshTokenMethod
      ) {
        // The server's clock is authoritative. A slow browser clock may not
        // have opened the refresh window yet. A 401 executes no SQL, so one
        // refresh-and-retry is safe even for writes, but never retry a 403.
        this.startRefresh()
        if (Client.refreshPromise) {
          await this.awaitRefresh(Client.refreshPromise, controller.signal)
        }
        ensureSession()
        if (
          !ssoAuthState.hasRefreshFailed() &&
          (ssoAuthState.getAuthPayload() !== sessionAtFetch ||
            this.commonHeaders.Authorization !== authorizationAtFetch)
        ) {
          response = await send()
        }
      }
    } catch (error) {
      this.removeController(queryId)

      const err = {
        position: -1,
        query,
        type: Type.ERROR,
      }

      const genericErrorPayload = {
        ...err,
        error: "An error occurred, please try again",
      }

      if (error instanceof AuthSessionEndedError) {
        return Promise.reject({ ...err, error: error.message })
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
        const fetchTime = (Date.now() - fetchStartedAt) * 1e6
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
            ...(data.timings
              ? { timings: { ...data.timings, fetch: fetchTime } }
              : {}),
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
        const currentAuthPayload = ssoAuthState.getAuthPayload()
        const currentAuthorization = currentAuthPayload
          ? getBearerAuthorization(currentAuthPayload)
          : this.commonHeaders.Authorization
        // Reject an older request without logging out a session using a
        // different bearer. A refresh can also return the same bearer value.
        if (authorizationAtFetch === currentAuthorization) {
          eventBus.publish(EventType.MSG_CONNECTION_UNAUTHORIZED, errorPayload)
        }
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
      this.removeController(queryId)
    }
  }

  async validateQuery(
    query: string,
    signal?: AbortSignal,
  ): Promise<ValidateQueryResult> {
    const response = await fetch(
      `api/v1/sql/validate?${Client.encodeParams({ query })}`,
      {
        headers: this.commonHeaders,
        signal,
      },
    )
    if (response.ok) {
      return (await response.json()) as ValidateQuerySuccessResult
    }

    if (response.status === 400 || response.status === 403) {
      return (await response.json()) as ValidateQueryErrorResult
    }

    return Promise.reject({
      status: response.status,
      statusText: response.statusText,
    })
  }

  async showTables(): Promise<QueryResult<Table>> {
    const response = await this.queryCatalog<Table>("tables();")

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

  async getTableDetails(table: string): Promise<QueryResult<Table>> {
    return await this.queryCatalog<Table>(
      `tables() where table_name = '${escapeSqlLiteral(table)}';`,
    )
  }

  async showMaterializedViews(): Promise<QueryResult<MaterializedView>> {
    return await this.queryCatalog<MaterializedView>("materialized_views()")
  }

  async showViews(): Promise<QueryResult<View>> {
    return await this.query<View>("views();")
  }

  async showLiveViews(): Promise<QueryResult<LiveView>> {
    return await this.queryCatalog<LiveView>("live_views();")
  }

  async cancelQuery(queryId: bigint): Promise<QueryResult<never>> {
    return await this.query<never>(`CANCEL QUERY ${queryId};`)
  }

  async showDDL(
    name: string,
    kind: TableKind,
  ): Promise<QueryResult<{ ddl: string }>> {
    return this.queryDDL(buildDDLQuery(name, kind))
  }

  private async queryDDL(sql: string): Promise<QueryResult<{ ddl: string }>> {
    const result = await this.query<{ ddl: string }>(sql)
    if (result.type === Type.DQL) {
      result.data = result.data.map((row) => ({
        ...row,
        ddl: row.ddl.replace(/\n{2,}/g, "\n"),
      }))
    }
    return result
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
