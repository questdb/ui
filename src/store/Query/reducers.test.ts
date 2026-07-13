import { describe, it, expect } from "vitest"
import query, { initialState } from "./reducers"
import actions from "./actions"
import { NotificationType } from "./types"
import type { QueryKey, QueryNotifications, QueryStateShape } from "./types"

const BUFFER_ID = 1

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
