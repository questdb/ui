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
})
