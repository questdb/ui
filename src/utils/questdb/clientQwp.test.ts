import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QWP_STATUS } from "@questdb/browser-client"
import { Client } from "./client"
import { CANCELLED_BY_USER } from "./cancellation"
import { Type } from "./types"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type { AuthPayload } from "../../modules/OAuth2/types"
import {
  QwpConnectionLostError,
  QwpQueryFailure,
  type QwpQueryOutcome,
  type QwpQueryRequest,
  type QwpQueryTransport,
} from "./qwp/transport"

const stats = {
  compileNanos: BigInt(1_000),
  executeNanos: BigInt(5_000),
  countNanos: BigInt(0),
  clientWaitNanos: BigInt(0),
  jitCompiled: true,
}

const transport = (
  execute: (request: QwpQueryRequest) => Promise<QwpQueryOutcome>,
) => {
  const fake = {
    execute: vi.fn((request: QwpQueryRequest) => {
      request.onSend()
      return execute(request)
    }),
    noteHttpSuccess: vi.fn(),
    reset: vi.fn(),
  }
  return fake satisfies QwpQueryTransport
}

const clientWith = (qwp: QwpQueryTransport) => {
  const client = new Client()
  client.setQwpTransport(qwp)
  return client
}

const execResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200 })

const requestedUrl = (fetchMock: { mock: { calls: unknown[][] } }) =>
  new URL(String(fetchMock.mock.calls[0][0]), "http://localhost/")

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  authSessionState.endSession()
})

