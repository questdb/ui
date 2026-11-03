import { describe, it, expect, vi, beforeEach } from "vitest"
import { of, Subject } from "rxjs"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { AuthRefreshUnavailableError } from "../../modules/OAuth2/session"
import { ActionsObservable, StateObservable } from "redux-observable"
import {
  TelemetryAT,
  TelemetryRemoteConfigShape,
  TelemetryConfigShape,
  StoreAction,
  StoreShape,
} from "../../types"

// Hoist mock functions so they're available when vi.mock runs
const {
  mockQueryRaw,
  mockQuery,
  mockFromFetch,
  mockGetRemoteConfig,
  mockGetConfig,
  mockSetRemoteConfig,
} = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockQuery: vi.fn(),
  mockFromFetch: vi.fn(),
  mockGetRemoteConfig: vi.fn(),
  mockGetConfig: vi.fn(),
  mockSetRemoteConfig: vi.fn((config: TelemetryRemoteConfigShape) => ({
    type: "telemetry/SET_REMOTE_CONFIG",
    payload: config,
  })),
}))

vi.mock("../../utils/questdb/queryClient", () => ({
  questClient: { queryRaw: mockQueryRaw, query: mockQuery },
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
      setConfig: (config: TelemetryConfigShape) => ({
        type: TelemetryAT.SET_CONFIG,
        payload: config,
      }),
      setRemoteConfig: (config: TelemetryRemoteConfigShape) =>
        mockSetRemoteConfig(config),
    },
  },
  selectors: {
    telemetry: {
      getRemoteConfig: (): TelemetryRemoteConfigShape | undefined =>
        mockGetRemoteConfig() as TelemetryRemoteConfigShape | undefined,
      getConfig: (): TelemetryConfigShape | undefined =>
        mockGetConfig() as TelemetryConfigShape | undefined,
    },
  },
}))

vi.mock("../../utils/telemetry", () => ({
  sendServerInfoTelemetry: vi.fn(),
  getTelemetryTimestamp: vi.fn(() => of({ error: false, data: {} })),
}))

// Import after mocks are set up
import { getServerInfo, startTelemetry } from "./epics"
import * as QuestDB from "../../utils/questdb"

