import "../../test/stubBrowserGlobals"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "./client"
import { stringifyWithBigInts } from "./serialize"
import { Type } from "./types"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import type { AuthPayload } from "../../modules/OAuth2/types"
import type { QueryRawResult, TableKind } from "./types"

const response = (body: Record<string, unknown>): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  ssoAuthState.clearAuthPayload()
  // The refresh is shared between Client instances, but never between tests.
  Reflect.set(Client, "refreshPromise", null)
  Reflect.set(Client, "refreshRetryCount", 0)
  Reflect.set(Client, "retryRefreshAfter", 0)
  Reflect.set(Client, "retryForAuthPayload", null)
})

const rawDqlResult = (
  columns: Array<{ name: string; type: string }>,
  dataset: Array<Array<string | number | boolean | null>>,
): QueryRawResult => ({
  columns,
  count: dataset.length,
  dataset,
  error: undefined,
  notice: undefined,
  query: "catalog()",
  timings: {
    compiler: 0,
    authentication: 0,
    count: 0,
    execute: 0,
    fetch: 0,
  },
  type: Type.DQL,
})

describe("Client catalog LONG conversion", () => {
  it("converts every LONG column to bigint without changing other columns", () => {
    const raw = rawDqlResult(
      [
        { name: "safe_long", type: "LONG" },
        { name: "max_long", type: "LONG" },
        { name: "min_long", type: "LONG" },
        { name: "nullable_long", type: "LONG" },
        { name: "ratio", type: "DOUBLE" },
        { name: "name", type: "STRING" },
      ],
      [
        [
          "42",
          "9223372036854775807",
          "-9223372036854775807",
          null,
          1.5,
          "trades",
        ],
      ],
    )

    const result = Client.transformQueryRawResult<Record<string, unknown>>(
      raw,
      { convertLongsToBigInt: true },
    )

    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0]).toEqual({
      safe_long: BigInt(42),
      max_long: BigInt("9223372036854775807"),
      min_long: BigInt("-9223372036854775807"),
      nullable_long: null,
      ratio: 1.5,
      name: "trades",
    })
  })

  it("leaves regular query LONG values in their existing wire form", () => {
    const raw = rawDqlResult(
      [{ name: "value", type: "LONG" }],
      [["9007199254740993"]],
    )

    const result = Client.transformQueryRawResult<Record<string, unknown>>(raw)

    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].value).toBe("9007199254740993")
  })

  it("rejects a LONG number that has already lost integer precision", () => {
    const raw = rawDqlResult(
      [{ name: "value", type: "LONG" }],
      [[Number("9007199254740993")]],
    )

    expect(() =>
      Client.transformQueryRawResult(raw, { convertLongsToBigInt: true }),
    ).toThrow("Invalid LONG value for column value")
  })

  it("serializes bigint as a decimal string at a JSON boundary", () => {
    expect(stringifyWithBigInts({ value: BigInt("9223372036854775807") })).toBe(
      '{"value":"9223372036854775807"}',
    )
  })
})

describe("Client queryRaw NOTICE timings", () => {
  it("adds fetch timing when the notice carries server timings", async () => {
    // Given a notice response with the regular query timing fields
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          notice: "partition converted",
          timings: {
            compiler: 1,
            authentication: 2,
            count: 3,
            execute: 4,
          },
        }),
      ),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then NOTICE keeps its fields and receives the measured fetch timing
    expect(result.type).toBe(Type.NOTICE)
    if (result.type !== Type.NOTICE) throw new Error("expected notice")
    expect(result.timings).toMatchObject({
      compiler: 1,
      authentication: 2,
      count: 3,
      execute: 4,
    })
    expect(typeof result.timings?.fetch).toBe("number")
  })

  it("keeps timings absent when the notice has none", async () => {
    // Given a message-only notice response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint applied" })),
    )

    // When the raw query response is mapped
    const result = await new Client().queryRaw("SELECT 1")

    // Then no partial timing object is invented
    expect(result.type).toBe(Type.NOTICE)
    expect(result).not.toHaveProperty("timings")
  })
})

