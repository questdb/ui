import "../../test/stubBrowserGlobals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
import { clearStatementClassCache } from "../tools/permissions"
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
  Client.__resetRefreshStateForTests()
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
      expect(summary).toMatchObject({ unverified: true })
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
    expect(summary).toMatchObject({ unverified: true })
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

    expect(await makeRun(new Client())).toMatchObject({ unverified: true })
    expect(reads).toBe(3)
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
    expect(await run).toMatchObject({ unverified: true })
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
