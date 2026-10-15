import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { Client } from "../../utils/questdb/client"
import { Type } from "../../utils/questdb/types"
import { fetchColumns } from "./fetchColumns"

const columns = [
  {
    table_name: "private_table",
    ordinal_position: 1,
    column_name: "value",
    data_type: "INT",
  },
]
const response = () =>
  new Response(
    JSON.stringify({
      columns: [
        { name: "table_name", type: "STRING" },
        { name: "ordinal_position", type: "INT" },
        { name: "column_name", type: "STRING" },
        { name: "data_type", type: "STRING" },
      ],
      dataset: [["private_table", 1, "value", "INT"]],
      count: 1,
    }),
  )

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  ssoAuthState.setAuthPayload({
    access_token: "old",
    refresh_token: "refresh",
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  })
})

afterEach(() => {
  ssoAuthState.clearAuthPayload()
  Client.__resetRefreshStateForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("schema columns compatibility queries", () => {
  it("loads columns from the primary query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const onColumns = vi.fn()
    const onError = vi.fn()

    await fetchColumns(new Client(), onColumns, onError)

    expect(onColumns).toHaveBeenCalledWith(columns)
    expect(onError).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("still retries ordinary query failures on older servers", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unknown function"))
      .mockResolvedValueOnce(response())
    vi.stubGlobal("fetch", fetchMock)
    const onColumns = vi.fn()
    const onError = vi.fn()

    await fetchColumns(new Client(), onColumns, onError)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("information_schema.columns()"),
      expect.anything(),
    )
    expect(onColumns).toHaveBeenCalledWith(columns)
    expect(onError).not.toHaveBeenCalled()
  })

  it("reports an error only when both attempts fail in the current session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unavailable")))
    const onColumns = vi.fn()
    const onError = vi.fn()

    await fetchColumns(new Client(), onColumns, onError)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onColumns).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    "does not restart a held primary after refresh logout (re-login: %s)",
    async (relogin) => {
      let finish!: (value: Response) => void
      const primary = new Promise<Response>((resolve) => {
        finish = resolve
      })
      const fetchMock = vi
        .fn()
        .mockReturnValueOnce(primary)
        .mockResolvedValue(response())
      vi.stubGlobal("fetch", fetchMock)
      const client = new Client()
      client.setCommonHeaders({ Authorization: "Bearer old" })
      const onColumns = vi.fn()
      const onError = vi.fn()
      const loading = fetchColumns(client, onColumns, onError)

      vi.setSystemTime(Date.now() + 31_000)
      client.refreshTokenMethod = () => {
        ssoAuthState.clearAuthPayload()
        return Promise.resolve(undefined)
      }
      await expect(client.queryRaw("select 2")).rejects.toMatchObject({
        sessionEnded: true,
      })
      if (relogin) ssoAuthState.markNonSSOAuthenticated()
      finish(response())
      await loading

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(onColumns).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    },
  )

  it("does not publish a fallback that settles after logout", async () => {
    let finish!: (value: Response) => void
    let started!: () => void
    const fallbackStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Unknown function"))
        .mockImplementationOnce(() => {
          started()
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }),
    )
    const onColumns = vi.fn()
    const onError = vi.fn()
    const loading = fetchColumns(new Client(), onColumns, onError)
    await fallbackStarted
    ssoAuthState.clearAuthPayload()
    finish(response())
    await loading

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onColumns).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("treats sessionEnded as terminal even without a generation change", async () => {
    const client = new Client()
    const query = vi
      .spyOn(client, "query")
      .mockRejectedValue({ sessionEnded: true })
    const onColumns = vi.fn()
    const onError = vi.fn()

    await fetchColumns(client, onColumns, onError)

    expect(query).toHaveBeenCalledTimes(1)
    expect(onColumns).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("checks the operation generation even if its query implementation returns stale data", async () => {
    const client = new Client()
    const queryRaw = vi.spyOn(client, "queryRaw").mockImplementation(() => {
      ssoAuthState.clearAuthPayload()
      return Promise.resolve({
        type: Type.DQL,
        columns: [],
        dataset: [],
        count: 0,
        query: "columns",
        error: undefined,
        notice: undefined,
        timings: {
          compiler: 0,
          authentication: 0,
          count: 0,
          execute: 0,
          fetch: 0,
        },
      })
    })
    const onColumns = vi.fn()
    const onError = vi.fn()

    await fetchColumns(client, onColumns, onError)

    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(onColumns).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
