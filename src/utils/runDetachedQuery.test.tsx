import "../test/stubBrowserGlobals"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  runDetachedQuery,
  type RunDetachedQueryConfig,
} from "./runDetachedQuery"
import {
  QueryAT,
  NotificationType,
  type QueryAction,
} from "../store/Query/types"
import { Type } from "./questdb"

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

    expect(dispatch).not.toHaveBeenCalled()
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

    expect(dispatch).toHaveBeenCalledOnce()
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
})
