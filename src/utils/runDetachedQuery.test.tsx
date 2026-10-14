import "../test/stubBrowserGlobals"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  runDetachedQuery,
  type RunDetachedQueryConfig,
} from "./runDetachedQuery"
import {
  QueryAT,
  NotificationType,
  type QueryAction,
} from "../store/Query/types"
import { Client, Type } from "./questdb"
import { ssoAuthState } from "../modules/OAuth2/ssoAuthState"
import { eventBus } from "../modules/EventBus"
import { EventType } from "../modules/EventBus/types"
import reducer, { initialState } from "../store/Query/reducers"
import actions from "../store/Query/actions"
import type { AuthPayload } from "../modules/OAuth2/types"

vi.mock("../components", () => ({ Text: "span" }))
vi.mock("../scenes/Editor/Monaco/query-in-notification", () => ({
  QueryInNotification: "query-in-notification",
}))
vi.mock("../scenes/Editor/QueryResult", () => ({ default: "query-result" }))
vi.mock("../modules/EventBus", () => ({
  eventBus: { publish: vi.fn() },
}))

let config: RunDetachedQueryConfig
const queryRaw = vi.fn()
const dispatch = vi.fn<[QueryAction], void>()
const releaseExecution = vi.fn()
const onSettled = vi.fn()
const onQueryStarted = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  config = {
    normalizedSQL: "select 42",
    queryKey: "select 42@0-0",
    namespaceKey: "chat",
    quest: { queryRaw } as unknown as RunDetachedQueryConfig["quest"],
    dispatch: (action) => {
      dispatch(action)
      return action
    },
    executionRefs: { current: {} },
    releaseExecution,
    onSettled,
    onQueryStarted,
  }
})

