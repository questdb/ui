import { describe, it, expect } from "vitest"
import query, { initialState } from "./reducers"
import actions from "./actions"
import selectors from "./selectors"
import type { StoreShape } from "../../types"
import { RunningType } from "../../types"
import { NotificationType } from "./types"
import type { QueryKey, QueryNotifications, QueryStateShape } from "./types"
import { Type } from "../../utils/questdb"
import {
  queryExecutionKey,
  MAX_TRACKED_QUERY_EXECUTIONS,
} from "../../utils/queryExecutionKey"

it("ties transfer metadata to the displayed result and clears it with the result", () => {
  const result = {
    type: Type.DQL as const,
    query: "select 1",
    columns: [],
    dataset: [],
    count: 0,
    error: undefined,
    notice: undefined,
    timings: { compiler: 0, authentication: 0, count: 0, execute: 0, fetch: 0 },
  }
  const fromEditor = query(initialState, actions.setResult(result, 7, 42))
  expect(fromEditor.resultSource).toEqual({ bufferId: 7, fetchedAt: 42 })
  const withBatch = query(
    fromEditor,
    actions.setBatchTransfer({
      bufferId: 7,
      queries: [{ sql: "select 1" }, { sql: "select 2" }],
      writeCount: 0,
      hasAllResults: false,
    }),
  )
  const fromConversation = query(
    withBatch,
    actions.setResult(result, undefined, 99),
  )
  expect(fromConversation.resultSource).toEqual({
    bufferId: undefined,
    fetchedAt: 99,
  })
  expect(fromConversation.batchTransfer).toBeUndefined()
  expect(
    query(fromConversation, actions.setResult(undefined)).resultSource,
  ).toBeUndefined()
})

it("clears a script's batch transfer when the next run starts", () => {
  const withBatch = query(
    initialState,
    actions.setBatchTransfer({
      bufferId: 7,
      queries: [{ sql: "select 1" }, { sql: "select 2" }],
      writeCount: 0,
      hasAllResults: false,
    }),
  )
  expect(withBatch.batchTransfer).toBeDefined()
  expect(
    query(withBatch, actions.toggleRunning(RunningType.QUERY)).batchTransfer,
  ).toBeUndefined()
  expect(query(withBatch, actions.stopRunning()).batchTransfer).toBeDefined()
})

const BUFFER_ID = 1

describe("manual query execution counters", () => {
  it("counts repeated executions independently from publishing results", () => {
    const first = query(
      initialState,
      actions.recordQueryExecution(" select 1; "),
    )
    expect(first.executionCounts?.[queryExecutionKey("select 1")]).toBe(1)
    const clearedResult = query(first, actions.setResult(undefined))
    const second = query(
      clearedResult,
      actions.recordQueryExecution("select 1"),
    )
    const another = query(second, actions.recordQueryExecution("select 2"))
    expect(another.executionCounts?.[queryExecutionKey("select 1")]).toBe(2)
    expect(another.executionCounts?.[queryExecutionKey("select 2")]).toBe(1)
    expect(
      query(another, actions.recordQueryExecution("select 1"))
        .executionCounts?.[queryExecutionKey("select 1")],
    ).toBe(2)
    expect(
      query(another, actions.clearQueryExecutions()).executionCounts,
    ).toBeUndefined()
  })

  it("bounds session memory without conflating SQL literals", () => {
    expect(queryExecutionKey("select 'A'")).not.toBe(
      queryExecutionKey("select 'a'"),
    )
    let state = initialState
    for (let i = 0; i <= MAX_TRACKED_QUERY_EXECUTIONS; i++)
      state = query(state, actions.recordQueryExecution(`select ${i}`))
    expect(Object.keys(state.executionCounts ?? {})).toHaveLength(
      MAX_TRACKED_QUERY_EXECUTIONS,
    )
    expect(
      state.executionCounts?.[queryExecutionKey("select 0")],
    ).toBeUndefined()
    expect(
      state.executionCounts?.[
        queryExecutionKey(`select ${MAX_TRACKED_QUERY_EXECUTIONS}`)
      ],
    ).toBe(1)
  })
})

describe("repeated execution offer", () => {
  const dql = (sql: string) => ({
    type: Type.DQL as const,
    query: sql,
    columns: [],
    dataset: [],
    count: 0,
    timestamp: -1,
    explain: undefined,
  })
  const repeated = (sql: string) => {
    let state = query(initialState, actions.recordQueryExecution(sql))
    state = query(state, actions.recordQueryExecution(sql))
    state = query(state, actions.setResult(dql(sql) as never, BUFFER_ID))
    return selectors.getResultHasRepeatedExecution({
      query: state,
    } as unknown as StoreShape)
  }

  it("offers monitoring for a query run twice", () => {
    expect(repeated("select * from trades")).toBe(true)
  })

  // A plan from the Re-run button or a typed EXPLAIN is not data to monitor.
  it.each([
    "EXPLAIN select * from trades",
    "  explain select 1",
    "-- plan\nEXPLAIN select 1",
    "/* plan */ explain select 1",
  ])("never offers monitoring for the query plan %j", (sql) => {
    expect(repeated(sql)).toBe(false)
  })

  it("still offers monitoring for a query that only mentions explain", () => {
    expect(repeated("select 'explain' from trades")).toBe(true)
    expect(repeated("select * from explained")).toBe(true)
  })

  // The key is cached per result object; the counts must still be read fresh.
  it("offers monitoring once the displayed result's query runs again", () => {
    const sql = "select * from trades"
    let state = query(initialState, actions.recordQueryExecution(sql))
    state = query(state, actions.setResult(dql(sql) as never, BUFFER_ID))
    const offered = () =>
      selectors.getResultHasRepeatedExecution({
        query: state,
      } as unknown as StoreShape)
    expect(offered()).toBe(false)
    state = query(state, actions.recordQueryExecution(sql))
    expect(offered()).toBe(true)
  })
})

