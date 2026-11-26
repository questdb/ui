import {
  QWP_EGRESS_CAPABILITY,
  QwpEgressQueryAbandonedError,
  QwpEgressQueryError,
  QwpEgressRowWindowUnsupportedError,
  type QwpEgressQuery,
  type QwpEgressSession,
  type QwpQueryStats,
} from "@questdb/browser-client"
import type { ColumnDefinition, DatasetType } from "../types"
import { QwpUnsupportedColumnError } from "./format"
import { QwpResultCollector, type RowWindow } from "./result"
import {
  QwpSessionPool,
  type QwpLease,
  type QwpSessionFactory,
} from "./sessionPool"

export type QwpQueryRequest = {
  sql: string
  window: RowWindow
  countRows: boolean
  signal: AbortSignal
  /** Called before the request may reach the server. */
  onSend: () => void
}

export type QwpQueryOutcome =
  | {
      kind: "result"
      columns: ColumnDefinition[]
      dataset: DatasetType[]
      /** The rows of the whole result, whatever the row window streamed. */
      rowCount: number
      stats?: QwpQueryStats
    }
  | { kind: "statement"; operationType: number; stats?: QwpQueryStats }
  /**
   * Nothing reached the server, or the console cannot render the result:
   * run the request over HTTP. After a failed QWP connection, the request
   * reopens the cookie session that authenticates QWP connections, and
   * reports its success with `noteHttpSuccess()`.
   */
  | { kind: "unavailable"; reopenSession: boolean }

/** The server ended the query with an error. */
export class QwpQueryFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly position?: number,
  ) {
    super(message)
    this.name = "QwpQueryFailure"
  }
}

/** The connection was lost after the request was sent: it may have run. */
export class QwpConnectionLostError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : "QWP connection lost")
    this.name = "QwpConnectionLostError"
  }
}

/** The server does not offer what the console needs from QWP. */
class QwpCapabilityError extends Error {
  constructor() {
    super("QWP endpoint does not advertise QUERY_DETAILS")
    this.name = "QwpCapabilityError"
  }
}

// Result types QWP cannot carry yet, such as INTERVAL. `/exec` renders them.
const UNSUPPORTED_TYPE = /^QWP egress: unsupported (column|array element) type/

// QWP connections that may fail, each followed by an HTTP request that
// reopened the cookie session, before QWP is given up for HTTP.
const MAX_CONNECT_FAILURES = 2

const abortError = () => new DOMException("Aborted", "AbortError")

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError"

const raceAbort = <T>(promise: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => reject(abortError())
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })

const hasQueryDetails = (session: QwpEgressSession) =>
  ((session.serverInfo?.capabilities ?? 0) &
    QWP_EGRESS_CAPABILITY.QUERY_DETAILS) !==
  0

type State =
  // No connection is known to work: the next request starts a probe.
  | "unknown"
  | "probing"
  | "ready"
  // A connection failed. Requests use HTTP and reopen the cookie session
  // until one succeeds; a stale session cookie fails QWP upgrades.
  | "reopening"
  // QWP does not work here, while HTTP does: a proxy without WebSocket
  // support, or a server without QUERY_DETAILS.
  | "disabled"

export type QwpTransportOptions = {
  maxSessions?: number
  idleTimeoutMs?: number
}

/** What the query client needs from a QWP transport. */
export type QwpQueryTransport = Pick<
  QwpTransport,
  "execute" | "noteHttpSuccess" | "reset"
>

/**
 * Runs console SQL over QWP. Requests that QWP cannot serve resolve as
 * `unavailable`, never after anything was sent, for the caller to send them
 * over HTTP instead.
 *
 * Until a connection has worked, requests go to HTTP while one connection is
 * opened in the background, so a failing WebSocket upgrade never delays a
 * query.
 */
export class QwpTransport {
  private readonly pool: QwpSessionPool
  private state: State = "unknown"
  // Failed connections since one last worked.
  private failures = 0
  private probe?: AbortController

  constructor(
    connect: QwpSessionFactory,
    // As many connections as a browser opens to one HTTP/1.1 origin, which
    // bounded the console's concurrent `/exec` requests.
    { maxSessions = 6, idleTimeoutMs = 60_000 }: QwpTransportOptions = {},
  ) {
    this.pool = new QwpSessionPool(
      async (signal) => {
        const session = await connect(signal)
        if (!hasQueryDetails(session)) {
          void session.close().catch(() => undefined)
          throw new QwpCapabilityError()
        }
        return session
      },
      maxSessions,
      idleTimeoutMs,
    )
  }

  get disabled() {
    return this.state === "disabled"
  }

