import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Dexie, { type Transaction } from "dexie"
import { toast } from "../../components/Toast"
import { Client } from "../questdb/client"
import { ssoAuthState } from "../../modules/OAuth2/ssoAuthState"
import { db } from "../../store/db"
import { bufferStore } from "../../store/buffers"
import { loadCellSnapshot, saveCellSnapshot } from "../../store/notebookResults"
import {
  runHeadlessCell,
  __resetNotebookHeadlessRunsForTests,
} from "./notebookHeadlessRun"
import {
  enqueueBufferTask,
  __resetNotebookBufferQueuesForTests,
} from "./notebookBufferQueue"
import { __resetNotebookDexieViewForTests } from "./notebookDexieView"
import {
  classifyStatements,
  clearStatementClassCache,
} from "../tools/permissions"
import * as requestLimiter from "../questdb/requestLimiter"
import { questClient } from "../questdb/queryClient"
import type { AuthPayload } from "../../modules/OAuth2/types"
import type { SingleQueryResult } from "../../store/notebook"

const BUFFER_ID = 7
const previous: SingleQueryResult[] = [
  {
    type: "dql",
    query: "select 1",
    columns: [{ name: "value", type: "INT" }],
    dataset: [[42]],
    count: 1,
  },
]
const token = (access_token = "old"): AuthPayload => ({
  access_token,
  refresh_token: "refresh",
  token_type: "Bearer",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
})
const response = () =>
  new Response(
    JSON.stringify({
      query: "select 1",
      columns: [{ name: "value", type: "INT" }],
      dataset: [[99]],
      count: 1,
    }),
  )
const makeRun = (client: Client, signal?: AbortSignal) =>
  runHeadlessCell(
    BUFFER_ID,
    {
      isBufferClaimed: () => false,
      getQuest: () => client,
      getBufferSeq: () => 0,
    },
    "cell",
    signal,
  )

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  clearStatementClassCache()
  await db.buffers.clear()
  await db.notebook_results.clear()
  await db.buffers.put({
    id: BUFFER_ID,
    label: "Background notebook",
    value: "",
    position: 0,
    notebookViewState: {
      cells: [
        {
          id: "cell",
          position: 0,
          value: "select 1",
          lastRunStatus: "success",
        },
      ],
    },
  })
  await saveCellSnapshot({
    bufferId: BUFFER_ID,
    cellId: "cell",
    results: previous,
    savedAt: 1,
  })
  ssoAuthState.setAuthPayload(token())
})

