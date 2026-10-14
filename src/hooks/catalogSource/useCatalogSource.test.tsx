import "../../test/stubBrowserGlobals"
import React from "react"
import { act, create, ReactTestRenderer } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QuestContext } from "../../providers"
import { useCatalogSource } from "./useCatalogSource"
import { MANUAL_RETRY_POLICY } from "./sourceState"
import type { Client, Options } from "../../utils/questdb"

vi.mock("../../providers", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({}) }
})

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const transformResponse = () => []

const mount = (startImmediately: boolean) => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => {})
  const abort = vi.fn()
  const queryRaw = vi.fn((_query: string, options: Options) => {
    if (startImmediately) options.onRequestStart?.()
    return { queryId: 1, promise: new Promise(() => {}) }
  })
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
          quest: { queryRaw, abort } as unknown as Client,
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
  return { abort, queryRaw, status: () => status }
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
})
