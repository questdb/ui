// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import React from "react"
import { ThemeProvider } from "styled-components"
import { Button } from "../../../src/components/Button"
import { darkTheme } from "../../../src/theme"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QuestContext } from "../../../src/providers"
import { Client } from "../../../src/utils/questdb"
import { authSessionState } from "../../../src/modules/OAuth2/authSessionState"
import { QUERY_ACTIVITY_SQL } from "../../../src/scenes/QueryActivity/queryActivity"
import { useQueryActivity } from "../../../src/scenes/QueryActivity/useQueryActivity"

// The hook only consumes the client. Keep unrelated provider startup out of
// this test, while running both hooks and the HTTP client unchanged.
vi.mock("../../../src/providers", async () => {
  const { createContext } = await import("react")
  return { QuestContext: createContext({}) }
})

const columns = [
  { name: "query_id", type: "LONG" },
  { name: "worker_id", type: "LONG" },
  { name: "worker_pool", type: "STRING" },
  { name: "username", type: "STRING" },
  { name: "query_start", type: "TIMESTAMP" },
  { name: "state_change", type: "TIMESTAMP" },
  { name: "state", type: "STRING" },
  { name: "is_wal", type: "BOOLEAN" },
  { name: "query", type: "STRING" },
  { name: "memory_used", type: "LONG" },
  { name: "memory_limit", type: "LONG" },
  { name: "server_now", type: "TIMESTAMP" },
]
const listing = (ids: number[]) => {
  const text = vi.fn(() =>
    Promise.resolve(
      JSON.stringify({
        columns,
        count: ids.length,
        dataset: ids.map((id) => [
          String(id),
          "1",
          "shared",
          "admin",
          "2026-01-01T00:00:00.000000Z",
          "2026-01-01T00:00:00.000000Z",
          "active",
          false,
          `select ${id}`,
          "64",
          "1024",
          "2026-01-01T00:00:01.000000Z",
        ]),
      }),
    ),
  )
  return { ok: true, status: 200, text } as Response & { text: typeof text }
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const Harness = () => {
  const source = useQueryActivity({ enabled: true, autoRefresh: true })
  return (
    <>
      <Button onClick={source.refresh}>Refresh</Button>
      <output aria-label="Source status">{source.state.status}</output>
      <ul aria-label="Current queries">
        {source.snapshot?.rows.map((row) => (
          <li key={String(row.queryId)}>{String(row.queryId)}</li>
        ))}
      </ul>
      <ul aria-label="Finished queries">
        {[...source.finished.keys()].map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  authSessionState.endSession()
})

describe("query activity stale response integration", () => {
  it("does not revive a query when an aborted older listing still resolves after refresh", async () => {
    // Given
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"))
    const oldRequest = deferred<Response>()
    const freshRequest = deferred<Response>()
    const oldResponse = listing([41, 42])
    const fetch = vi
      .fn<
        Parameters<typeof globalThis.fetch>,
        ReturnType<typeof globalThis.fetch>
      >()
      .mockResolvedValueOnce(listing([41, 42]))
      // This transport deliberately ignores AbortSignal: the late body must
      // reach the real client so the hook's request guard gets tested.
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => freshRequest.promise)
    vi.stubGlobal("fetch", fetch)
    const client = new Client()
    await act(async () => {
      render(
        <QuestContext.Provider
          value={{
            quest: client,
            questExecution: {} as React.ContextType<
              typeof QuestContext
            >["questExecution"],
            buildVersion: { type: "oss", version: "test" },
            commitHash: "test",
          }}
        >
          <ThemeProvider theme={darkTheme}>
            <Harness />
          </ThemeProvider>
        </QuestContext.Provider>,
      )
      await Promise.resolve()
    })
    expect(screen.getByLabelText("Current queries")).toHaveTextContent("4142")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    const oldSignal = fetch.mock.calls[1][1]!.signal!
    expect(oldSignal.aborted).toBe(false)

    // When a successful cancellation triggers a fresh listing without 41.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(oldSignal.aborted).toBe(true)
    await act(async () => {
      freshRequest.resolve(listing([42]))
      await freshRequest.promise
    })
    expect(screen.getByLabelText("Source status")).toHaveTextContent("ready")
    expect(screen.getByLabelText("Current queries")).toHaveTextContent(/^42$/)
    expect(screen.getByLabelText("Finished queries")).toHaveTextContent(/^41$/)
    await act(async () => {
      oldRequest.resolve(oldResponse)
      await oldRequest.promise
    })

    // Then the late body was read, but cannot replace the newer snapshot.
    // No clock advance or later poll can hide a revived row.
    expect(oldResponse.text).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(screen.getByLabelText("Current queries")).toHaveTextContent(/^42$/)
    expect(screen.getByLabelText("Finished queries")).toHaveTextContent(/^41$/)
    for (const [url] of fetch.mock.calls) {
      if (typeof url !== "string")
        throw new Error("Expected the client request URL")
      expect(new URL(url, "http://localhost").searchParams.get("query")).toBe(
        QUERY_ACTIVITY_SQL,
      )
    }
  })
})
