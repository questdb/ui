import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { mockGetValue } = vi.hoisted(() => ({
  mockGetValue: vi.fn(),
}))

vi.mock("./localStorage", () => ({
  getValue: mockGetValue,
}))

vi.mock("./localStorage/types", () => ({
  StoreKey: {
    RELEASE_TYPE: "releaseType",
  },
}))

vi.mock("../consts", () => ({
  API: "https://test.questdb.io",
}))

import { sendServerInfoTelemetry } from "./telemetry"
import { TelemetryConfigShape } from "../store/Telemetry/types"

describe("sendServerInfoTelemetry", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchSpy = vi.spyOn(global, "fetch")
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchSpy.mockRestore()
  })

  const mockServerInfo: TelemetryConfigShape = {
    id: "test-id",
    version: "1.0.0",
    os: "linux",
    package: "test",
    enabled: true,
  }

  it("should not send telemetry when releaseType is not EE and telemetry is disabled", async () => {
    mockGetValue.mockReturnValue("OSS")

    const disabledServerInfo = { ...mockServerInfo, enabled: false }
    const promise = sendServerInfoTelemetry(disabledServerInfo)

    await vi.runAllTimersAsync()
    await promise

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("should return early on successful response", async () => {
    mockGetValue.mockReturnValue("EE")
    fetchSpy.mockResolvedValueOnce({ ok: true } as Response)

    const promise = sendServerInfoTelemetry(mockServerInfo)

    await vi.runAllTimersAsync()
    await promise

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("should retry on non-ok response with exponential backoff", async () => {
    mockGetValue.mockReturnValue("EE")
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)

    const promise = sendServerInfoTelemetry(mockServerInfo)

    // First attempt returns non-ok
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Wait for first retry delay (1000ms)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Wait for second retry delay (2000ms)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    await promise
  })

  it("should stop retrying after max retries (4 total attempts)", async () => {
    mockGetValue.mockReturnValue("EE")
    fetchSpy.mockRejectedValue(new Error("Network error"))

    const promise = sendServerInfoTelemetry(mockServerInfo)

    // First attempt (attempt 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Retry 1 after 1000ms (attempt 1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Retry 2 after 2000ms (attempt 2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    // Retry 3 after 4000ms (attempt 3 - max)
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchSpy).toHaveBeenCalledTimes(4)

    // No more retries should happen
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchSpy).toHaveBeenCalledTimes(4)

    await promise
  })
})