afterEach(() => {
  ssoAuthState.clearAuthPayload()
  Client.__resetRefreshStateForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const expectSettled = () => {
  expect(onQueryStarted).toHaveBeenCalledOnce()
  expect(onQueryStarted).toHaveBeenCalledWith(1)
  expect(onSettled).toHaveBeenCalledOnce()
  expect(releaseExecution).toHaveBeenCalledOnce()
  expect(releaseExecution).toHaveBeenCalledWith(config.queryKey)
}

// Detached runs are used by the Run action on AI chat SQL blocks.
describe("runDetachedQuery", () => {
  it("suppresses session-ended notifications without skipping execution cleanup", async () => {
    queryRaw.mockReturnValue({
      queryId: 1,
      promise: Promise.reject({
        error: "Your session has ended. Please sign in again.",
        sessionEnded: true,
      }),
    })

    await runDetachedQuery(config)

    expect(dispatch.mock.calls).toEqual([
      [actions.settleLoadingNotification(config.namespaceKey, 1)],
    ])
    expect(config.executionRefs.current).toEqual({})
    expectSettled()
  })

  it.each([
    [{ error: "Invalid column", position: 7 }, "Invalid column"],
    [new Error("Network failure"), "Network failure"],
    [{ error: "Unauthorized", status: 401 }, "Unauthorized"],
  ])("still reports ordinary query errors: %s", async (error, message) => {
    queryRaw.mockReturnValue({ queryId: 1, promise: Promise.reject(error) })

    await runDetachedQuery(config)

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: QueryAT.ADD_NOTIFICATION,
      payload: {
        query: config.queryKey,
        bufferId: config.namespaceKey,
        type: NotificationType.ERROR,
        content: <span color="statusDanger">{message}</span>,
      },
    })
    expect(config.executionRefs.current.chat[config.queryKey]).toEqual({
      success: false,
      queryText: config.normalizedSQL,
      startOffset: -1,
      endOffset: -1,
    })
    expectSettled()
  })

  it("still publishes a successful query result and releases its execution", async () => {
    const result = {
      type: Type.DQL,
      query: "select 42",
      columns: [{ name: "42", type: "INT" }],
      dataset: [[42]],
      count: 1,
    }
    queryRaw.mockReturnValue({ queryId: 1, promise: Promise.resolve(result) })

    await runDetachedQuery(config)

    expect(dispatch).toHaveBeenCalledWith({
      type: QueryAT.SET_RESULT,
      payload: result,
    })
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: QueryAT.ADD_NOTIFICATION,
      payload: { type: NotificationType.SUCCESS },
    })
    expect(config.executionRefs.current.chat[config.queryKey].success).toBe(
      true,
    )
    expectSettled()
  })

  it.each(["response", "body"])(
    "discards an old session's delayed %s after refresh logout and password re-login",
    async (phase) => {
      vi.useFakeTimers()
      const issue = (): AuthPayload => ({
        access_token: "old-user",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      ssoAuthState.setAuthPayload(issue())
      const client = new Client()
      client.setCommonHeaders({ Authorization: "Bearer old-user" })
      const result = {
        query: config.normalizedSQL,
        columns: [{ name: "private_value", type: "INT" }],
        dataset: [[42]],
        count: 1,
      }
      let finish!: () => void
      const pending = new Promise<Response>((resolve) => {
        if (phase === "response") {
          finish = () => resolve(new Response(JSON.stringify(result)))
        } else {
          const text = new Promise<string>((resolveBody) => {
            finish = () => resolveBody(JSON.stringify(result))
          })
          resolve({ ok: true, status: 200, text: () => text } as Response)
        }
      })
      const fetchMock = vi.fn().mockReturnValue(pending)
      vi.stubGlobal("fetch", fetchMock)
      config.quest = client
      const execution = runDetachedQuery(config)
      await vi.advanceTimersByTimeAsync(31_000)
      client.refreshTokenMethod = vi.fn(() => {
        ssoAuthState.clearAuthPayload()
        return Promise.resolve(undefined)
      })
      await expect(client.queryRaw("query_activity()")).rejects.toMatchObject({
        sessionEnded: true,
      })
      ssoAuthState.markNonSSOAuthenticated()
      client.setCommonHeaders({ Authorization: "Bearer new-user" })
      finish()
      await execution

      expect(dispatch.mock.calls).toEqual([
        [actions.settleLoadingNotification(config.namespaceKey, 1)],
      ])
      expect(config.executionRefs.current).toEqual({})
      expect(
        vi
          .mocked(eventBus)
          .publish.mock.calls.some(
            ([type]) => type === EventType.MSG_QUERY_DATASET,
          ),
      ).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expectSettled()
    },
  )

  it("settles already-published loading state on session end", async () => {
    let state = reducer(
      initialState,
      actions.addNotification(
        {
          query: config.queryKey,
          queryId: 1,
          type: NotificationType.LOADING,
          content: "Running…",
        },
        config.namespaceKey,
      ),
    )
    config.dispatch = (action) => {
      state = reducer(state, action)
      return action
    }
    queryRaw.mockReturnValue({
      queryId: 1,
      promise: Promise.reject({ sessionEnded: true }),
    })

    await runDetachedQuery(config)

    expect(state.notifications).toEqual([])
    expect(state.activeNotification).toBeNull()
    expect(state.queryNotifications.chat[config.queryKey]).toBeUndefined()
    expectSettled()
  })

  it("discards errors from an ended session and preserves newer loading state", async () => {
    let reject!: (error: unknown) => void
    queryRaw.mockReturnValue({
      queryId: 1,
      promise: new Promise((_, rejectQuery) => {
        reject = rejectQuery
      }),
    })
    let state = reducer(
      initialState,
      actions.addNotification(
        {
          query: config.queryKey,
          queryId: 2,
          type: NotificationType.LOADING,
          content: "New execution",
        },
        config.namespaceKey,
      ),
    )
    const current = state
    config.dispatch = (action) => {
      state = reducer(state, action)
      return action
    }
    const execution = runDetachedQuery(config)
    ssoAuthState.clearAuthPayload()
    ssoAuthState.markNonSSOAuthenticated()
    reject({ error: "Old request failed" })
    await execution

    expect(state).toBe(current)
    expect(config.executionRefs.current).toEqual({})
    expectSettled()
  })

  it("still publishes after a background refresh in the same session", async () => {
    ssoAuthState.setAuthPayload({ access_token: "old", token_type: "Bearer" })
    const result = { type: Type.DML as const, query: config.normalizedSQL }
    queryRaw.mockReturnValue({ queryId: 1, promise: Promise.resolve(result) })
    const execution = runDetachedQuery(config)
    ssoAuthState.setAuthPayload({ access_token: "fresh", token_type: "Bearer" })
    await execution

    expect(dispatch).toHaveBeenCalledWith(actions.setResult(result))
    expectSettled()
  })
})
