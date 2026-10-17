import { isServerError } from "../../utils"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import {
  AuthRefreshUnavailableError,
  CANCELLED_BY_USER,
  endedFor,
  sessionFailureOf,
  SessionEndedError,
} from "../../modules/OAuth2/session"
import { API_VERSION } from "../../consts"
import {
  Type,
  ErrorResult,
  QueryRawResult,
  QueryResult,
  Table,
  Column,
  Options,
  QueryLifecycle,
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
import { authSessionState } from "../../modules/OAuth2/ssoAuthState"
import { getBearerAuthorization } from "../../modules/OAuth2/utils"
import {
  awaitRefresh,
  isRefreshable,
  RefreshTokenMethod,
  RefreshableAuthPayload,
  REFRESH_REQUEST_TIMEOUT_MS,
  REFRESH_WAIT_TIMEOUT_MS,
  tokenRefresh,
} from "./tokenRefresh"

export type QueryId = number

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
  refreshTokenMethod?: RefreshTokenMethod

  setCommonHeaders(headers: Record<string, string>) {
    this.commonHeaders = headers
  }

  private currentAuthorization() {
    const payload = authSessionState.getAuthPayload()
    return payload
      ? getBearerAuthorization(payload)
      : this.commonHeaders.Authorization
  }

  private requestHeaders() {
    const { Authorization: _, ...headers } = this.commonHeaders
    const authorization = this.currentAuthorization()
    return authorization
      ? { ...headers, Authorization: authorization }
      : headers
  }

  private startRefresh(payload: RefreshableAuthPayload) {
    tokenRefresh.start(payload, this.refreshTokenMethod)
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
    lifecycle?: QueryLifecycle,
  ): { promise: Promise<QueryRawResult>; queryId: QueryId }
  queryRaw(
    query: string,
    options?: Options,
    lifecycle?: QueryLifecycle,
  ): Promise<QueryRawResult>
  queryRaw(
    query: string,
    options?: Options,
    lifecycle?: QueryLifecycle,
  ):
    | Promise<QueryRawResult>
    | { promise: Promise<QueryRawResult>; queryId: QueryId } {
    const queryId = this._nextQueryId++
    const controller = new AbortController()
    this._controllers.set(queryId, controller)

    const promise = this._executeQueryRaw(
      query,
      options,
      controller,
      queryId,
      lifecycle,
    )

    if (options?.cancellable) {
      this._activeQueryId = queryId
      return { promise, queryId }
    }

    return promise
  }

  private ensureFreshToken(signal: AbortSignal, lifecycle?: QueryLifecycle) {
    const session = authSessionState.capture()
    tokenRefresh.syncSession()
    const payload = authSessionState.getAuthPayload()
    if (isRefreshable(payload) && tokenRefresh.needsRefresh(payload)) {
      this.startRefresh(payload)
    }
    const ensureCanSend = () => {
      if (endedFor(session)) throw new SessionEndedError()
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      tokenRefresh.ensureUsableToken()
    }
    if (tokenRefresh.softDeadline) {
      lifecycle?.onRefreshWait?.(REFRESH_WAIT_TIMEOUT_MS)
      return awaitRefresh(tokenRefresh.softDeadline, signal).then(ensureCanSend)
    }
    ensureCanSend()
  }

  private async sendQuery(
    payload: Record<string, string | number | boolean | undefined>,
    signal: AbortSignal,
    ensureCurrentSession: () => void,
    execution: { requestNotSent: boolean },
    lifecycle?: QueryLifecycle,
  ) {
    const originalPayload = authSessionState.getAuthPayload()
    const refreshWait = this.ensureFreshToken(signal, lifecycle)
    const waitedBeforeFetch = !!refreshWait
    if (refreshWait) await refreshWait
    const waitForHardDeadline = async () => {
      const deadline = tokenRefresh.hardDeadline
      if (!deadline) return
      lifecycle?.onRefreshWait?.(REFRESH_REQUEST_TIMEOUT_MS)
      await awaitRefresh(deadline, signal)
    }
    const ensureCanSend = () => {
      ensureCurrentSession()
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      tokenRefresh.ensureUsableToken()
    }
    let authorizationAtFetch: string | undefined
    let fetchStartedAt = 0
    const send = async () => {
      ensureCanSend()
      lifecycle?.onRequestStart?.()
      // Read the installed bearer immediately before every authenticated fetch.
      const headers = this.requestHeaders()
      authorizationAtFetch = headers.Authorization
      fetchStartedAt = Date.now()
      execution.requestNotSent = false
      const response = await fetch(`exec?${Client.encodeParams(payload)}`, {
        signal,
        headers,
      })
      // A rejected bearer executed no SQL. A subsequent refresh failure must
      // retain that definitive outcome until another SQL attempt is sent.
      if (response.status === 401) execution.requestNotSent = true
      return response
    }
    const sessionAtFetch = authSessionState.getAuthPayload()
    let response = await send()
    if (response.status === 401 && originalPayload) {
      ensureCurrentSession()
      const currentPayload = authSessionState.getAuthPayload()
      const currentAuthorization = this.currentAuthorization()
      if (tokenRefresh.hardDeadline) {
        // A pre-fetch wait may have expired while its rotating request is
        // still running. A rejected old bearer must not cancel that request.
        await waitForHardDeadline()
        ensureCurrentSession()
        if (authSessionState.hasRefreshFailed())
          throw new AuthRefreshUnavailableError()
        if (
          this.currentAuthorization() !== authorizationAtFetch ||
          authSessionState.getAuthPayload() !== sessionAtFetch
        )
          response = await send()
      } else if (
        currentAuthorization &&
        currentAuthorization !== authorizationAtFetch
      ) {
        // Another request already refreshed this session. A 401 executes no
        // SQL, so even a write can be resent once with the new bearer.
        response = await send()
      } else if (
        isRefreshable(currentPayload) &&
        authSessionState.hasRefreshFailed() &&
        (tokenRefresh.inBackoff() || waitedBeforeFetch)
      ) {
        // A settled transient failure is just as recoverable as a pending
        // refresh. This 401 rejects the old bearer, not the refresh token.
        throw new AuthRefreshUnavailableError()
      } else if (
        !waitedBeforeFetch &&
        isRefreshable(currentPayload) &&
        sessionAtFetch === currentPayload &&
        authorizationAtFetch === currentAuthorization &&
        this.refreshTokenMethod
      ) {
        // A slow browser clock may not have opened the refresh window. The
        // server is authoritative; bypass success throttling for this 401.
        this.startRefresh(currentPayload)
        // A 401 executed no SQL. Retain rotating refreshes until their hard deadline.
        await waitForHardDeadline()
        ensureCurrentSession()
        if (authSessionState.hasRefreshFailed())
          throw new AuthRefreshUnavailableError()
        if (authSessionState.getAuthPayload() !== sessionAtFetch)
          response = await send()
      }
    }
    return { response, authorizationAtFetch, fetchStartedAt }
  }

  private async _executeQueryRaw(
    query: string,
    options: Options | undefined,
    controller: AbortController,
    queryId: QueryId,
    lifecycle?: QueryLifecycle,
  ): Promise<QueryRawResult> {
    const { cancellable: _, ...queryOptions } = options ?? {}
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
    const session = authSessionState.capture()
    const execution = { requestNotSent: true }
    const ensureCurrentSession = () => {
      if (!session.isCurrent()) throw new SessionEndedError()
    }
    const sessionEndedResult = (): ErrorResult => ({
      position: -1,
      query,
      type: Type.ERROR,
      error: new SessionEndedError().message,
      sessionEnded: true,
      ...sessionFailureOf(execution),
    })

    try {
      const sent = await this.sendQuery(
        payload,
        controller.signal,
        ensureCurrentSession,
        execution,
        lifecycle,
      )
      response = sent.response
      authorizationAtFetch = sent.authorizationAtFetch
      fetchStartedAt = sent.fetchStartedAt
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

      if (endedFor(session, error)) {
        return Promise.reject(sessionEndedResult())
      }

      if (error instanceof AuthRefreshUnavailableError) {
        return Promise.reject({
          ...err,
          error: error.message,
          requestNotSent: true,
        })
      }

      if (error instanceof DOMException) {
        return Promise.reject({
          ...err,
          error:
            error.code === 20
              ? CANCELLED_BY_USER
              : JSON.stringify(error).toString(),
          ...sessionFailureOf(execution),
        })
      }

      eventBus.publish(EventType.MSG_CONNECTION_ERROR, genericErrorPayload)

      return Promise.reject(genericErrorPayload)
    }

    try {
      // Fence all completions, body reads and failures against the login that
      // launched the request before publishing or returning anything.
      ensureCurrentSession()
      if (
        response.ok ||
        response.status === 400 ||
        (response.ok && response.status === 403)
      ) {
        let responseText
        try {
          responseText = await response.text()
        } catch (error) {
          ensureCurrentSession()
          if (error instanceof DOMException && error.name === "AbortError") {
            return Promise.reject({
              position: -1,
              query,
              type: Type.ERROR,
              error: CANCELLED_BY_USER,
            })
          }
          return Promise.reject({
            error: `Failed to read response: ${error}`,
            type: Type.ERROR,
          })
        }
        ensureCurrentSession()
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
        ensureCurrentSession()

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

        if (data.error !== undefined) {
          return Promise.reject({
            ...data,
            type: Type.ERROR,
          })
        }

        if (data.notice !== undefined) {
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
        const currentAuthorization = this.currentAuthorization()
        // Reject an older request without logging out a session using a
        // different bearer. A refresh can also return the same bearer value.
        if (
          session.isCurrent() &&
          authorizationAtFetch === currentAuthorization
        ) {
          eventBus.publish(EventType.MSG_CONNECTION_UNAUTHORIZED, errorPayload)
        }
      }

      if (response.status === 403) {
        let errorText
        try {
          errorText = (await response.text()).trim()
        } catch (error) {
          ensureCurrentSession()
          if (error instanceof DOMException && error.name === "AbortError") {
            return Promise.reject({
              position: -1,
              query,
              type: Type.ERROR,
              error: CANCELLED_BY_USER,
            })
          }
          throw error
        }
        ensureCurrentSession()
        if (errorText.startsWith("{")) {
          const data = JSON.parse(errorText) as ErrorResult
          errorPayload.error = data.error
        } else {
          errorPayload.error = errorText
        }
        eventBus.publish(EventType.MSG_CONNECTION_FORBIDDEN, errorPayload)
      }

      ensureCurrentSession()
      return Promise.reject(errorPayload)
    } catch (error) {
      if (endedFor(session, error)) {
        return Promise.reject(sessionEndedResult())
      }
      throw error
    } finally {
      this.removeController(queryId)
    }
  }

  async validateQuery(
    query: string,
    signal?: AbortSignal,
  ): Promise<ValidateQueryResult> {
    const session = authSessionState.capture()
    await this.ensureFreshToken(signal ?? new AbortController().signal)
    if (endedFor(session)) throw new SessionEndedError()
    const response = await fetch(
      `api/v1/sql/validate?${Client.encodeParams({ query })}`,
      {
        headers: this.requestHeaders(),
        signal,
      },
    )
    if (endedFor(session)) throw new SessionEndedError()
    if (response.ok || response.status === 400 || response.status === 403) {
      const result = (await response.json()) as
        | ValidateQuerySuccessResult
        | ValidateQueryErrorResult
      if (endedFor(session)) throw new SessionEndedError()
      return result
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
    const session = authSessionState.capture()
    await this.ensureFreshToken(new AbortController().signal)
    if (endedFor(session)) throw new SessionEndedError()
    const response = await fetch(
      `chk?${Client.encodeParams({
        f: "json",
        j: name,
        version: API_VERSION,
      })}`,
      { headers: this.requestHeaders() },
    )
    const result = (await response.json()) as FileCheckResponse
    if (endedFor(session)) throw new SessionEndedError()
    return result
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
    const session = authSessionState.capture()
    await this.ensureFreshToken(new AbortController().signal)
    if (endedFor(session)) throw new SessionEndedError()
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
      const headers = this.requestHeaders()
      Object.keys(headers).forEach((key) => {
        request.setRequestHeader(key, headers[key])
      })
      request.upload.addEventListener("progress", (e) => {
        const percent_completed = (e.loaded / e.total) * 100
        onProgress(percent_completed)
      })
      request.onload = (_e) => {
        if (endedFor(session)) {
          reject(new SessionEndedError())
          return
        }
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
    const session = authSessionState.capture()
    await this.ensureFreshToken(new AbortController().signal)
    if (endedFor(session)) throw new SessionEndedError()
    const { version, ...prefs } = preferences
    const response: Response = await fetch(`settings?version=${version}`, {
      method: "PUT",
      headers: this.requestHeaders(),
      body: JSON.stringify(prefs),
    })
    if (endedFor(session)) throw new SessionEndedError()
    if (!response.ok) {
      let errorMessage: string
      try {
        errorMessage = await extractErrorMessage(response)
      } catch (e) {
        errorMessage = response.statusText
      }
      if (endedFor(session)) throw new SessionEndedError()
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