describe("startTelemetry epic", () => {
  it("cancels a scheduled poll at logout but accepts the next login's config", async () => {
    vi.useFakeTimers()
    authSessionState.markNonSSOAuthenticated()
    mockGetRemoteConfig.mockReturnValue({})
    const actions$ = new Subject<StoreAction>()
    const state$ = new StateObservable(new Subject(), {})
    const next = vi.fn()
    const sub = startTelemetry(
      new ActionsObservable(actions$),
      state$ as StateObservable<StoreShape>,
      undefined,
    ).subscribe(next)
    try {
      actions$.next({ type: TelemetryAT.SET_REMOTE_CONFIG, payload: {} })
      await vi.advanceTimersByTimeAsync(1000)
      authSessionState.endSession()
      await vi.advanceTimersByTimeAsync(3_600_000)
      expect(next).not.toHaveBeenCalled()
      authSessionState.markNonSSOAuthenticated()
      actions$.next({ type: TelemetryAT.SET_REMOTE_CONFIG, payload: {} })
      await vi.advanceTimersByTimeAsync(3_600_000)
      expect(next).toHaveBeenCalledOnce()
    } finally {
      sub.unsubscribe()
      authSessionState.endSession()
      vi.useRealTimers()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    new Error("connection lost"),
    new AuthRefreshUnavailableError(),
    {
      type: "error",
      error: new AuthRefreshUnavailableError().message,
      authRefreshUnavailable: true,
      requestNotSent: true,
      query: "telemetry",
      position: -1,
    },
  ])(
    "preserves its cursor and schedules another check after SQL rejection: %j",
    async (failure) => {
      vi.useFakeTimers()
      try {
        const remoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
        mockGetRemoteConfig.mockReturnValue(remoteConfig)
        mockQueryRaw.mockRejectedValueOnce(failure)
        const action$ = of({
          type: TelemetryAT.SET_REMOTE_CONFIG,
          payload: remoteConfig,
        })
        const state$ = new StateObservable(new Subject(), {})
        const next = vi.fn()
        const error = vi.fn()
        const sub = startTelemetry(
          action$ as ActionsObservable<StoreAction>,
          state$ as StateObservable<StoreShape>,
          undefined,
        ).subscribe({ next, error })
        await vi.advanceTimersByTimeAsync(3_600_000)
        expect(mockQueryRaw).toHaveBeenCalledWith(
          expect.stringContaining("FROM telemetry"),
          {
            refreshAuth: false,
            background: true,
          },
        )
        expect(error).not.toHaveBeenCalled()
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({ payload: remoteConfig }),
        )
        sub.unsubscribe()
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each([
    { status: 401, error: "Unauthorized" },
    {
      sessionEnded: true,
      error: "Your session has ended. Please sign in again.",
    },
  ])(
    "stops authentication-failure retries but accepts a fresh config: %j",
    async (failure) => {
      vi.useFakeTimers()
      const actions$ = new Subject<StoreAction>()
      const state$ = new StateObservable(new Subject(), {})
      const remoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
      mockGetRemoteConfig.mockReturnValue(remoteConfig)
      mockQueryRaw
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ type: QuestDB.Type.DQL, count: 0 })
      const next = vi.fn((action: StoreAction) => actions$.next(action))
      const error = vi.fn()
      const sub = startTelemetry(
        new ActionsObservable(actions$),
        state$ as StateObservable<StoreShape>,
        undefined,
      ).subscribe({ next, error })
      try {
        actions$.next({
          type: TelemetryAT.SET_REMOTE_CONFIG,
          payload: remoteConfig,
        })
        await vi.advanceTimersByTimeAsync(3 * 3_600_000)

        expect(mockQueryRaw).toHaveBeenCalledTimes(1)
        expect(next).not.toHaveBeenCalled()
        expect(error).not.toHaveBeenCalled()

        // A later login can restart the loop without recreating the root epic.
        actions$.next({
          type: TelemetryAT.SET_REMOTE_CONFIG,
          payload: remoteConfig,
        })
        await vi.advanceTimersByTimeAsync(0)
        expect(mockQueryRaw).toHaveBeenCalledTimes(2)
        expect(error).not.toHaveBeenCalled()
      } finally {
        sub.unsubscribe()
        vi.useRealTimers()
      }
    },
  )

  it("cancels an existing hourly continuation on authentication rejection", async () => {
    vi.useFakeTimers()
    const actions$ = new Subject<StoreAction>()
    const state$ = new StateObservable(new Subject(), {})
    const remoteConfig = { lastUpdated: "2024-01-01T00:00:00.000Z" }
    mockGetRemoteConfig.mockReturnValue(remoteConfig)
    mockQueryRaw
      .mockResolvedValueOnce({ type: QuestDB.Type.DQL, count: 0 })
      .mockRejectedValueOnce({ status: 401, error: "Unauthorized" })
    const next = vi.fn((action: StoreAction) => actions$.next(action))
    const error = vi.fn()
    const sub = startTelemetry(
      new ActionsObservable(actions$),
      state$ as StateObservable<StoreShape>,
      undefined,
    ).subscribe({ next, error })
    const action: StoreAction = {
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: remoteConfig,
    }
    try {
      actions$.next(action)
      await vi.advanceTimersByTimeAsync(0)
      actions$.next(action)
      await vi.advanceTimersByTimeAsync(3 * 3_600_000)

      expect(mockQueryRaw).toHaveBeenCalledTimes(2)
      expect(next).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    } finally {
      sub.unsubscribe()
      vi.useRealTimers()
    }
  })

  it.each([new Error("session ended"), new AuthRefreshUnavailableError()])(
    "keeps getServerInfo alive for the next START after a rejected query: %j",
    async (failure) => {
      const actions$ = new Subject<StoreAction>()
      const state$ = new StateObservable(new Subject(), {})
      mockQuery.mockRejectedValueOnce(failure).mockResolvedValueOnce({
        type: QuestDB.Type.DQL,
        data: [{ id: "recovered" }],
      })
      const next = vi.fn()
      const error = vi.fn()
      const sub = getServerInfo(
        new ActionsObservable(actions$),
        state$ as StateObservable<StoreShape>,
        undefined,
      ).subscribe({ next, error })
      actions$.next({ type: TelemetryAT.START })
      await new Promise((resolve) => setTimeout(resolve, 0))
      actions$.next({ type: TelemetryAT.START })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockQuery).toHaveBeenCalledTimes(2)
      // The one-shot startup read may renew the session: nothing retries it.
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        "telemetry_config limit -1",
        { background: true },
      )
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        "telemetry_config limit -1",
        { background: true },
      )
      expect(error).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { id: "recovered" } }),
      )
      sub.unsubscribe()
    },
  )

  it("should schedule next check when lastUpdated is missing (skip path)", async () => {
    mockGetRemoteConfig.mockReturnValue(undefined)

    const action$ = of({
      type: TelemetryAT.SET_REMOTE_CONFIG,
      payload: {},
    })

    const state$ = new StateObservable(new Subject(), {})

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

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

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

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

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

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

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

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

    const epic$ = startTelemetry(
      action$ as ActionsObservable<StoreAction>,
      state$ as StateObservable<StoreShape>,
      undefined,
    )

    const sub = epic$.subscribe()

    await new Promise((resolve) => setTimeout(resolve, 50))
    sub.unsubscribe()
    // Verify the fetch was called
    expect(mockFromFetch).toHaveBeenCalled()
  })
})