describe("Client token refresh", () => {
  const setExpiringToken = () => {
    ssoAuthState.setAuthPayload({
      access_token: "stale",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 20_000).toString(),
    } as AuthPayload)
  }

  it("keeps the current header on a rejected refresh and backs off", async () => {
    setExpiringToken()
    const fetchMock = vi.fn().mockResolvedValue(response({ notice: "hint" }))
    vi.stubGlobal("fetch", fetchMock)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    const refresh = vi.fn().mockRejectedValue(new Error("network down"))
    client.refreshTokenMethod = refresh

    // The triggering request still uses a valid token in the refresh window.
    expect((await client.queryRaw("SELECT 1")).type).toBe(Type.NOTICE)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("exec?"),
      expect.objectContaining({
        headers: { Authorization: "Bearer stale" },
      }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to refresh the auth token",
      expect.objectContaining({ message: "network down" }),
    )
    expect(ssoAuthState.hasRefreshFailed()).toBe(true)

    // Subsequent queries use the current token without hammering the IdP.
    await client.queryRaw("SELECT 2")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("notifies the auth provider only once per failure episode", async () => {
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    client.refreshTokenMethod = vi.fn().mockRejectedValue(new Error("offline"))
    const onFailure = vi.fn()
    eventBus.subscribe(EventType.MSG_AUTH_REFRESH_FAILED, onFailure)
    try {
      await client.queryRaw("SELECT 1")
      await client.queryRaw("SELECT 2")
      expect(onFailure).toHaveBeenCalledTimes(1)
    } finally {
      eventBus.unsubscribe(EventType.MSG_AUTH_REFRESH_FAILED, onFailure)
    }
  })

  it("retries after backoff and resets it after a successful refresh", async () => {
    vi.useFakeTimers()
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ access_token: "new" })
    client.refreshTokenMethod = refresh

    await client.queryRaw("SELECT 1")
    await vi.advanceTimersByTimeAsync(4_999)
    await client.queryRaw("SELECT 2")
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await client.queryRaw("SELECT 3")
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(ssoAuthState.hasRefreshFailed()).toBe(true)
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer new" } }),
    )
  })

  it("does not carry refresh backoff into a new SSO session", async () => {
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ access_token: "new" })
    client.refreshTokenMethod = refresh
    await client.queryRaw("SELECT 1")

    // A different auth payload means a fresh login, even inside the backoff.
    ssoAuthState.setAuthPayload({
      access_token: "another-session",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 20_000).toString(),
    } as AuthPayload)
    await client.queryRaw("SELECT 2")
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("updates only future requests on success and preserves other headers", async () => {
    // An in-flight request must keep its captured headers, but cannot delay
    // the refresh or new queries for minutes while its body is still loading.
    ssoAuthState.setAuthPayload({
      access_token: "stale",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 60_000).toString(),
    } as AuthPayload)
    let finishFirst!: (value: Response) => void
    const firstResponse = new Promise<Response>((resolve) => {
      finishFirst = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue(response({ notice: "hint" }))
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({
      Authorization: "Bearer stale",
      "X-Other": "keep",
    })
    const first = client.queryRaw("SELECT 1")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setExpiringToken()
    const refresh = vi.fn().mockResolvedValue({
      access_token: "new",
      id_token: "new-id",
      groups_encoded_in_token: true,
    })
    client.refreshTokenMethod = refresh
    const second = client.queryRaw("SELECT 2")
    expect((await second).type).toBe(Type.NOTICE)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer stale", "X-Other": "keep" },
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer new-id", "X-Other": "keep" },
      }),
    )
    finishFirst(response({ notice: "hint" }))
    expect((await first).type).toBe(Type.NOTICE)
  })

  it("does not log out a refreshed session for an earlier request's 401", async () => {
    vi.useFakeTimers()
    ssoAuthState.setAuthPayload({
      access_token: "old",
      refresh_token: "refresh",
      expires_at: new Date(Date.now() + 60_000).toString(),
    } as AuthPayload)
    let finishFirst!: (value: Response) => void
    const firstResponse = new Promise<Response>((resolve) => {
      finishFirst = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue(response({ notice: "hint" }))
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer old" })
    client.refreshTokenMethod = vi.fn(() => {
      ssoAuthState.setAuthPayload({
        access_token: "new",
        refresh_token: "next",
        expires_at: new Date(Date.now() + 300_000).toString(),
      } as AuthPayload)
      return Promise.resolve({ access_token: "new" })
    })
    const onUnauthorized = vi.fn()
    eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, onUnauthorized)
    try {
      const first = client.queryRaw("SELECT 1")
      await vi.advanceTimersByTimeAsync(31_000)
      expect((await client.queryRaw("SELECT 2")).type).toBe(Type.NOTICE)
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: "Bearer new" } }),
      )

      finishFirst({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response)
      await expect(first).rejects.toMatchObject({ status: 401 })
      expect(onUnauthorized).not.toHaveBeenCalled()
      expect(ssoAuthState.getAuthPayload()?.access_token).toBe("new")
    } finally {
      eventBus.unsubscribe(
        EventType.MSG_CONNECTION_UNAUTHORIZED,
        onUnauthorized,
      )
    }
  })

  it.each([
    {
      name: "access token",
      groupsEncoded: false,
      oldAccess: "same-access",
      nextAccess: "same-access",
      oldId: "old-id",
      nextId: "next-id",
    },
    {
      name: "ID token",
      groupsEncoded: true,
      oldAccess: "old-access",
      nextAccess: "next-access",
      oldId: "same-id",
      nextId: "same-id",
    },
  ])(
    "reports a 401 after refresh when the $name bearer is unchanged",
    async ({ groupsEncoded, oldAccess, nextAccess, oldId, nextId }) => {
      vi.useFakeTimers()
      const oldPayload = {
        access_token: oldAccess,
        id_token: oldId,
        refresh_token: "refresh",
        groups_encoded_in_token: groupsEncoded,
        expires_at: new Date(Date.now() + 60_000).toString(),
      } as AuthPayload
      ssoAuthState.setAuthPayload(oldPayload)

      let finishFirst!: (value: Response) => void
      const firstResponse = new Promise<Response>((resolve) => {
        finishFirst = resolve
      })
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockReturnValueOnce(firstResponse)
          .mockResolvedValue(response({ notice: "hint" })),
      )
      const client = new Client()
      const bearer = groupsEncoded ? oldId : oldAccess
      client.setCommonHeaders({ Authorization: `Bearer ${bearer}` })
      client.refreshTokenMethod = () => {
        ssoAuthState.setAuthPayload({
          ...oldPayload,
          access_token: nextAccess,
          id_token: nextId,
          expires_at: new Date(Date.now() + 300_000).toString(),
        })
        return Promise.resolve({
          access_token: nextAccess,
          id_token: nextId,
          groups_encoded_in_token: groupsEncoded,
        })
      }
      const onUnauthorized = vi.fn()
      eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, onUnauthorized)
      try {
        const first = client.queryRaw("SELECT 1")
        await vi.advanceTimersByTimeAsync(31_000)
        await client.queryRaw("SELECT 2")
        finishFirst({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        } as Response)
        await expect(first).rejects.toMatchObject({ status: 401 })
        expect(onUnauthorized).toHaveBeenCalledTimes(1)
      } finally {
        eventBus.unsubscribe(
          EventType.MSG_CONNECTION_UNAUTHORIZED,
          onUnauthorized,
        )
      }
    },
  )

  it("still reports a 401 from the current token", async () => {
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response),
    )
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    const onUnauthorized = vi.fn()
    eventBus.subscribe(EventType.MSG_CONNECTION_UNAUTHORIZED, onUnauthorized)
    try {
      await expect(client.queryRaw("SELECT 1")).rejects.toMatchObject({
        status: 401,
      })
      expect(onUnauthorized).toHaveBeenCalledTimes(1)
    } finally {
      eventBus.unsubscribe(
        EventType.MSG_CONNECTION_UNAUTHORIZED,
        onUnauthorized,
      )
    }
  })

  it("starts SQL timing and the request callback after refresh", async () => {
    vi.useFakeTimers()
    setExpiringToken()
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(
            () =>
              resolve(
                response({
                  columns: [],
                  count: 0,
                  dataset: [],
                  timings: {
                    compiler: 0,
                    authentication: 0,
                    count: 0,
                    execute: 0,
                  },
                }),
              ),
            20,
          )
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    let resolveRefresh!: (token: Partial<AuthPayload>) => void
    const client = new Client()
    client.refreshTokenMethod = () =>
      new Promise<Partial<AuthPayload>>((resolve) => {
        resolveRefresh = resolve
      })
    const onRequestStart = vi.fn()
    const query = client.queryRaw("SELECT 1", { onRequestStart })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(onRequestStart).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    resolveRefresh({ access_token: "new" })
    await vi.advanceTimersByTimeAsync(20)
    const result = await query
    expect(onRequestStart).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.not.stringContaining("onRequestStart"),
      expect.any(Object),
    )
    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL")
    expect(result.timings.fetch).toBe(20_000_000)
  })

  it("releases queries across Client instances after one rejection", async () => {
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    let rejectRefresh!: (reason: Error) => void
    const refresh = vi.fn().mockImplementation(
      () =>
        new Promise<Partial<AuthPayload>>((_, reject) => {
          rejectRefresh = reject
        }),
    )
    const firstClient = new Client()
    firstClient.refreshTokenMethod = refresh
    const secondClient = new Client()
    const first = firstClient.queryRaw("SELECT 1")
    const second = secondClient.queryRaw("SELECT 2")
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    rejectRefresh(new Error("offline"))
    expect((await first).type).toBe(Type.NOTICE)
    expect((await second).type).toBe(Type.NOTICE)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("lets a parked query cancel without cancelling the shared refresh", async () => {
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    const client = new Client()
    let resolveRefresh!: (token: Partial<AuthPayload>) => void
    client.refreshTokenMethod = () =>
      new Promise<Partial<AuthPayload>>((resolve) => {
        resolveRefresh = resolve
      })
    const first = client.queryRaw("SELECT 1")
    const { promise, queryId } = client.queryRaw("SELECT 2", {
      cancellable: true,
    })
    client.abort(queryId)
    await expect(promise).rejects.toMatchObject({ error: "Cancelled by user" })
    expect(fetch).not.toHaveBeenCalled()
    resolveRefresh({ access_token: "new" })
    expect((await first).type).toBe(Type.NOTICE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("times out a refresh that never settles, then releases all waiters", async () => {
    vi.useFakeTimers()
    setExpiringToken()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ notice: "hint" })),
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    const refresh = vi.fn(
      (_signal?: AbortSignal) => new Promise<Partial<AuthPayload>>(() => {}),
    )
    client.refreshTokenMethod = refresh
    const first = client.queryRaw("SELECT 1")
    const second = new Client().queryRaw("SELECT 2")
    const signal = refresh.mock.calls[0][0]
    await vi.advanceTimersByTimeAsync(10_000)
    expect(signal?.aborted).toBe(true)
    expect((await first).type).toBe(Type.NOTICE)
    expect((await second).type).toBe(Type.NOTICE)
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to refresh the auth token",
      expect.objectContaining({ message: "Token refresh timed out" }),
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not install a late token after the refresh deadline", async () => {
    vi.useFakeTimers()
    setExpiringToken()
    const fetchMock = vi.fn().mockResolvedValue(response({ notice: "hint" }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})
    let resolveRefresh!: (token: Partial<AuthPayload>) => void
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    client.refreshTokenMethod = () =>
      new Promise<Partial<AuthPayload>>((resolve) => {
        resolveRefresh = resolve
      })
    const first = client.queryRaw("SELECT 1")
    await vi.advanceTimersByTimeAsync(10_000)
    await first
    resolveRefresh({ access_token: "late" })
    await Promise.resolve()
    await client.queryRaw("SELECT 2")
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer stale" } }),
    )
  })

  it("does not overwrite the header for an OAuth error response", async () => {
    setExpiringToken()
    const fetchMock = vi.fn().mockResolvedValue(response({ notice: "hint" }))
    vi.stubGlobal("fetch", fetchMock)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    client.refreshTokenMethod = vi.fn().mockResolvedValue({
      error: "invalid_grant",
    })
    await client.queryRaw("SELECT 1")
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer stale" } }),
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe("Client catalog method wiring", () => {
  const catalogResponse = (
    tableName: string,
    rowCount: string | null,
  ): Response =>
    response({
      columns: [
        { name: "table_name", type: "STRING" },
        { name: "table_row_count", type: "LONG" },
      ],
      count: 1,
      dataset: [[tableName, rowCount]],
      timings: { compiler: 0, authentication: 0, count: 0, execute: 0 },
    })

  it("returns showTables catalog LONGs as bigint", async () => {
    // Given a tables() response whose LONG arrives as a quoted decimal string
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(catalogResponse("trades", "9007199254740993")),
    )

    // When the schema catalog is listed
    const result = await new Client().showTables()

    // Then the row count keeps its full 64-bit precision
    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].table_row_count).toBe(BigInt("9007199254740993"))
  })

  it("returns getTableDetails catalog LONGs as bigint", async () => {
    // Given a single-table tables() response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(catalogResponse("trades", "9007199254740993")),
    )

    // When one table's details are fetched
    const result = await new Client().getTableDetails("trades")

    // Then the row count keeps its full 64-bit precision
    expect(result.type).toBe(Type.DQL)
    if (result.type !== Type.DQL) throw new Error("expected DQL result")
    expect(result.data[0].table_row_count).toBe(BigInt("9007199254740993"))
  })

  it("escapes single quotes in the table name it filters on", async () => {
    // Given a table whose name carries a single quote
    const fetchMock = vi.fn<[string], Promise<Response>>(() =>
      Promise.resolve(catalogResponse("o'brien", "1")),
    )
    vi.stubGlobal("fetch", fetchMock)

    // When its details are fetched
    await new Client().getTableDetails("o'brien")

    // Then the quote is doubled so the predicate stays a single string literal
    expect(decodeURIComponent(fetchMock.mock.calls[0][0])).toContain(
      "tables() where table_name = 'o''brien';",
    )
  })
})

describe("Client showDDL kind routing", () => {
  it("sends the kind-specific SHOW CREATE statement for every table kind", async () => {
    // Given a client whose requests are captured
    const fetchMock = vi.fn<[string], Promise<Response>>(() =>
      Promise.resolve(response({ notice: "ok" })),
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    const kinds: TableKind[] = ["table", "matview", "view", "liveview"]

    // When DDL is requested for each kind
    for (const kind of kinds) {
      await client.showDDL("my_target", kind)
    }

    // Then each kind maps to its own SHOW CREATE statement
    const sentQueries = fetchMock.mock.calls.map(([url]) =>
      decodeURIComponent(url),
    )
    expect(sentQueries[0]).toContain("SHOW CREATE TABLE 'my_target';")
    expect(sentQueries[1]).toContain(
      "SHOW CREATE MATERIALIZED VIEW 'my_target';",
    )
    expect(sentQueries[2]).toContain("SHOW CREATE VIEW 'my_target';")
    expect(sentQueries[3]).toContain("SHOW CREATE LIVE VIEW 'my_target';")
  })
})
