import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Dexie, { type Transaction } from "dexie"
import { toast } from "../../components/Toast"
import { Client } from "../questdb/client"
import { authSessionState } from "../../modules/OAuth2/authSessionState"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { db } from "../../store/db"
import { bufferStore } from "../../store/buffers"
import {
  loadCellSnapshot,
  saveCellSnapshot,
  type NotebookResultSnapshot,
} from "../../store/notebookResults"
import * as notebookResults from "../../store/notebookResults"
import {
  runHeadlessCell,
  cancelHeadlessCellRuns,
  __resetNotebookHeadlessRunsForTests,
  SESSION_INTERRUPTED_RUN_NOTE,
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
  authSessionState.setAuthPayload(token())
})

afterEach(() => {
  __resetNotebookHeadlessRunsForTests()
  __resetNotebookBufferQueuesForTests()
  __resetNotebookDexieViewForTests()
  authSessionState.endSession()
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

const expectInterruptedResult = async () => {
  const cell = (await db.buffers.get(BUFFER_ID))?.notebookViewState?.cells[0]
  expect(cell).toMatchObject({
    lastRunStatus: "error",
    lastRunError: SESSION_INTERRUPTED_RUN_NOTE,
  })
  expect(cell?.result).toBeUndefined()
  expect(await loadCellSnapshot(BUFFER_ID, "cell")).toBeUndefined()
  expect(JSON.stringify(cell)).not.toContain("private_value")
}

describe("headless notebook authentication sessions", () => {
  it.each(["success", "session ended", "skipped"])(
    "does not hydrate old snapshot payloads for a headless run: %s",
    async (outcome) => {
      if (outcome === "skipped") {
        await db.buffers.update(BUFFER_ID, {
          notebookViewState: {
            cells: [{ id: "cell", position: 0, value: "", type: "markdown" }],
          },
        })
      }
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          if (outcome === "session ended") authSessionState.endSession()
          return Promise.resolve(response())
        }),
      )
      const reading = vi.fn((snapshot: NotebookResultSnapshot) => snapshot)
      const revisionRead = vi.spyOn(notebookResults, "loadCellSnapshotSavedAt")
      db.notebook_results.hook("reading", reading)
      try {
        const summary = await makeRun(new Client())
        if (outcome === "session ended") {
          expect(summary.note).toContain("interruption marker was saved")
        } else if (outcome === "success") {
          expect(summary.success).toBe(true)
        } else {
          expect(fetch).not.toHaveBeenCalled()
        }
        expect(revisionRead).toHaveBeenCalledTimes(
          outcome === "session ended" ? 2 : 1,
        )
        expect(reading).not.toHaveBeenCalled()
      } finally {
        db.notebook_results.hook("reading").unsubscribe(reading)
      }
    },
  )

  it.each(["response", "body"])(
    "replaces stale success with an interruption marker when a delayed %s settles after refresh logout and re-login",
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
        authSessionState.endSession()
        // Mirrors provider/MCP teardown after the headless claim has launched.
        external.abort()
        return Promise.resolve(undefined)
      }
      await expect(client.queryRaw("select 2")).rejects.toMatchObject({
        sessionEnded: true,
      })
      authSessionState.markNonSSOAuthenticated()
      client.setCommonHeaders({ Authorization: "Bearer new-user" })
      finish()
      const summary = await run
      expect(summary).toMatchObject({
        success: false,
        queryCount: 1,
        results: ["ERROR: execution outcome unverified"],
        unverified: true,
        cancelled: "session_ended",
      })
      expect(summary.note).toMatch(/session.*ended/i)
      await expectInterruptedResult()
      expect(summary.note).toContain("interruption marker was saved")
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    {
      kind: "confirmed write",
      sql: "insert into private_table values (1)",
      body: { dml: true },
      status: "success",
    },
    {
      kind: "confirmed read",
      sql: "select * from private_table",
      body: {
        columns: [{ name: "private_column", type: "STRING" }],
        dataset: [["private_value"]],
        count: 1,
      },
      status: "success",
    },
    {
      kind: "notice",
      sql: "select * from private_table",
      body: { notice: "private server notice" },
      status: "success",
    },
    {
      kind: "confirmed error",
      sql: "select * from private_table",
      body: { error: "private server error" },
      status: "ERROR: query failed",
    },
  ])(
    "preserves status-only $kind history after waiting for the persistence queue",
    async ({ sql, body, status }) => {
      await bufferStore.update(BUFFER_ID, {
        notebookViewState: {
          cells: [
            { id: "cell", position: 0, value: sql, lastRunStatus: "success" },
          ],
        },
      })
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
      finish(new Response(JSON.stringify(body)))
      // Let the accepted query outcome enqueue its commit behind the blocker.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      authSessionState.endSession()
      release()
      await blocker
      const summary = await run
      const { note, ...execution } = summary
      expect(execution).toEqual({
        success: false,
        queryCount: 1,
        results: [status],
        unverified: true,
        cancelled: "session_ended",
      })
      expect(note).toMatch(/session.*ended/i)
      expect(JSON.stringify(summary)).not.toContain("private")
      await expectInterruptedResult()
      expect(summary.note).toContain("interruption marker was saved")
    },
  )

  it("keeps a confirmed script prefix when logout stops the next statement", async () => {
    await bufferStore.update(BUFFER_ID, {
      notebookViewState: {
        cells: [
          {
            id: "cell",
            position: 0,
            value:
              "insert into private_table values (1); insert into private_table values (2);",
            lastRunStatus: "success",
          },
        ],
      },
    })
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith("api/v1/sql/validate")
              ? { queryType: "INSERT" }
              : { dml: true },
          ),
        ),
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    // A write has been accepted before the schema event is published. Logout
    // here stops the next statement, not the already-confirmed outcome.
    const logout = () => authSessionState.endSession()
    eventBus.subscribe(EventType.MSG_QUERY_SCHEMA, logout)
    try {
      expect(await makeRun(new Client())).toMatchObject({
        success: false,
        queryCount: 2,
        results: ["success", "cancelled"],
        cancelled: "session_ended",
        unverified: true,
      })
      const sqlCalls = fetchMock.mock.calls.filter(([url]) =>
        url.startsWith("exec?"),
      )
      expect(sqlCalls).toHaveLength(1)
      expect(decodeURIComponent(sqlCalls[0][0])).toContain("values (1)")
      await expectInterruptedResult()
    } finally {
      eventBus.unsubscribe(EventType.MSG_QUERY_SCHEMA, logout)
    }
  })

  it.each([
    "edit",
    "mount",
    "user action",
    "new snapshot",
    "created snapshot",
    "deleted snapshot",
    "delete",
    "archive",
  ])(
    "does not overwrite %s with a late interruption marker",
    async (change) => {
      if (change === "created snapshot") {
        await db.notebook_results.delete([BUFFER_ID, "cell"])
      }
      let finish!: (response: Response) => void
      const request = new Promise<Response>((resolve) => {
        finish = resolve
      })
      // The fetch closure is called only after this setup has completed.
      let started!: () => void
      const began = new Promise<void>((resolve) => {
        started = resolve
      })
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          started()
          return request
        }),
      )
      let claimed = false
      let seq = 0
      const run = runHeadlessCell(
        BUFFER_ID,
        {
          isBufferClaimed: () => claimed,
          getQuest: () => new Client(),
          getBufferSeq: () => seq,
        },
        "cell",
      )
      await began
      let release!: () => void
      let entered!: () => void
      const queued = new Promise<void>((resolve) => {
        entered = resolve
      })
      const blocker = enqueueBufferTask(BUFFER_ID, () => {
        entered()
        return new Promise<void>((resolve) => {
          release = resolve
        })
      })
      await queued
      finish(response())
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (change === "mount") claimed = true
      if (change === "user action") seq++
      if (change === "edit")
        await bufferStore.update(BUFFER_ID, {
          notebookViewState: {
            cells: [{ id: "cell", position: 0, value: "select 777" }],
          },
        })
      if (change === "delete") await db.buffers.delete(BUFFER_ID)
      if (change === "archive")
        await bufferStore.update(BUFFER_ID, { archived: true })
      if (change === "deleted snapshot")
        await db.notebook_results.delete([BUFFER_ID, "cell"])
      if (change === "new snapshot" || change === "created snapshot")
        await saveCellSnapshot({
          bufferId: BUFFER_ID,
          cellId: "cell",
          results: previous,
          savedAt: 2,
        })
      const before = await db.buffers.get(BUFFER_ID)
      const snapshotBefore = await loadCellSnapshot(BUFFER_ID, "cell")
      authSessionState.endSession()
      authSessionState.markNonSSOAuthenticated()
      release()
      await blocker
      const summary = await run
      expect(summary.note).not.toContain("interruption marker was saved")
      expect(await db.buffers.get(BUFFER_ID)).toEqual(before)
      expect(await loadCellSnapshot(BUFFER_ID, "cell")).toEqual(snapshotBefore)
    },
  )

  it("rechecks the session after the write transaction reads the notebook", async () => {
    const getById = bufferStore.getById.bind(bufferStore)
    let reads = 0
    vi.spyOn(bufferStore, "getById").mockImplementation((id) =>
      getById(id).then((buffer) => {
        // Preparation, commit validation, then the transaction's own read.
        if (++reads === 3) authSessionState.endSession()
        return buffer
      }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )

    expect(await makeRun(new Client())).toMatchObject({
      queryCount: 1,
      results: ["success"],
      unverified: true,
      cancelled: "session_ended",
    })
    expect(reads).toBe(5) // Includes the fresh marker transaction's read and commit.
    await expectInterruptedResult()
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
      const update = bufferStore.update.bind(bufferStore)
      const put = db.notebook_results.put.bind(db.notebook_results)
      if (phase === "snapshot") {
        vi.spyOn(db.notebook_results, "put").mockImplementation(
          (snapshot, key) =>
            put(snapshot, key).then((result) => {
              authSessionState.endSession()
              return result
            }),
        )
      } else {
        vi.spyOn(bufferStore, "update").mockImplementation((id, patch) => {
          const pending = update(id, patch)
          if (phase === "pending update") authSessionState.endSession()
          return pending.then((count) => {
            if (phase === "completed update") authSessionState.endSession()
            return count
          })
        })
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => Promise.resolve(response())),
      )

      const summary = await makeRun(new Client())

      expect(summary).toMatchObject({
        queryCount: 1,
        results: ["success"],
        cancelled: "session_ended",
        unverified: true,
      })
      expect(summary.note).toMatch(/session.*ended/i)
      // The data-bearing pair rolls back; only a generic interruption marker
      // is subsequently accepted, atomically deleting the previous snapshot.
      await expectInterruptedResult()
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

  it.each(["mounted", "superseded"] as const)(
    "reports %s instead of user_changed after a root commit failure",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => Promise.resolve(response())),
      )
      vi.spyOn(console, "error").mockImplementation(() => {})
      let mounted = false
      const put = db.notebook_results.put.bind(db.notebook_results)
      vi.spyOn(db.notebook_results, "put").mockImplementationOnce(
        (snapshot, key) => {
          const transaction = Dexie.currentTransaction
          return put(snapshot, key).then((result) => {
            if (reason === "mounted") mounted = true
            else cancelHeadlessCellRuns(BUFFER_ID, ["cell"], "superseded")
            transaction.abort()
            return result
          })
        },
      )
      const client = new Client()
      const summary = await runHeadlessCell(
        BUFFER_ID,
        {
          isBufferClaimed: () => mounted,
          getQuest: () => client,
          getBufferSeq: () => 0,
        },
        "cell",
      )
      if (reason === "mounted")
        expect(summary.note).toContain("opened this notebook")
      else expect(summary.cancelled).toBe("superseded")
      expect(summary.note).not.toContain("user changed")
    },
  )

  it.each([{ notice: "private notice" }, { error: "private error" }])(
    "redacts details if logout follows commit completion: %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(body)))),
      )
      const updating: Parameters<
        typeof db.buffers.hook.updating.subscribe
      >[0] = (_changes, _key, _buffer, transaction: Transaction) => {
        while (transaction.parent) transaction = transaction.parent
        transaction.on("complete", () => authSessionState.endSession())
      }
      db.buffers.hook("updating", updating)
      try {
        const summary = await makeRun(new Client())
        expect(summary).toMatchObject({
          cancelled: "session_ended",
          unverified: true,
        })
        expect(JSON.stringify(summary)).not.toContain("private")
      } finally {
        db.buffers.hook("updating").unsubscribe(updating)
      }
    },
  )

  it("keeps the accepted metadata/snapshot pair when logout follows transaction completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response())),
    )
    const logout = () => authSessionState.endSession()
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
      const summary = await makeRun(new Client())
      expect(summary.note).toContain("Run history was recorded")
      expect(summary.note).not.toContain("not saved")
      expect(authSessionState.isAuthenticated()).toBe(false)
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
    authSessionState.endSession()
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
      authSessionState.endSession()
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

  it("reports no execution with validation errors when refresh ends before SQL is sent", async () => {
    await db.buffers.update(BUFFER_ID, {
      notebookViewState: {
        cells: [
          {
            id: "cell",
            position: 0,
            value: "select * from missing_table; select 1;",
            lastRunStatus: "success",
          },
        ],
      },
    })
    vi.setSystemTime(Date.now() + 31_000)
    const client = new Client()
    client.refreshTokenMethod = () => {
      authSessionState.endSession()
      return Promise.resolve(undefined)
    }
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain("api/v1/sql/validate")
      const query = new URL(url, "http://test").searchParams.get("query")!
      return Promise.resolve(
        query.includes("missing_table")
          ? new Response(
              JSON.stringify({
                query,
                error: "table does not exist",
                position: 14,
              }),
              { status: 400 },
            )
          : new Response(JSON.stringify({ query, columns: [], timestamp: 0 })),
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const summary = await makeRun(client)
    // Validation now shares the SQL refresh gate, so expiry prevents even
    // these non-query requests from leaving with the rejected bearer.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(summary).toMatchObject({
      success: false,
      queryCount: 0,
      cancelled: "session_ended",
    })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
    await expectPreviousResult()
  })

  it("reports no execution for validation-only errors after waiting for the persistence queue", async () => {
    await db.buffers.update(BUFFER_ID, {
      notebookViewState: {
        cells: [
          {
            id: "cell",
            position: 0,
            value: "select * from missing_one; select * from missing_two;",
            lastRunStatus: "success",
          },
        ],
      },
    })
    let release!: () => void
    let blocker: Promise<void> | undefined
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain("api/v1/sql/validate")
      // Preparation already released the buffer queue. Delay the result commit
      // until after logout, without ever sending an execution request.
      blocker ??= enqueueBufferTask(
        BUFFER_ID,
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "table does not exist",
            position: 14,
            query: new URL(url, "http://test").searchParams.get("query"),
          }),
          { status: 400 },
        ),
      )
    })
    vi.stubGlobal("fetch", fetchMock)
    const run = makeRun(new Client())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    authSessionState.endSession()
    release()
    await blocker
    const summary = await run
    expect(summary).toMatchObject({
      success: false,
      queryCount: 0,
      cancelled: "session_ended",
    })
    expect(summary).not.toHaveProperty("unverified")
    expect(summary.note).toContain("nothing was executed")
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
    authSessionState.endSession()
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
    authSessionState.endSession()
    authSessionState.markNonSSOAuthenticated()
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
      authSessionState.setAuthPayload(refreshed)
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