afterEach(() => {
  __resetNotebookHeadlessRunsForTests()
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieViewForTests()
  ssoAuthState.clearAuthPayload()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const expectPreviousResult = async () => {
  expect(
    (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0],
  ).toMatchObject({
    lastRunStatus: "success",
  })
  expect(
    (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0],
  ).not.toHaveProperty("lastRunAt")
  expect(await loadCellSnapshot(BUFFER_ID, "cell")).toMatchObject({
    results: previous,
    savedAt: 1,
  })
}

describe("headless notebook authentication sessions", () => {
  it.each(["response", "body"])(
    "preserves saved results when a delayed %s settles after refresh logout and re-login",
    async (phase) => {
      const client = new Client()
      client.setCommonHeaders({ Authorization: "Bearer old" })
      let finish!: () => void
      let started!: () => void
      const requestStarted = new Promise<void>((resolve) => {
        started = resolve
      })
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          started()
          if (phase === "response") {
            return new Promise<Response>((resolve) => {
              finish = () => resolve(response())
            })
          }
          const body = new Promise<string>((resolve) => {
            finish = () =>
              resolve(JSON.stringify({ columns: [], dataset: [], count: 0 }))
          })
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => body,
          } as Response)
        }),
      )
      const external = new AbortController()
      const run = makeRun(client, external.signal)
      await requestStarted
      vi.setSystemTime(Date.now() + 31_000)
      client.refreshTokenMethod = () => {
        ssoAuthState.clearAuthPayload()
        // Mirrors provider/MCP teardown after the headless claim has launched.
        external.abort()
        return Promise.resolve(undefined)
      }
      await expect(client.queryRaw("select 2")).rejects.toMatchObject({
        sessionEnded: true,
      })
      ssoAuthState.markNonSSOAuthenticated()
      client.setCommonHeaders({ Authorization: "Bearer new-user" })
      finish()
      const summary = await run
      expect(summary).toMatchObject({
        unverified: true,
        cancelled: "session_ended",
      })
      expect(summary.note).toMatch(/session.*ended/i)
      await expectPreviousResult()
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it("rechecks the session after waiting for the persistence queue", async () => {
    let finish!: (value: Response) => void
    let started!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        started()
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }),
    )
    const run = makeRun(new Client())
    await requestStarted
    let release!: () => void
    let queueStarted!: () => void
    const queueEntered = new Promise<void>((resolve) => {
      queueStarted = resolve
    })
    const blocker = enqueueBufferTask(BUFFER_ID, () => {
      queueStarted()
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await queueEntered
    finish(response())
    // Let the successful query enqueue its commit behind the blocker.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    ssoAuthState.clearAuthPayload()
    release()
    await blocker
    const summary = await run
    expect(summary).toMatchObject({
      unverified: true,
      cancelled: "session_ended",
    })
    expect(summary.note).toMatch(/session.*ended/i)
    await expectPreviousResult()
  })

  it("rechecks the session after the write transaction reads the notebook", async () => {
    const getById = bufferStore.getById.bind(bufferStore)
    let reads = 0
    vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
      getById(id).then((buffer) => {
        // Preparation, commit validation, then the transaction's own read.
        if (++reads === 3) ssoAuthState.clearAuthPayload()
        return buffer
      }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )

    expect(await makeRun(new Client())).toMatchObject({
      unverified: true,
      cancelled: "session_ended",
    })
    expect(reads).toBe(3)
    await expectPreviousResult()
  })

  it.each(["pending update", "completed update", "snapshot"])(
    "rolls back metadata and snapshot on logout during %s",
    async (phase) => {
      const previousError: SingleQueryResult[] = [
        { type: "error", query: "select 1", error: "Previous failure" },
      ]
      await bufferStore.update(BUFFER_ID, {
        notebookViewState: {
          cells: [
            {
              id: "cell",
              position: 0,
              value: "select 1",
              lastRunStatus: "error",
              lastRunError: "Previous failure",
            },
          ],
        },
      })
      await saveCellSnapshot({
        bufferId: BUFFER_ID,
        cellId: "cell",
        results: previousError,
        savedAt: 1,
      })
      const before = await db.buffers.get(BUFFER_ID)
      const update = bufferStore.update.bind(bufferStore)
      const put = db.notebook_results.put.bind(db.notebook_results)
      if (phase === "snapshot") {
        vi.spyOn(db.notebook_results, "put").mockImplementation(
          (snapshot, key) =>
            put(snapshot, key).then((result) => {
              ssoAuthState.clearAuthPayload()
              return result
            }),
        )
      } else {
        vi.spyOn(bufferStore, "update").mockImplementation((id, patch) => {
          const pending = update(id, patch)
          if (phase === "pending update") ssoAuthState.clearAuthPayload()
          return pending.then((count) => {
            if (phase === "completed update") ssoAuthState.clearAuthPayload()
            return count
          })
        })
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => Promise.resolve(response())),
      )

      const summary = await makeRun(new Client())

      expect(summary.unverified).toBe(true)
      expect(summary.note).toMatch(/session.*ended/i)
      expect(await db.buffers.get(BUFFER_ID)).toEqual(before)
      expect(await loadCellSnapshot(BUFFER_ID, "cell")).toMatchObject({
        results: previousError,
        savedAt: 1,
      })
    },
  )

  it("keeps the soft-success contract for a caught IndexedDB snapshot write error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )
    const put = db.notebook_results.put.bind(db.notebook_results)
    // NaN is a number in TypeScript but not a valid IndexedDB key. This
    // delegates to the real write/error handling, rather than rejecting a mock.
    vi.spyOn(db.notebook_results, "put").mockImplementationOnce((snapshot) =>
      put({ ...snapshot, bufferId: Number.NaN }),
    )
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const summary = await makeRun(new Client())

    expect(summary.success).toBe(true)
    expect(summary.unverified).toBeFalsy()
    expect(summary.note).toMatch(/No re-run is needed/)
    expect(
      (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0]
        .bottomHeight,
    ).toBeDefined()
  })

  it("falls back to metadata-only storage after the root snapshot transaction aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    const warning = vi.spyOn(toast, "error")
    const put = db.notebook_results.put.bind(db.notebook_results)
    vi.spyOn(db.notebook_results, "put").mockImplementationOnce(
      (snapshot, key) => {
        const transaction = Dexie.currentTransaction
        return put(snapshot, key).then((result) => {
          // The snapshot request succeeded; failure belongs to the encompassing
          // transaction, so the snapshot's promise cannot catch it.
          transaction.abort()
          return result
        })
      },
    )
    const summary = await makeRun(new Client())
    expect(summary.success).toBe(true)
    expect(summary.note).toMatch(/No re-run is needed/)
    expect(summary.unverified).toBeFalsy()
    const cell = (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0]
    expect(cell?.lastRunStatus).toBe("success")
    expect(typeof cell?.bottomHeight).toBe("number")
    expect((await loadCellSnapshot(BUFFER_ID, "cell"))?.results).toEqual(
      previous,
    )
    expect(warning).toHaveBeenCalled()
  })

  it("keeps the accepted metadata/snapshot pair when logout follows transaction completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )
    const logout = () => ssoAuthState.clearAuthPayload()
    const updating: Parameters<typeof db.buffers.hook.updating.subscribe>[0] = (
      _changes,
      _key,
      _buffer,
      transaction: Transaction,
    ) => {
      while (transaction.parent) transaction = transaction.parent
      transaction.on("complete", logout)
    }
    db.buffers.hook("updating", updating)
    try {
      await makeRun(new Client())

      expect(ssoAuthState.isAuthenticated()).toBe(false)
      expect(
        (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0]
          .lastRunStatus,
      ).toBe("success")
      expect(
        (await loadCellSnapshot(BUFFER_ID, "cell"))?.results[0],
      ).toMatchObject({ type: "dql", dataset: [[99]] })
    } finally {
      db.buffers.hook("updating").unsubscribe(updating)
    }
  })

  it("reports no execution when the session ends during queued preparation", async () => {
    let release!: () => void
    let started!: () => void
    const queued = new Promise<void>((resolve) => {
      started = resolve
    })
    const blocker = enqueueBufferTask(BUFFER_ID, () => {
      started()
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })
    await queued
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const run = makeRun(new Client())
    ssoAuthState.clearAuthPayload()
    release()
    await blocker
    const summary = await run
    expect(summary).toMatchObject({ success: false, queryCount: 0 })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
    expect(fetchMock).not.toHaveBeenCalled()
    await expectPreviousResult()
  })

  it("reports no execution when refresh ends the session before the first SQL send", async () => {
    vi.setSystemTime(Date.now() + 31_000)
    const client = new Client()
    client.refreshTokenMethod = () => {
      ssoAuthState.clearAuthPayload()
      return Promise.resolve(undefined)
    }
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const summary = await makeRun(client)
    expect(summary).toMatchObject({ success: false, queryCount: 0 })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
    expect(fetchMock).not.toHaveBeenCalled()
    await expectPreviousResult()
  })

  it("reports no execution when session aborts release a queued read's permit", async () => {
    await classifyStatements("select 1", () =>
      Promise.resolve({
        query: "select 1",
        columns: [],
        timestamp: 0,
      }),
    )
    let requestsStarted!: () => void
    const occupied = new Promise<void>((resolve) => {
      requestsStarted = resolve
    })
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      if (
        fetchMock.mock.calls.length ===
        requestLimiter.MAX_ACTIVE_STATEMENT_REQUESTS
      )
        requestsStarted()
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const background = Promise.allSettled(
      Array.from(
        { length: requestLimiter.MAX_ACTIVE_STATEMENT_REQUESTS },
        (_, index) =>
          requestLimiter.statementRequestLimiter(() =>
            questClient.queryRaw(`select ${index + 10}`),
          ),
      ),
    )
    await occupied

    let queued!: () => void
    const targetQueued = new Promise<void>((resolve) => {
      queued = resolve
    })
    const limit = requestLimiter.statementRequestLimiter
    vi.spyOn(requestLimiter, "statementRequestLimiter").mockImplementation(
      (task, signal) => {
        const result = limit(task, signal)
        queued()
        return result
      },
    )
    const external = new AbortController()
    const run = runHeadlessCell(
      BUFFER_ID,
      {
        isBufferClaimed: () => false,
        getQuest: () => questClient,
        getBufferSeq: () => 0,
      },
      "cell",
      external.signal,
      undefined,
      {
        kind: "explicit",
        permissions: {
          grantSchemaAccess: true,
          read: true,
          write: true,
        },
      },
    )
    await targetQueued
    ssoAuthState.endSession()
    await background
    const summary = await run
    expect(external.signal.aborted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(
      requestLimiter.MAX_ACTIVE_STATEMENT_REQUESTS,
    )
    expect(summary).toMatchObject({
      success: false,
      queryCount: 0,
      cancelled: "session_ended",
    })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
    await expectPreviousResult()
  })

  it("does not launch SQL when the session changes during validation", async () => {
    const client = new Client()
    let finish!: () => void
    let started!: () => void
    const validationStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.spyOn(client, "validateQuery").mockImplementation(() => {
      started()
      return new Promise((resolve) => {
        finish = () => resolve({ query: "select 1", columns: [], timestamp: 0 })
      })
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const run = runHeadlessCell(
      BUFFER_ID,
      {
        isBufferClaimed: () => false,
        getQuest: () => client,
        getBufferSeq: () => 0,
      },
      "cell",
      undefined,
      undefined,
      { kind: "autoRun" },
    )
    await validationStarted
    ssoAuthState.clearAuthPayload()
    ssoAuthState.markNonSSOAuthenticated()
    finish()
    const summary = await run
    expect(summary).toMatchObject({
      success: false,
      queryCount: 0,
      cancelled: "session_ended",
    })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
    expect(fetchMock).not.toHaveBeenCalled()
    await expectPreviousResult()
  })

  it("still saves results after a refresh within the same session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )
    vi.setSystemTime(Date.now() + 31_000)
    const client = new Client()
    client.refreshTokenMethod = () => {
      const refreshed = token("fresh")
      ssoAuthState.setAuthPayload(refreshed)
      return Promise.resolve(refreshed)
    }
    expect(await makeRun(client)).toMatchObject({ success: true })
    expect(
      (await loadCellSnapshot(BUFFER_ID, "cell"))?.results[0],
    ).toMatchObject({ type: "dql", dataset: [[99]] })
    expect(
      (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0]
        .lastRunStatus,
    ).toBe("success")
  })
})