const notificationGroup = (
  queryKey: QueryKey,
  createdAt: Date,
): QueryNotifications => ({
  latest: {
    query: queryKey,
    createdAt,
    content: null,
    type: NotificationType.SUCCESS,
  },
})

const stateWithGroups = (
  groups: Record<QueryKey, QueryNotifications>,
): QueryStateShape => ({
  ...initialState,
  notifications: Object.values(groups).map((group) => group.latest),
  queryNotifications: { [BUFFER_ID]: groups },
})

describe("query reducer — UPDATE_NOTIFICATION_KEY", () => {
  const oldKey = "select 1@10-18" as QueryKey
  const newKey = "select 1@20-28" as QueryKey

  it("moves the notification group to the new key", () => {
    // Given a notification group stored under the old key
    const moved = notificationGroup(oldKey, new Date(1000))
    const state = stateWithGroups({ [oldKey]: moved })

    // When the key is updated
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID),
    )

    // Then the group lives under the new key and the old key is gone
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(moved)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBeUndefined()

    // And the flat notification log follows the rename
    expect(next.notifications[0].query).toBe(newKey)
  })

  it("keeps the old key alongside the new one when preserveOldKey is set", () => {
    // Given a notification group stored under the old key
    const moved = notificationGroup(oldKey, new Date(1000))
    const state = stateWithGroups({ [oldKey]: moved })

    // When the key is updated with preserveOldKey
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID, true),
    )

    // Then the group is reachable under both keys
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(moved)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBe(moved)
  })

  it("overwrites an older group already sitting at the new key", () => {
    // Given the new key holds a group older than the moved one
    const moved = notificationGroup(oldKey, new Date(2000))
    const existing = notificationGroup(newKey, new Date(1000))
    const state = stateWithGroups({ [oldKey]: moved, [newKey]: existing })

    // When the key is updated
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID),
    )

    // Then the newer moved group wins the collision
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(moved)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBeUndefined()
  })

  it("leaves the state untouched when the new key holds a newer group", () => {
    // Given the new key holds a group newer than the moved one
    const moved = notificationGroup(oldKey, new Date(1000))
    const existing = notificationGroup(newKey, new Date(2000))
    const state = stateWithGroups({ [oldKey]: moved, [newKey]: existing })

    // When the key is updated
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID),
    )

    // Then the existing newer group survives and the moved one keeps its key
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(existing)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBe(moved)

    // And the flat notification log keeps the old key alongside the new one
    expect(next.notifications.filter((n) => n.query === oldKey)).toHaveLength(1)
    expect(next.notifications.filter((n) => n.query === newKey)).toHaveLength(1)

    // And the refusal is a referential no-op so no notification consumer rerenders
    expect(next).toBe(state)
  })

  it("lets the moved group win when both groups share a timestamp", () => {
    // Given the new key holds a group with the same createdAt as the moved one
    const moved = notificationGroup(oldKey, new Date(1000))
    const existing = notificationGroup(newKey, new Date(1000))
    const state = stateWithGroups({ [oldKey]: moved, [newKey]: existing })

    // When the key is updated
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID),
    )

    // Then the tie breaks toward the moved group, replacing the existing one
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(moved)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBeUndefined()
  })

  it("refuses the whole move when a newer group blocks the new key even with preserveOldKey", () => {
    // Given a group to preserve at the old key and a newer group at the new key
    const moved = notificationGroup(oldKey, new Date(1000))
    const existing = notificationGroup(newKey, new Date(2000))
    const state = stateWithGroups({ [oldKey]: moved, [newKey]: existing })

    // When the key is updated with preserveOldKey
    const next = query(
      state,
      actions.updateNotificationKey(oldKey, newKey, BUFFER_ID, true),
    )

    // Then the newer group is not overwritten and the old key is left as-is
    expect(next.queryNotifications[BUFFER_ID][newKey]).toBe(existing)
    expect(next.queryNotifications[BUFFER_ID][oldKey]).toBe(moved)

    // And the flat notification log keeps both keys, so the detached notification
    // stays under the old key instead of clobbering the newer one
    expect(next.notifications.filter((n) => n.query === oldKey)).toHaveLength(1)
    expect(next.notifications.filter((n) => n.query === newKey)).toHaveLength(1)

    // And the refusal is a referential no-op so no notification consumer rerenders
    expect(next).toBe(state)
  })
})

describe("query reducer — UPDATE_NOTIFICATION_KEYS", () => {
  it("moves chained keys atomically after vacating every source", () => {
    const firstKey = "select 1@0-8" as QueryKey
    const secondKey = "select 1@10-18" as QueryKey
    const thirdKey = "select 1@20-28" as QueryKey
    const first = notificationGroup(firstKey, new Date(1000))
    const second = notificationGroup(secondKey, new Date(2000))
    const state = {
      ...stateWithGroups({ [firstKey]: first, [secondKey]: second }),
      activeNotification: second.latest,
    }

    const next = query(
      state,
      actions.updateNotificationKeys(
        [
          { oldKey: firstKey, newKey: secondKey },
          { oldKey: secondKey, newKey: thirdKey },
        ],
        BUFFER_ID,
      ),
    )

    expect(next.queryNotifications[BUFFER_ID][firstKey]).toBeUndefined()
    expect(next.queryNotifications[BUFFER_ID][secondKey]).toBe(first)
    expect(next.queryNotifications[BUFFER_ID][thirdKey]).toBe(second)
    expect(
      next.notifications.map((notification) => notification.query),
    ).toEqual([secondKey, thirdKey])
    expect(next.activeNotification?.query).toBe(thirdKey)
  })
})
