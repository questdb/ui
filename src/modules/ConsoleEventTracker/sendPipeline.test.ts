import "fake-indexeddb/auto"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import type { MockInstance } from "vitest"

// Stub browser globals before db.ts singleton is created
vi.hoisted(() => {
  const storage: Record<string, string> = {}
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value
    },
    removeItem: (key: string) => {
      delete storage[key]
    },
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k])
    },
    get length() {
      return Object.keys(storage).length
    },
    key: () => null,
  } as Storage

  globalThis.window = globalThis as unknown as Window & typeof globalThis
  ;(globalThis as Record<string, unknown>).location = {
    href: "http://localhost/",
  }
  ;(globalThis as Record<string, unknown>).history = {
    replaceState: () => {},
  }
})

vi.mock("../../consts", () => ({
  API: "https://test.questdb.io",
}))

import { db } from "../../store/db"
import { _internals, startPipeline, stopPipeline } from "./sendPipeline"

let fetchSpy: MockInstance<
  [input: RequestInfo | URL, init?: RequestInit],
  Promise<Response>
>

const mockConfig = {
  id: "test-id",
  version: "1.0.0",
  os: "linux",
  package: "docker",
  enabled: true,
  instance_name: "",
  instance_type: "",
  instance_desc: "",
}

const mockCheckLatestResponse = (lastUpdated: number | null) =>
  new Response(
    JSON.stringify({
      lastUpdated:
        lastUpdated !== null ? new Date(lastUpdated).toISOString() : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )

const mockSendResponse = (status: number) => new Response(null, { status })

// After a successful send+cleanup, run() exits (one batch per run).
const mockFullCycle = () => {
  fetchSpy
    .mockResolvedValueOnce(mockCheckLatestResponse(0)) // checkLatest
    .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries
}

let originalBackoff: typeof _internals.backoff

beforeEach(async () => {
  await db.events.clear()
  _internals.resetState()
  fetchSpy = vi
    .spyOn(global, "fetch")
    .mockRejectedValue(new Error("unmocked fetch"))

  // Replace backoff with a no-op so tests run instantly
  originalBackoff = _internals.backoff
  _internals.backoff = async () => {}

  vi.spyOn(globalThis.localStorage, "getItem").mockReturnValue("test-client-id")
  vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {})
})

afterEach(() => {
  stopPipeline()
  _internals.backoff = originalBackoff
  vi.restoreAllMocks()
})

describe("run — happy path", () => {
  it("sends events and cleans up IDB", async () => {
    await db.events.add({ created: 100, name: "query.exec" })
    await db.events.add({ created: 200, name: "chart.draw" })

    mockFullCycle()

    _internals.setConfig(mockConfig)
    await _internals.run()

    // checkLatest + sendEntries
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    const sendCall = fetchSpy.mock.calls[1]
    const body = JSON.parse(sendCall[1]?.body as string) as {
      id: string
      client_id: string
      events: Array<{ created: number; name: string }>
    }
    expect(body.events).toHaveLength(2)
    expect(body.id).toBe("test-id")
    expect(body.client_id).toBe("test-client-id")
    expect(await db.events.count()).toBe(0)
  })

  it("cursor filtering: only sends events after cursor", async () => {
    await db.events.add({ created: 100, name: "a" })
    await db.events.add({ created: 200, name: "b" })
    await db.events.add({ created: 300, name: "c" })

    fetchSpy
      .mockResolvedValueOnce(mockCheckLatestResponse(200))
      .mockResolvedValueOnce(mockSendResponse(200))
      .mockResolvedValueOnce(mockCheckLatestResponse(300)) // 2nd pass, empty

    _internals.setConfig(mockConfig)
    await _internals.run()

    const sendCall = fetchSpy.mock.calls[1]
    const body = JSON.parse(sendCall[1]?.body as string) as {
      events: Array<{ created: number; name: string }>
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0].name).toBe("c")
  })

  it("empty IDB: only calls checkLatest once", async () => {
    fetchSpy.mockResolvedValueOnce(mockCheckLatestResponse(0))

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe("run — checkLatest backoff", () => {
  it("retries checkLatest on failure then succeeds", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockRejectedValueOnce(new Error("Network error")) // checkLatest fail
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // checkLatest ok
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(await db.events.count()).toBe(0)
  })

  it("checkLatest 4xx retries with backoff", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 403 })) // checkLatest 4xx
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // checkLatest ok
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(await db.events.count()).toBe(0)
  })

  it("checkLatest NaN cursor retries with backoff", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ lastUpdated: "not-a-number" }), {
          status: 200,
        }),
      ) // checkLatest NaN → treated as failure
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // checkLatest ok
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(await db.events.count()).toBe(0)
  })
})