describe("Client over QWP", () => {
  it("resolves a result as /exec answers it", async () => {
    const qwp = transport(() =>
      Promise.resolve({
        kind: "result",
        columns: [{ name: "x", type: "LONG" }],
        dataset: [["1"], ["2"]],
        rowCount: 10,
        stats,
      }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await clientWith(qwp).queryRaw("select x", {
      limit: "3,4",
      explain: true,
    })

    expect(result).toMatchObject({
      query: "select x",
      columns: [{ name: "x", type: "LONG" }],
      dataset: [["1"], ["2"]],
      count: 10,
      timestamp: -1,
      explain: { jitCompiled: true },
      timings: { compiler: 1_000, execute: 4_000, count: 0, authentication: 0 },
      type: Type.DQL,
    })
    expect(qwp.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: "select x",
        window: { skipRows: 2, maxRows: 2 },
        countRows: true,
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports the query plan's JIT use only when it was asked for", async () => {
    const qwp = transport(() =>
      Promise.resolve({
        kind: "result",
        columns: [],
        dataset: [],
        rowCount: 0,
        stats,
      }),
    )
    const result = await clientWith(qwp).queryRaw("select 1")
    expect(result).not.toHaveProperty("explain")
  })

  it.each([
    [9, Type.DDL],
    [2, Type.DML],
    [10, Type.DML],
    [14, Type.DML],
  ])("confirms statement type %d as %s", async (operationType, type) => {
    const qwp = transport(() =>
      Promise.resolve({ kind: "statement", operationType }),
    )
    await expect(clientWith(qwp).queryRaw("create table t")).resolves.toEqual({
      query: "create table t",
      type,
    })
  })

  it("reports an empty query as /exec does", async () => {
    const qwp = transport(() =>
      Promise.resolve({ kind: "statement", operationType: 40 }),
    )
    await expect(clientWith(qwp).queryRaw("-- c")).resolves.toMatchObject({
      notice: "empty query",
      query: "-- c",
      type: Type.NOTICE,
    })
  })

  it("rejects with the error and its position in the query", async () => {
    const qwp = transport(() =>
      Promise.reject(
        new QwpQueryFailure(QWP_STATUS.PARSE_ERROR, "Invalid column: foo", 7),
      ),
    )
    const publish = vi.spyOn(eventBus, "publish")

    await expect(
      clientWith(qwp).queryRaw("select foo from t"),
    ).rejects.toMatchObject({
      query: "select foo from t",
      error: "Invalid column: foo",
      position: 7,
      type: Type.ERROR,
    })
    expect(publish).toHaveBeenCalledWith(EventType.MSG_CONNECTION_OK)
  })

  it("marks no position the server did not name", async () => {
    const qwp = transport(() =>
      Promise.reject(new QwpQueryFailure(QWP_STATUS.LIMIT_EXCEEDED, "timeout")),
    )
    await expect(clientWith(qwp).queryRaw("select 1")).rejects.toMatchObject({
      error: "timeout",
      position: -1,
    })
  })

  it("reports an authorization failure as /exec's 403", async () => {
    const qwp = transport(() =>
      Promise.reject(
        new QwpQueryFailure(QWP_STATUS.SECURITY_ERROR, "Access denied"),
      ),
    )
    const publish = vi.spyOn(eventBus, "publish")

    await expect(clientWith(qwp).queryRaw("select 1")).rejects.toEqual({
      status: 403,
      error: "Access denied",
    })
    expect(publish).toHaveBeenCalledWith(EventType.MSG_CONNECTION_FORBIDDEN, {
      status: 403,
      error: "Access denied",
    })
  })

  it("rejects a cancelled query at once", async () => {
    const qwp = transport(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        }),
    )
    const client = clientWith(qwp)
    const { promise, queryId } = client.queryRaw("select 1", {
      cancellable: true,
    })
    await vi.waitFor(() => expect(qwp.execute).toHaveBeenCalled())
    expect(client.hasSentRequests()).toBe(true)

    client.abort(queryId)

    await expect(promise).rejects.toMatchObject({
      error: CANCELLED_BY_USER,
      position: -1,
      type: Type.ERROR,
    })
    expect(client.hasActiveRequests()).toBe(false)
  })

  it("reports a lost connection as a connection error", async () => {
    const qwp = transport(() =>
      Promise.reject(new QwpConnectionLostError(new Error("closed"))),
    )
    const publish = vi.spyOn(eventBus, "publish")

    await expect(clientWith(qwp).queryRaw("select 1")).rejects.toMatchObject({
      error: "An error occurred, please try again",
      connectionError: true,
    })
    expect(publish).toHaveBeenCalledWith(
      EventType.MSG_CONNECTION_ERROR,
      expect.objectContaining({ connectionError: true }),
    )
  })

  it("sends a request QWP cannot serve over HTTP", async () => {
    const qwp = transport(() =>
      Promise.resolve({ kind: "unavailable", reopenSession: false }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        execResponse({ query: "select 1", columns: [], dataset: [], count: 0 }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(clientWith(qwp).queryRaw("select 1")).resolves.toMatchObject({
      type: Type.DQL,
    })
    expect(requestedUrl(fetchMock).searchParams.has("session")).toBe(false)
    expect(qwp.noteHttpSuccess).not.toHaveBeenCalled()
  })

  it("reopens the cookie session over HTTP after a failed connection", async () => {
    authSessionState.markNonSSOAuthenticated()
    const qwp = transport(() =>
      Promise.resolve({ kind: "unavailable", reopenSession: true }),
    )
    const fetchMock = vi.fn().mockResolvedValue(execResponse({ ddl: "OK" }))
    vi.stubGlobal("fetch", fetchMock)

    await clientWith(qwp).queryRaw("create table t")

    expect(requestedUrl(fetchMock).searchParams.get("session")).toBe("true")
    expect(qwp.noteHttpSuccess).toHaveBeenCalled()
  })

  it("asks no session of a server without authentication", async () => {
    const qwp = transport(() =>
      Promise.resolve({ kind: "unavailable", reopenSession: true }),
    )
    const fetchMock = vi.fn().mockResolvedValue(execResponse({ ddl: "OK" }))
    vi.stubGlobal("fetch", fetchMock)

    await clientWith(qwp).queryRaw("create table t")

    expect(requestedUrl(fetchMock).searchParams.has("session")).toBe(false)
    expect(qwp.noteHttpSuccess).toHaveBeenCalled()
  })

  it("does not count a failed HTTP request as proof that HTTP works", async () => {
    authSessionState.markNonSSOAuthenticated()
    const qwp = transport(() =>
      Promise.resolve({ kind: "unavailable", reopenSession: true }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 502 })),
    )

    await expect(clientWith(qwp).queryRaw("select 1")).rejects.toBeDefined()
    expect(qwp.noteHttpSuccess).not.toHaveBeenCalled()
  })

  it("selects columns over HTTP, which /exec does", async () => {
    const qwp = transport(() => Promise.reject(new Error("unexpected")))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        execResponse({ query: "select 1", columns: [], dataset: [], count: 0 }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await clientWith(qwp).queryRaw("select 1", { cols: '"a"' })

    expect(qwp.execute).not.toHaveBeenCalled()
    expect(requestedUrl(fetchMock).searchParams.get("cols")).toBe('"a"')
  })

  it("reopens a lost cookie session with an HTTP request", async () => {
    authSessionState.setAuthPayload({
      access_token: "token",
      token_type: "Bearer",
    } as AuthPayload)
    const qwp = transport(() => Promise.reject(new Error("unexpected")))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        execResponse({ query: "select 1", columns: [], dataset: [], count: 0 }),
      )
    vi.stubGlobal("fetch", fetchMock)
    const client = clientWith(qwp)
    client.noteCookieSessionNotOpened(authSessionState.capture())

    await client.queryRaw("select 1")

    expect(qwp.execute).not.toHaveBeenCalled()
    expect(requestedUrl(fetchMock).searchParams.get("session")).toBe("true")
  })

  it("ends a query with the session that started it", async () => {
    authSessionState.markNonSSOAuthenticated()
    const qwp = transport(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        }),
    )
    const client = clientWith(qwp)
    const result = client.queryRaw("select 1")
    await vi.waitFor(() => expect(qwp.execute).toHaveBeenCalled())

    client.abortForSessionEnd()
    authSessionState.endSession()

    await expect(result).rejects.toMatchObject({ sessionEnded: true })
    expect(qwp.reset).toHaveBeenCalled()
  })

  it("does not send non-interactive work that would need a renewal", async () => {
    authSessionState.setAuthPayload({
      access_token: "stale",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 1_000).toString(),
    } as AuthPayload)
    const qwp = transport(() => Promise.reject(new Error("unexpected")))

    await expect(
      clientWith(qwp).queryRaw("select 1", { refreshAuth: false }),
    ).rejects.toMatchObject({
      authRefreshUnavailable: true,
      requestNotSent: true,
    })
    expect(qwp.execute).not.toHaveBeenCalled()
  })
})
