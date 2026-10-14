import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QuestContext } from "../../providers"
import { useCatalogSource } from "./useCatalogSource"
import { MANUAL_RETRY_POLICY } from "./sourceState"
import { Client } from "../../utils/questdb/client"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import type { Options } from "../../utils/questdb"

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
  ssoAuthState.clearAuthPayload()
  Client.__resetRefreshStateForTests()
})

const transformResponse = () => []

const renderSource = (quest: Client) => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  let status: string | undefined
  const Harness = () => {
    const { state } = useCatalogSource({
      sourceKey: "catalog",
      revalidateKey: 0,
      sourceName: "Tables",
      enabled: true,
      query: "tables()",
      pollIntervalMs: null,
      retryPolicy: MANUAL_RETRY_POLICY,
      transformResponse,
    })
    status = state.status
    return null
  }
  act(() => {
    renderer = create(
      <QuestContext.Provider
        value={{
          quest,
          questExecution: {} as React.ContextType<
            typeof QuestContext
          >["questExecution"],
          buildVersion: { type: "oss", version: "" },
          commitHash: "",
        }}
      >
        <Harness />
      </QuestContext.Provider>,
    )
  })
  return () => status
}

const mount = (startImmediately: boolean) => {
  vi.useFakeTimers()
  const abort = vi.fn()
  const queryRaw = vi.fn((_query: string, options: Options) => {
    if (startImmediately) options.onRequestStart?.()
    return { queryId: 1, promise: new Promise(() => {}) }
  })
  const status = renderSource({ queryRaw, abort } as unknown as Client)
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
    expect(hook.queryRaw.mock.calls[0][1].onRequestStart).toBeTypeOf("function")
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
    act(() => hook.queryRaw.mock.calls[0][1].onRequestStart?.())
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
    ssoAuthState.setAuthPayload(issue("stale"))
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
        ssoAuthState.setAuthPayload(payload)
        return payload
      }),
    )
    client.refreshTokenMethod = refresh
    const status = renderSource(client)

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
})