describe("run — sendEntries backoff (independent from checkLatest)", () => {
  it("sendEntries failure restarts from checkLatest", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 1st checkLatest ok
      .mockRejectedValueOnce(new Error("Network error")) // sendEntries fail
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 2nd checkLatest ok (restart)
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(_internals.sendAttempt).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    expect(await db.events.count()).toBe(0)
  })

  it("sendEntries 5xx restarts from checkLatest", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 1st checkLatest
      .mockResolvedValueOnce(mockSendResponse(500)) // sendEntries 5xx
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 2nd checkLatest
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 3rd checkLatest, empty

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.sendAttempt).toBe(0)
    expect(await db.events.count()).toBe(0)
  })

  it("sendEntries 4xx retries with backoff", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 1st checkLatest
      .mockResolvedValueOnce(mockSendResponse(400)) // sendEntries 4xx
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 2nd checkLatest
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 3rd checkLatest, empty

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.sendAttempt).toBe(0)
    expect(await db.events.count()).toBe(0)
  })

  it("checkLatest failures don't affect sendEntries backoff", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy
      .mockRejectedValueOnce(new Error("check fail")) // checkLatest fail
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // checkLatest ok
      .mockResolvedValueOnce(mockSendResponse(200)) // sendEntries ok

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(_internals.sendAttempt).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

describe("run — IDB cleanup failure", () => {
  it("IDB cleanup failure does not affect backoff", async () => {
    await db.events.add({ created: 100, name: "a" })

    // 1st pass: send ok, cleanup fails → entry stays in IDB
    // 2nd pass: send ok (re-sent), cleanup ok → entry removed
    // 3rd pass: checkLatest → empty → break
    fetchSpy
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 1st checkLatest
      .mockResolvedValueOnce(mockSendResponse(200)) // 1st sendEntries
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 2nd checkLatest
      .mockResolvedValueOnce(mockSendResponse(200)) // 2nd sendEntries (re-send)
      .mockResolvedValueOnce(mockCheckLatestResponse(0)) // 3rd checkLatest, empty

    // Sabotage IDB cleanup only on first call
    const deleteSpy = vi
      .spyOn(await import("./db"), "deleteEntriesUpTo")
      .mockResolvedValueOnce(-1)

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(_internals.checkAttempt).toBe(0)
    expect(_internals.sendAttempt).toBe(0)

    deleteSpy.mockRestore()
  })
})

describe("run — stopPipeline", () => {
  it("stops retrying when stopPipeline is called", async () => {
    await db.events.add({ created: 100, name: "a" })

    // checkLatest hangs until we release it
    let rejectFetch: (reason: Error) => void = () => {}
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>((_, reject) => {
          rejectFetch = reject
        }),
    )

    _internals.setConfig(mockConfig)
    const runPromise = _internals.run()

    // Let run() proceed past backoff(0) and reach the hanging fetch
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    // Now stop — run() is suspended inside checkLatest
    stopPipeline()
    // Unblock the fetch so the catch fires and the loop sees stopped=true
    rejectFetch(new Error("aborted"))
    await runPromise

    expect(_internals.stopped).toBe(true)
  })
})

describe("run — ongoing guard", () => {
  it("second run() is a no-op while first is in progress", async () => {
    await db.events.add({ created: 100, name: "a" })

    // First checkLatest hangs until we resolve it
    let resolveFirst: (value: Response) => void = () => {}
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolveFirst = r
        }),
    )

    _internals.setConfig(mockConfig)
    const firstRun = _internals.run()

    // Second run should return immediately (ongoing guard)
    await _internals.run()

    // Resolve first run's checkLatest, then let it complete
    fetchSpy.mockResolvedValueOnce(mockSendResponse(200))
    resolveFirst(mockCheckLatestResponse(0))
    await firstRun

    // Only the first run made fetch calls
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await db.events.count()).toBe(0)
  })
})

describe("run — no config", () => {
  it("returns immediately without config", async () => {
    await _internals.run()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("returns immediately without config.id", async () => {
    _internals.setConfig({ ...mockConfig, id: "" })
    await _internals.run()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("run — max attempts", () => {
  it("kills pipeline after MAX_RETRIES consecutive checkLatest failures", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy.mockRejectedValue(new Error("Network error"))

    _internals.setConfig(mockConfig)
    await _internals.run()

    expect(fetchSpy).toHaveBeenCalledTimes(_internals.MAX_RETRIES + 1)
    expect(_internals.stopped).toBe(true)
  })

  it("kills pipeline after MAX_RETRIES consecutive sendEntries failures", async () => {
    await db.events.add({ created: 100, name: "a" })

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : ((input as Request).url ?? String(input))
      if (url.includes("console-events-config")) {
        return Promise.resolve(
          new Response(JSON.stringify({ lastUpdated: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }
      return Promise.reject(new Error("send failed"))
    })

    _internals.setConfig(mockConfig)
    await _internals.run()

    // Each iteration: checkLatest + sendEntries
    expect(fetchSpy).toHaveBeenCalledTimes((_internals.MAX_RETRIES + 1) * 2)
    expect(_internals.stopped).toBe(true)
  })
})

describe("getClientId", () => {
  it("returns existing client ID from localStorage", () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis.localStorage, "getItem").mockReturnValue(
      "existing-uuid",
    )
    expect(_internals.getClientId()).toBe("existing-uuid")
  })

  it("generates and stores new UUID when absent", () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis.localStorage, "getItem").mockReturnValue(null)
    const setItemSpy = vi.spyOn(globalThis.localStorage, "setItem")

    const clientId = _internals.getClientId()

    expect(clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(setItemSpy).toHaveBeenCalledWith("client.id", clientId)
  })
})
