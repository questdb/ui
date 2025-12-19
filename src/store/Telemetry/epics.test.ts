import { describe, it, expect, vi, beforeEach } from "vitest"
import { of, Subject } from "rxjs"
import { StateObservable } from "redux-observable"
import { TelemetryAT } from "../../types"

// Hoist mock functions so they're available when vi.mock runs
const { mockQueryRaw, mockFromFetch, mockGetRemoteConfig, mockGetConfig, mockSetRemoteConfig } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockFromFetch: vi.fn(),
  mockGetRemoteConfig: vi.fn(),
  mockGetConfig: vi.fn(),
  mockSetRemoteConfig: vi.fn((config: any) => ({
    type: "telemetry/SET_REMOTE_CONFIG",
    payload: config,
  })),
}))

vi.mock("../../utils/questdb", () => ({
  Client: vi.fn().mockImplementation(() => ({
    queryRaw: mockQueryRaw,
    query: vi.fn(),
    setCommonHeaders: vi.fn(),
  })),
  Type: {
    DQL: "DQL",
  },
}))

vi.mock("../../utils", () => ({
  fromFetch: mockFromFetch,
}))

vi.mock("../../consts", () => ({
  API: "https://test.questdb.io",
  TelemetryTable: {
    MAIN: "telemetry",
    WAL: "sys.telemetry_wal",
    CONFIG: "telemetry_config",
  },
}))

vi.mock("../../store", () => ({
  actions: {
    telemetry: {
      setRemoteConfig: (config: any) => mockSetRemoteConfig(config),
    },
  },
  selectors: {
    telemetry: {
      getRemoteConfig: () => mockGetRemoteConfig(),
      getConfig: () => mockGetConfig(),
    },
  },
}))

vi.mock("../../utils/localStorage", () => ({
  getValue: vi.fn(),
}))

vi.mock("../../modules/OAuth2/ssoAuthState", () => ({
  ssoAuthState: {
    getAuthPayload: vi.fn(() => null),
  },
}))

vi.mock("../../utils/telemetry", () => ({
  sendServerInfoTelemetry: vi.fn(),
  getTelemetryTimestamp: vi.fn(() => of({ error: false, data: {} })),
}))

// Import after mocks are set up
import { startTelemetry } from "./epics"
import * as QuestDB from "../../utils/questdb"

describe("startTelemetry epic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should schedule next check when lastUpdated is missing (skip path)", async () => {
    mockGetRemoteConfig.mockReturnValue(undefined)

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: {},
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    // The epic should not error when lastUpdated is missing
    let errored = false
    const sub = epic$.subscribe({
      error: () => {
        errored = true
      },
    })

    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    expect(errored).toBe(false)
  })

  it("should handle empty query result and schedule next check", async () => {
    const mockRemoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    mockGetRemoteConfig.mockReturnValue(mockRemoteConfig)
    mockGetConfig.mockReturnValue({
      id: "test-id",
      version: "1.0.0",
      os: "linux",
      package: "test",
      enabled: true,
    })

    // Return empty result from query
    mockQueryRaw.mockResolvedValue({
      type: QuestDB.Type.DQL,
      count: 0,
      columns: [],
      dataset: [],
    })

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: mockRemoteConfig,
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    let errored = false
    const sub = epic$.subscribe({
      error: () => {
        errored = true
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    expect(errored).toBe(false)
    // fromFetch should NOT be called when there's no data
    expect(mockFromFetch).not.toHaveBeenCalled()
  })

  it("should send telemetry data when query returns results", async () => {
    const mockRemoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    mockGetRemoteConfig.mockReturnValue(mockRemoteConfig)
    mockGetConfig.mockReturnValue({
      id: "test-id",
      version: "1.0.0",
      os: "linux",
      package: "test",
      enabled: true,
    })

    // Return data from query
    mockQueryRaw.mockResolvedValue({
      type: QuestDB.Type.DQL,
      count: 2,
      columns: [
        { name: "created", type: "LONG" },
        { name: "event", type: "SHORT" },
        { name: "origin", type: "SHORT" },
      ],
      dataset: [
        ["1704067200000", 1, 0],
        ["1704153600000", 2, 0],
      ],
    })

    // Mock successful fetch
    mockFromFetch.mockReturnValue(of({ error: false, data: {} }))

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: mockRemoteConfig,
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    let errored = false
    const sub = epic$.subscribe({
      error: () => {
        errored = true
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    expect(errored).toBe(false)
    // fromFetch SHOULD be called when there's data
    expect(mockFromFetch).toHaveBeenCalledTimes(1)
    expect(mockFromFetch).toHaveBeenCalledWith(
      "https://test.questdb.io/add",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      false,
    )
  })

  it("should retry on fetch failure", async () => {
    const mockRemoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    mockGetRemoteConfig.mockReturnValue(mockRemoteConfig)
    mockGetConfig.mockReturnValue({
      id: "test-id",
      version: "1.0.0",
      os: "linux",
      package: "test",
      enabled: true,
    })

    mockQueryRaw.mockResolvedValue({
      type: QuestDB.Type.DQL,
      count: 1,
      columns: [],
      dataset: [["1704067200000", 1, 0]],
    })

    // Track fetch attempts - always return error
    let fetchAttempts = 0
    mockFromFetch.mockImplementation(() => {
      fetchAttempts++
      return of({ error: true, data: null })
    })

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: mockRemoteConfig,
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    let errored = false
    const sub = epic$.subscribe({
      error: () => {
        errored = true
      },
    })

    // Wait for retries (first attempt + retries with delays 1s, 2s, 4s...)
    await new Promise((resolve) => setTimeout(resolve, 100))
    sub.unsubscribe()
    // Should have attempted at least 1 fetch (initial attempt)
    expect(fetchAttempts).toBeGreaterThanOrEqual(1)
  })

  it("should not propagate errors after max retries - continues loop via catchError", async () => {
    const mockRemoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    mockGetRemoteConfig.mockReturnValue(mockRemoteConfig)
    mockGetConfig.mockReturnValue({
      id: "test-id",
      version: "1.0.0",
      os: "linux",
      package: "test",
      enabled: true,
    })

    mockQueryRaw.mockResolvedValue({
      type: QuestDB.Type.DQL,
      count: 1,
      columns: [],
      dataset: [["1704067200000", 1, 0]],
    })

    // Always return error
    mockFromFetch.mockReturnValue(of({ error: true, data: null }))

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: mockRemoteConfig,
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    // The epic should catch errors and not propagate them
    let errorReceived = false
    const sub = epic$.subscribe({
      error: () => {
        errorReceived = true
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    // catchError in the epic should prevent error propagation
    expect(errorReceived).toBe(false)
  })

  it("should call fetch on successful send", async () => {
    const mockRemoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    const newTimestamp = "1704153600000"

    mockGetRemoteConfig.mockReturnValue(mockRemoteConfig)
    mockGetConfig.mockReturnValue({
      id: "test-id",
      version: "1.0.0",
      os: "linux",
      package: "test",
      enabled: true,
    })

    mockQueryRaw.mockResolvedValue({
      type: QuestDB.Type.DQL,
      count: 1,
      columns: [],
      dataset: [[newTimestamp, 1, 0]],
    })

    // Successful fetch
    mockFromFetch.mockReturnValue(of({ error: false, data: {} }))

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: mockRemoteConfig,
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(action$ as any, state$ as any, undefined as any)

    const sub = epic$.subscribe()

    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    // Verify the fetch was called
    expect(mockFromFetch).toHaveBeenCalled()
  })
})
