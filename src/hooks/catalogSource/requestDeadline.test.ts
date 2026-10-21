import { afterEach, describe, expect, it, vi } from "vitest"
import { createCatalogRequestDeadline } from "./requestDeadline"

afterEach(() => {
  vi.useRealTimers()
})

describe("catalog request deadline", () => {
  it("allows a full SQL timeout after a hung refresh", async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const deadline = createCatalogRequestDeadline("table metadata", onTimeout)
    deadline.onRefreshWait(10_000)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(onTimeout).not.toHaveBeenCalled()
    deadline.onRequestStart()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(onTimeout).not.toHaveBeenCalled()

    const rejection = expect(deadline.promise).rejects.toThrow(
      "table metadata request timed out",
    )
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(onTimeout).toHaveBeenCalledTimes(1)
    deadline.clear()
  })

  it("allows a refresh after a rejected request before restarting the SQL timeout", async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const deadline = createCatalogRequestDeadline("query activity", onTimeout)
    deadline.onRequestStart()
    // The server rejects the token after 2s, then the refresh takes 8.5s.
    await vi.advanceTimersByTimeAsync(2_000)
    deadline.onRefreshWait(10_000)
    await vi.advanceTimersByTimeAsync(8_500)
    expect(onTimeout).not.toHaveBeenCalled()

    deadline.onRequestStart()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(onTimeout).not.toHaveBeenCalled()
    const rejection = expect(deadline.promise).rejects.toThrow(
      "query activity request timed out",
    )
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(onTimeout).toHaveBeenCalledTimes(1)
    deadline.clear()
  })

  it("keeps the normal ten-second SQL timeout without refresh", async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const deadline = createCatalogRequestDeadline("columns", onTimeout)
    deadline.onRequestStart()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(onTimeout).not.toHaveBeenCalled()

    const rejection = expect(deadline.promise).rejects.toThrow(
      "columns request timed out",
    )
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(onTimeout).toHaveBeenCalledTimes(1)
    deadline.clear()
  })

  it("clears the pending timeout after a successful request", async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const deadline = createCatalogRequestDeadline("columns", onTimeout)
    deadline.onRequestStart()
    deadline.clear()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
