import { isServerError } from "../../utils"
import { TelemetryConfigShape } from "../../store/Telemetry/types"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import {
  AuthRefreshUnavailableError,
  endedFor,
  sessionFailureOf,
  SessionEndedError,
  SESSION_ENDED_MESSAGE,
} from "../../modules/OAuth2/session"
import { CANCELLED_BY_USER } from "./cancellation"
import type { AuthSession } from "../../modules/OAuth2/authSessionState"
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
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { getBearerAuthorization } from "../../modules/OAuth2/utils"
import {
  awaitRefresh,
  isRefreshable,
  RefreshTokenMethod,
  RefreshableAuthPayload,
  REFRESH_WAIT_TIMEOUT_MS,
  tokenRefresh,
} from "./tokenRefresh"

export type QueryId = number

type RequestExecution = { requestNotSent: boolean }

// Catalog lookups read metadata only. Interrupting them needs no outcome check.
const BACKGROUND_READ: Options = { background: true }

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
  private _controllers = new Map<
    QueryId,
    {
      controller: AbortController
      execution: RequestExecution
      background: boolean
    }
  >()
  // The value distinguishes a sent write from one still waiting for renewal.
  private _writeControllers = new Map<AbortController, boolean>()
  // Sent writes that outlived the session that started them. They no longer
  // belong to any login, but leaving the page would still cancel them.
  private _endedSessionWrites = new Set<AbortController>()
  private _endedSessionWriteListeners = new Set<(count: number) => void>()
  private _nextQueryId: QueryId = 1
  private _activeQueryId: QueryId | null = null
  // The server closes the session of a request whose bearer it rejects, and
  // the Enterprise server deletes the qdb_session cookie with every 401.
  // Downloads authenticate only with that cookie (an iframe GET to `exp`), so
  // after a 401 from any endpoint, the next SQL request of the same SSO login
  // asks the server to open a new session. One request asks at a time, so
  // queries sent together don't open sessions that immediately replace each
  // other.
  private _lostCookieSession?: { sessionId: number; reopening: boolean }
  private commonHeaders: Record<string, string> = {}
  refreshTokenMethod?: RefreshTokenMethod

  setCommonHeaders(headers: Record<string, string>) {
    this.commonHeaders = headers
  }

  resetCredentials() {
    this.setCommonHeaders({})
    this.refreshTokenMethod = undefined
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

  // Before a request a person retries, such as the startup check behind the
  // recovery view's Retry: it renews the session instead of failing at once
  // during the backoff. A renewal still in flight is waited for, not repeated:
  // a second one could spend a refresh token that the first has rotated.
  async prepareRenewalRetry() {
    tokenRefresh.syncSession()
    const inFlight = tokenRefresh.hardDeadline
    if (inFlight) await inFlight
    tokenRefresh.allowRetry()
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
      const request = this._controllers.get(queryId)
      if (request) {
        request.controller.abort()
        this._controllers.delete(queryId)
      }
      if (this._activeQueryId === queryId) {
        this._activeQueryId = null
      }
      return
    }
    this._controllers.forEach(({ controller }) => controller.abort())
    this._controllers.clear()
    this._writeControllers.forEach((_, controller) => controller.abort())
    this._writeControllers.clear()
    this._activeQueryId = null
  }

  // Ending the session cancels queries and writes still waiting for renewal,
  // but lets writes that are being sent finish: aborting a CSV upload
  // mid-stream can leave a partially imported table. Their results are
  // rejected as session-ended, and they no longer count as the next login's
  // activity. Until they settle, they are reported as ended-session writes.
  abortForSessionEnd = () => {
    this._controllers.forEach(({ controller }) => controller.abort())
    this._controllers.clear()
    const endedSessionWrites = this._endedSessionWrites.size
    this._writeControllers.forEach((sent, controller) => {
      if (sent) this._endedSessionWrites.add(controller)
      else controller.abort()
    })
    this._writeControllers.clear()
    this._activeQueryId = null
    if (this._endedSessionWrites.size !== endedSessionWrites) {
      this.notifyEndedSessionWrites()
    }
  }

  // Uploads and settings saves of ended sessions that are still being sent.
  endedSessionWriteCount = () => this._endedSessionWrites.size

  onEndedSessionWritesChange = (listener: (count: number) => void) => {
    this._endedSessionWriteListeners.add(listener)
    return () => {
      this._endedSessionWriteListeners.delete(listener)
    }
  }

  private notifyEndedSessionWrites() {
    const count = this._endedSessionWrites.size
    this._endedSessionWriteListeners.forEach((listener) => listener(count))
  }

  private settleWrite(controller: AbortController) {
    this._writeControllers.delete(controller)
    if (this._endedSessionWrites.delete(controller)) {
      this.notifyEndedSessionWrites()
    }
  }

  // Background reads are cancelled with the session without asking: only
  // statements the user ran and writes make ending the session disruptive.
  hasActiveRequests = () => {
    for (const { background } of this._controllers.values()) {
      if (!background) return true
    }
    return this._writeControllers.size > 0
  }

  // Refresh waiters and SQL rejected with 401 have definitively not executed,
  // and background reads change nothing. Only warn about uncertainty if a user
  // statement or write was actually sent.
  hasSentRequests = () => {
    for (const { execution, background } of this._controllers.values()) {
      if (!background && !execution.requestNotSent) return true
    }
    for (const sent of this._writeControllers.values()) {
      if (sent) return true
    }
    return false
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
    const execution = { requestNotSent: true }
    this._controllers.set(queryId, {
      controller,
      execution,
      background: options?.background === true,
    })

    const promise = this._executeQueryRaw(
      query,
      options,
      controller,
      queryId,
      execution,
      lifecycle,
    )

    if (options?.cancellable) {
      this._activeQueryId = queryId
      return { promise, queryId }
    }

    return promise
  }

  private ensureRequestAllowed(session: AuthSession, signal: AbortSignal) {
    if (!session.isCurrent()) throw new SessionEndedError()
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    tokenRefresh.ensureUsableToken()
  }

  private refreshBeforeRequest(
    signal: AbortSignal,
    lifecycle?: QueryLifecycle,
    waitForStalledRenewal = false,
  ): { waited: false } | { waited: true; ready: Promise<void> } {
    tokenRefresh.syncSession()
    // A statement run again after the backoff retries a failed renewal, as
    // the renewal warning says. While the failed renewal's request is still
    // in flight, it waits for that request to settle or be given up, and then
    // renews, instead of failing at once without a renewal.
    const stalled = waitForStalledRenewal
      ? tokenRefresh.stalledRenewal()
      : undefined
    if (stalled) {
      lifecycle?.onRefreshWait?.(stalled.remainingMs)
      return {
        waited: true,
        ready: awaitRefresh(stalled.settled, signal).then(() => {
          const renewal = this.refreshBeforeRequest(signal, lifecycle)
          return renewal.waited ? renewal.ready : undefined
        }),
      }
    }
    const payload = authSessionState.getAuthPayload()
    if (isRefreshable(payload) && tokenRefresh.needsRefresh(payload)) {
      this.startRefresh(payload)
    }
    const deadline = tokenRefresh.softDeadline
    if (!deadline) return { waited: false }
    lifecycle?.onRefreshWait?.(REFRESH_WAIT_TIMEOUT_MS)
    return { waited: true, ready: awaitRefresh(deadline, signal) }
  }

  private async prepareRequest(signal = new AbortController().signal) {
    const session = authSessionState.capture()
    const refresh = this.refreshBeforeRequest(signal)
    if (refresh.waited) await refresh.ready
    this.ensureRequestAllowed(session, signal)
    return session
  }

  // Validation, CSV checks, uploads and settings saves send the cookie too, so
  // their 401 closes the session as well. The bearer may be renewed before any
  // SQL request is rejected, so record the loss whichever request saw it.
  private noteCookieSessionLost(session: AuthSession) {
    if (session.isCurrent() && authSessionState.isSSOAuthenticated()) {
      this._lostCookieSession = {
        sessionId: authSessionState.getSessionId(),
        reopening: false,
      }
    }
  }

  // AuthProvider opens the cookie session of an SSO sign-in with a request of
  // its own. If the server did not authorize it, no session was opened, and
  // the console may renew its bearer before any SQL request is rejected: the
  // next SQL request of this login asks for one, as after any other 401.
  noteCookieSessionNotOpened(session: AuthSession) {
    this.noteCookieSessionLost(session)
  }

  private claimCookieSessionReopen() {
    const lost = this._lostCookieSession
    if (
      !lost ||
      lost.reopening ||
      lost.sessionId !== authSessionState.getSessionId() ||
      !authSessionState.isSSOAuthenticated()
    )
      return undefined
    lost.reopening = true
    return lost
  }

  private async fetchExec(
    payload: Record<string, string | number | boolean | undefined>,
    init: RequestInit,
    session: AuthSession,
  ) {
    const reopen = this.claimCookieSessionReopen()
    const params = reopen ? { ...payload, session: true } : payload
    let response: Response
    try {
      response = await fetch(`exec?${Client.encodeParams(params)}`, init)
    } catch (error) {
      if (reopen) reopen.reopening = false
      throw error
    }
    if (response.status === 401) {
      this.noteCookieSessionLost(session)
    } else if (reopen) {
      // The server opens the session once it has authorized the request,
      // even if the SQL then fails. Other answers leave it for a later request.
      if (!response.ok && response.status !== 400) reopen.reopening = false
      else if (this._lostCookieSession === reopen)
        this._lostCookieSession = undefined
    }
    return response
  }

  private async sendQuery(
    payload: Record<string, string | number | boolean | undefined>,
    signal: AbortSignal,
    session: AuthSession,
    execution: RequestExecution,
    lifecycle: QueryLifecycle | undefined,
    {
      refreshAuth = true,
      background = false,
    }: Pick<Options, "refreshAuth" | "background">,
  ) {
    const originalPayload = authSessionState.getAuthPayload()
    if (!refreshAuth && !tokenRefresh.canSendWithoutRefresh())
      throw new AuthRefreshUnavailableError()
    // Only statements the user runs wait for a stalled renewal: background
    // reads fail at once, and are read again later.
    const refresh = refreshAuth
      ? this.refreshBeforeRequest(signal, lifecycle, !background)
      : { waited: false as const }
    if (refresh.waited) await refresh.ready
    // After a 401, wait for the renewal no longer than before the first fetch.
    // The refresh itself still runs to its network deadline, so a late rotated
    // token is installed for later requests.
    const waitForRenewal = async () => {
      const deadline = tokenRefresh.softDeadline
      if (!deadline) return
      lifecycle?.onRefreshWait?.(REFRESH_WAIT_TIMEOUT_MS)
      await awaitRefresh(deadline, signal)
    }
    const ensureCanSend = () => this.ensureRequestAllowed(session, signal)
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
      const response = await this.fetchExec(
        payload,
        { signal, headers },
        session,
      )
      // Authentication/authorization rejection executed no SQL. Record that
      // before publishing connection events, which may synchronously log out.
      // Preserve it until another SQL attempt is sent.
      if (response.status === 401 || response.status === 403)
        execution.requestNotSent = true
      return response
    }
    const payloadAtFetch = authSessionState.getAuthPayload()
    let response = await send()
    if (response.status === 401 && originalPayload) {
      // Non-interactive work must neither refresh nor end the user's login.
      if (!refreshAuth) throw new AuthRefreshUnavailableError()
      if (!session.isCurrent()) throw new SessionEndedError()
      const currentPayload = authSessionState.getAuthPayload()
      const currentAuthorization = this.currentAuthorization()
      let waitForRefresh = !!tokenRefresh.softDeadline
      if (!waitForRefresh) {
        if (
          currentAuthorization &&
          currentAuthorization !== authorizationAtFetch
        ) {
          // A 401 executed no SQL. Resend at most once with an already-rotated bearer.
          response = await send()
        } else if (
          isRefreshable(currentPayload) &&
          authSessionState.hasRefreshFailed() &&
          (tokenRefresh.inBackoff() || refresh.waited)
        ) {
          throw new AuthRefreshUnavailableError()
        } else if (
          !refresh.waited &&
          isRefreshable(currentPayload) &&
          payloadAtFetch === currentPayload &&
          authorizationAtFetch === currentAuthorization &&
          this.refreshTokenMethod
        ) {
          // Server-side 401s bypass clock-skew/success throttling. Never
          // cancel an ongoing rotating refresh just because SQL rejected its bearer.
          this.startRefresh(currentPayload)
          waitForRefresh = true
        }
      }
      if (waitForRefresh) {
        await waitForRenewal()
        ensureCanSend()
        if (authSessionState.hasRefreshFailed())
          throw new AuthRefreshUnavailableError()
        if (
          this.currentAuthorization() !== authorizationAtFetch ||
          authSessionState.getAuthPayload() !== payloadAtFetch
        )
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
    execution: RequestExecution,
    lifecycle?: QueryLifecycle,
  ): Promise<QueryRawResult> {
    const {
      cancellable: _,
      background = false,
      refreshAuth = true,
      ...queryOptions
    } = options ?? {}
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
    const ensureCurrentSession = () => {
      if (!session.isCurrent()) throw new SessionEndedError()
    }
    const sessionEndedResult = (): ErrorResult => ({
      position: -1,
      query,
      type: Type.ERROR,
      error: SESSION_ENDED_MESSAGE,
      sessionEnded: true,
      ...sessionFailureOf(execution),
    })

    try {
      const sent = await this.sendQuery(
        payload,
        controller.signal,
        session,
        execution,
        lifecycle,
        { refreshAuth, background },
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
        connectionError: true,
      }

      if (endedFor(session, error)) {
        return Promise.reject(sessionEndedResult())
      }

      if (error instanceof AuthRefreshUnavailableError) {
        return Promise.reject({
          ...err,
          error: error.message,
          authRefreshUnavailable: true,
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

      const errorPayload: Record<string, string | number | boolean> = {
        status: response.status,
        error: response.statusText,
      }

      if (isServerError(response)) {
        errorPayload.error = `QuestDB is not reachable [${response.status}]`
        errorPayload.position = -1
        errorPayload.query = query
        errorPayload.type = Type.ERROR
        errorPayload.connectionError = true
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
    const session = await this.prepareRequest(signal)
    this.ensureRequestAllowed(session, signal ?? new AbortController().signal)
    const response = await fetch(
      `api/v1/sql/validate?${Client.encodeParams({ query })}`,
      {
        headers: this.requestHeaders(),
        signal,
      },
    )
    if (response.status === 401) this.noteCookieSessionLost(session)
    if (!session.isCurrent()) throw new SessionEndedError()
    if (response.ok || response.status === 400 || response.status === 403) {
      const result = (await response.json()) as
        | ValidateQuerySuccessResult
        | ValidateQueryErrorResult
      if (!session.isCurrent()) throw new SessionEndedError()
      return result
    }

    return Promise.reject({
      status: response.status,
      statusText: response.statusText,
    })
  }

  async showTables(): Promise<QueryResult<Table>> {
    const response = await this.queryCatalog<Table>(
      "tables();",
      BACKGROUND_READ,
    )

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
    return await this.query<Permission>(
      `SHOW PERMISSIONS '${user}';`,
      BACKGROUND_READ,
    )
  }

  async showColumns(table: string): Promise<QueryResult<Column>> {
    return await this.query<Column>(
      `SHOW COLUMNS FROM '${table}';`,
      BACKGROUND_READ,
    )
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
      BACKGROUND_READ,
    )
  }

  async getTableDetails(table: string): Promise<QueryResult<Table>> {
    return await this.queryCatalog<Table>(
      `tables() where table_name = '${escapeSqlLiteral(table)}';`,
      BACKGROUND_READ,
    )
  }

  async showMaterializedViews(): Promise<QueryResult<MaterializedView>> {
    return await this.queryCatalog<MaterializedView>(
      "materialized_views()",
      BACKGROUND_READ,
    )
  }

  async showViews(): Promise<QueryResult<View>> {
    return await this.query<View>("views();", BACKGROUND_READ)
  }

  async showLiveViews(): Promise<QueryResult<LiveView>> {
    return await this.queryCatalog<LiveView>("live_views();", BACKGROUND_READ)
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
    const result = await this.query<{ ddl: string }>(sql, BACKGROUND_READ)
    if (result.type === Type.DQL) {
      result.data = result.data.map((row) => ({
        ...row,
        ddl: row.ddl.replace(/\n{2,}/g, "\n"),
      }))
    }
    return result
  }

  async checkCSVFile(name: string): Promise<FileCheckResponse> {
    const session = await this.prepareRequest()
    if (!session.isCurrent()) throw new SessionEndedError()
    const response = await fetch(
      `chk?${Client.encodeParams({
        f: "json",
        j: name,
        version: API_VERSION,
      })}`,
      { headers: this.requestHeaders() },
    )
    if (response.status === 401) this.noteCookieSessionLost(session)
    const result = (await response.json()) as FileCheckResponse
    if (!session.isCurrent()) throw new SessionEndedError()
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
    const controller = new AbortController()
    this._writeControllers.set(controller, false)
    let removeAbortListener: (() => void) | undefined
    const session = authSessionState.capture()
    try {
      await this.prepareRequest(controller.signal)
      this.ensureRequestAllowed(session, controller.signal)
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

      return await new Promise<UploadResult>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open("POST", `imp?${new URLSearchParams(params)}`)
        const headers = this.requestHeaders()
        Object.keys(headers).forEach((key) => {
          request.setRequestHeader(key, headers[key])
        })
        request.upload.addEventListener("progress", (e) => {
          if (!session.isCurrent() || controller.signal.aborted) return
          const percent_completed = (e.loaded / e.total) * 100
          onProgress(percent_completed)
        })
        const rejectRequest = () => {
          reject(
            session.isCurrent()
              ? { status: request.status, statusText: request.statusText }
              : new SessionEndedError(),
          )
        }
        request.onload = () => {
          if (request.status === 401) this.noteCookieSessionLost(session)
          if (!session.isCurrent() || controller.signal.aborted) {
            rejectRequest()
            return
          }
          if (request.status === 200) {
            try {
              resolve(JSON.parse(request.response as string) as UploadResult)
            } catch (error) {
              reject(error)
            }
          } else {
            rejectRequest()
          }
        }
        request.onerror = rejectRequest
        request.onabort = rejectRequest
        request.ontimeout = rejectRequest
        const abort = () => {
          request.abort()
          rejectRequest()
        }
        controller.signal.addEventListener("abort", abort, { once: true })
        removeAbortListener = () =>
          controller.signal.removeEventListener("abort", abort)
        this._writeControllers.set(controller, true)
        request.send(formData)
      })
    } catch (error) {
      if (endedFor(session, error)) throw new SessionEndedError()
      throw error
    } finally {
      removeAbortListener?.()
      this.settleWrite(controller)
    }
  }

  async savePreferences(
    preferences: Preferences,
  ): Promise<{ status: number; message?: string; success: boolean }> {
    const controller = new AbortController()
    this._writeControllers.set(controller, false)
    const session = authSessionState.capture()
    try {
      await this.prepareRequest(controller.signal)
      this.ensureRequestAllowed(session, controller.signal)
      const { version, ...prefs } = preferences
      this._writeControllers.set(controller, true)
      const response: Response = await fetch(`settings?version=${version}`, {
        method: "PUT",
        signal: controller.signal,
        headers: this.requestHeaders(),
        body: JSON.stringify(prefs),
      })
      if (response.status === 401) this.noteCookieSessionLost(session)
      if (!session.isCurrent()) throw new SessionEndedError()
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError")
      if (!response.ok) {
        let errorMessage: string
        try {
          errorMessage = await extractErrorMessage(response)
        } catch (error) {
          if (controller.signal.aborted) throw error
          errorMessage = response.statusText
        }
        if (!session.isCurrent()) throw new SessionEndedError()
        if (controller.signal.aborted)
          throw new DOMException("Aborted", "AbortError")
        return {
          status: response.status,
          message: errorMessage,
          success: false,
        }
      }
      return { status: response.status, success: true }
    } catch (error) {
      if (endedFor(session, error)) throw new SessionEndedError()
      throw error
    } finally {
      this.settleWrite(controller)
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

  async getNews({ category }: { category: string }) {
    try {
      const response: Response = await fetch(
        `https://cloud.questdb.com/api/news?category=${category}`,
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
