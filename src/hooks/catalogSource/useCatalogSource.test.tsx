import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QuestContext } from "../../providers"
import { useCatalogSource } from "./useCatalogSource"
import { MANUAL_RETRY_POLICY } from "./sourceState"
import { Client } from "../../utils/questdb/client"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import type { Options, QueryLifecycle } from "../../utils/questdb"
import type { AuthPayload } from "../../modules/OAuth2/types"

vi.mock("../../providers", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({}) }
})

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  authSessionState.endSession()
})

const transformResponse = () => []

const renderSource = (quest: Client) => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  let status: string | undefined
  let readyData: unknown
  type Props = { sourceKey: string; enabled: boolean }
  const Harness = ({ sourceKey, enabled }: Props) => {
    const { state, lastReadyData } = useCatalogSource({
      sourceKey,
      revalidateKey: 0,
      sourceName: "Tables",
      enabled,
      query: sourceKey === "catalog" ? "tables()" : sourceKey,
      pollIntervalMs: null,
      retryPolicy: MANUAL_RETRY_POLICY,
      transformResponse,
    })
    status = state.status
    readyData = lastReadyData
    return null
  }
  const value = {
    quest,
    questExecution: {} as React.ContextType<
      typeof QuestContext
    >["questExecution"],
    buildVersion: { type: "oss" as const, version: "" },
    commitHash: "",
  }
  const tree = (props: Props) => (
    <QuestContext.Provider value={value}>
      <Harness {...props} />
    </QuestContext.Provider>
  )
  act(() => {
    renderer = create(tree({ sourceKey: "catalog", enabled: true }))
  })
  return {
    status: () => status,
    data: () => readyData,
    update: (props: Props) => act(() => renderer?.update(tree(props))),
  }
}

const mount = (startImmediately: boolean) => {
  vi.useFakeTimers()
  const abort = vi.fn()
  const queryRaw = vi.fn(
    (_query: string, _options: Options, lifecycle: QueryLifecycle) => {
      if (startImmediately) lifecycle.onRequestStart?.()
      else lifecycle.onRefreshWait?.(10_000)
      return { queryId: 1, promise: new Promise(() => {}) }
    },
  )
  const { status } = renderSource({ queryRaw, abort } as unknown as Client)
  return { abort, queryRaw, status }
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("useCatalogSource deadline integration", () => {
  it("wires onRequestStart so SQL gets 10 seconds, not the combined 20", async () => {
    const hook = mount(true)
    expect(hook.queryRaw.mock.calls[0][2].onRequestStart).toBeTypeOf("function")
    await advance(9_999)
    expect(hook.status()).toBe("loading")
    expect(hook.abort).not.toHaveBeenCalled()
    await advance(1)
    expect(hook.status()).toBe("unavailable")
    expect(hook.abort).toHaveBeenCalledWith(1)
  })

  it("gives SQL its full budget after waiting for refresh", async () => {
    const hook = mount(false)
    await advance(9_000)
    act(() => hook.queryRaw.mock.calls[0][2].onRequestStart?.())
    await advance(9_999)
    expect(hook.status()).toBe("loading")
    await advance(1)
    expect(hook.status()).toBe("unavailable")
    expect(hook.abort).toHaveBeenCalledWith(1)
  })

  it("still times out if no request-start callback ever arrives", async () => {
    const hook = mount(false)
    await advance(20_000)
    expect(hook.status()).toBe("unavailable")
    expect(hook.abort).toHaveBeenCalledWith(1)
  })

  it("waits for the refresh after a 401, then shows the retried result", async () => {
    vi.useFakeTimers()
    const later = <T,>(ms: number, value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
    // The browser thinks the token is valid, but the server has expired it.
    const issue = (access_token: string) => ({
      access_token,
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    })
    authSessionState.setAuthPayload(issue("stale"))
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        later(2_000, {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        } as Response),
      )
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ columns: [], count: 0, dataset: [] }),
          ),
      } as Response)
    vi.stubGlobal("fetch", fetchMock)
    const client = new Client()
    client.setCommonHeaders({ Authorization: "Bearer stale" })
    const refresh = vi.fn(() =>
      later(8_500, issue("fresh")).then((payload) => {
        authSessionState.setAuthPayload(payload)
        return payload
      }),
    )
    client.refreshTokenMethod = refresh
    const { status } = renderSource(client)

    // The refresh ends 10.5s after the first request started: past that
    // request's 10s timeout, but within the refresh's own 10s bound.
    await advance(10_000)
    expect(status()).toBe("loading")
    await advance(500)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer fresh" } }),
    )
    expect(status()).toBe("ready")
  })

  it.each(["retarget", "disable", "unmount"])(
    "cleans an abandoned source during shared refresh on %s",
    async (change) => {
      vi.useFakeTimers()
      const client = new Client()
      const abort = vi.spyOn(client, "abort")
      authSessionState.setAuthPayload({
        access_token: "old",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 20_000).toISOString(),
      })
      let finishRefresh!: () => void
      const refresh = vi.fn(
        () =>
          new Promise<AuthPayload>((resolve) => {
            finishRefresh = () => {
              const payload = {
                access_token: "fresh",
                token_type: "Bearer",
                refresh_token: "rotated",
                expires_at: new Date(Date.now() + 300_000).toISOString(),
              }
              authSessionState.setAuthPayload(payload)
              resolve(payload)
            }
          }),
      )
      client.refreshTokenMethod = refresh
      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ columns: [], count: 0, dataset: [] }),
            ),
          ),
        )
      vi.stubGlobal("fetch", fetchMock)
      const source = renderSource(client)
      await advance(1_000)
      // Another source must still be able to use the same refresh.
      const current = client.queryRaw("current-source")
      if (change === "unmount") {
        act(() => renderer?.unmount())
      } else {
        source.update({
          sourceKey: "new-source",
          enabled: change === "retarget",
        })
      }
      await advance(0)
      expect(abort).toHaveBeenCalledWith(1)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(source.data()).toBeNull()
      finishRefresh()
      await advance(0)
      await current

      expect(refresh).toHaveBeenCalledTimes(1)
      const queries = fetchMock.mock.calls.map(([url]) =>
        new URL(url as string, "http://localhost").searchParams.get("query"),
      )
      expect(queries).not.toContain("tables()")
      expect(queries).toEqual(
        change === "retarget"
          ? ["current-source", "new-source"]
          : ["current-source"],
      )
      if (change === "retarget") {
        expect(source.status()).toBe("ready")
        expect(source.data()).toEqual([])
      }
      expect(vi.getTimerCount()).toBe(0)
      await advance(20_000)
      expect(abort).toHaveBeenCalledTimes(1)
    },
  )
})