  async execute(request: QwpQueryRequest): Promise<QwpQueryOutcome> {
    // A pooled session the server has closed rejects the request unsent;
    // retry it once on a new session.
    for (let attempt = 0; attempt < 2; attempt++) {
      const lease = await this.lease(request.signal)
      if (!lease) return this.unavailable()
      try {
        request.onSend()
      } catch (error) {
        lease.release(true)
        throw error
      }
      let query: QwpEgressQuery
      try {
        query = await lease.session.query(request.sql, {
          errorPosition: true,
          stats: true,
          countRows: request.countRows,
          skipRows: request.window.skipRows,
          maxRows: request.window.maxRows,
        })
      } catch (error) {
        lease.release(false)
        if (request.signal.aborted) throw abortError()
        if (error instanceof QwpEgressRowWindowUnsupportedError) {
          this.state = "disabled"
          return this.unavailable()
        }
        continue
      }
      return this.consume(query, lease, request)
    }
    return this.unavailable()
  }

  /**
   * The server answered an HTTP request sent with `reopenSession` after QWP
   * was unavailable, so it is reachable, and the cookie session is current.
   * QWP failing again after that is not transient.
   */
  noteHttpSuccess() {
    if (this.state !== "reopening") return
    if (this.failures < MAX_CONNECT_FAILURES) {
      this.state = "unknown"
      return
    }
    this.state = "disabled"
    console.warn(
      "QWP connections to QuestDB fail while HTTP works. Queries use HTTP from now on.",
    )
  }

  /** Closes every connection: they are authenticated as the ended session. */
  reset() {
    this.probe?.abort()
    this.probe = undefined
    this.pool.reset()
    this.failures = 0
    if (this.state !== "disabled") this.state = "unknown"
  }

  private unavailable(): QwpQueryOutcome {
    return { kind: "unavailable", reopenSession: this.state === "reopening" }
  }

  private async lease(signal: AbortSignal): Promise<QwpLease | undefined> {
    switch (this.state) {
      case "disabled":
      case "probing":
      case "reopening":
        return undefined
      case "unknown":
        this.startProbe()
        return undefined
      case "ready":
        try {
          return await this.pool.acquire(signal)
        } catch (error) {
          if (signal.aborted) throw abortError()
          // A reset closed the connection being opened for this request.
          if (!isAbortError(error)) this.onConnectFailure(error)
          return undefined
        }
    }
  }

  private startProbe() {
    const probe = new AbortController()
    this.probe = probe
    this.state = "probing"
    this.pool.prewarm(probe.signal).then(
      () => {
        if (this.probe !== probe) return
        this.probe = undefined
        this.state = "ready"
        this.failures = 0
      },
      (error: unknown) => {
        if (this.probe !== probe) return
        this.probe = undefined
        this.onConnectFailure(error)
      },
    )
  }

  private onConnectFailure(error: unknown) {
    if (this.state === "disabled") return
    if (error instanceof QwpCapabilityError) {
      this.state = "disabled"
      return
    }
    this.failures++
    this.state = "reopening"
  }

  private async consume(
    query: QwpEgressQuery,
    lease: QwpLease,
    { signal, window }: QwpQueryRequest,
  ): Promise<QwpQueryOutcome> {
    // The session serves the next request once this query has ended on the
    // server, even if its caller has moved on. An abandoned query is drained
    // before the session runs the next one.
    void query.completion.then(
      () => lease.release(true),
      (error: unknown) =>
        lease.release(
          error instanceof QwpEgressQueryError ||
            error instanceof QwpEgressQueryAbandonedError,
        ),
    )
    const collector = new QwpResultCollector()
    const consuming = (async () => {
      for await (const batch of query) collector.add(batch)
      return query.completion
    })()
    consuming.catch(() => undefined)
    const cancel = () => {
      void query.cancel().catch(() => undefined)
    }
    // Aborted while the request was being sent.
    if (signal.aborted) cancel()
    else signal.addEventListener("abort", cancel, { once: true })
    try {
      const completion = await raceAbort(consuming, signal)
      if (completion.kind === "exec-done") {
        return {
          kind: "statement",
          operationType: completion.operationType,
          stats: completion.stats,
        }
      }
      const streamed = Number(completion.totalRows)
      return {
        kind: "result",
        columns: collector.columns,
        dataset: collector.dataset,
        // Without the count, `/exec` reports the rows it stepped through.
        rowCount:
          completion.rowCount !== undefined
            ? Number(completion.rowCount)
            : streamed > 0
              ? window.skipRows + streamed
              : 0,
        stats: completion.stats,
      }
    } catch (error) {
      if (signal.aborted) throw abortError()
      if (
        error instanceof QwpUnsupportedColumnError ||
        (error instanceof QwpEgressQueryError &&
          UNSUPPORTED_TYPE.test(error.message))
      ) {
        // A query whose result cannot be rendered from QWP: nothing it
        // returned was shown, and HTTP renders it.
        cancel()
        return { kind: "unavailable", reopenSession: false }
      }
      if (error instanceof QwpEgressQueryError) {
        throw new QwpQueryFailure(error.status, error.message, error.position)
      }
      throw new QwpConnectionLostError(error)
    } finally {
      signal.removeEventListener("abort", cancel)
    }
  }
}
