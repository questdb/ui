import { describe, expect, it } from "vitest"
import query, { initialState } from "./reducers"
import actions from "./actions"
import { NotificationType } from "./types"
import type { QueryKey } from "./types"

const key: QueryKey = "select 42@0-9"
const loading = (queryId: number, bufferId: string | number = 1) =>
  actions.addNotification(
    {
      query: key,
      queryId,
      type: NotificationType.LOADING,
      content: "Running…",
    },
    bufferId,
  )

describe("settling loading notifications", () => {
  it("removes the ended execution from history, selection and active state", () => {
    const state = query(initialState, loading(1))
    const next = query(state, actions.settleLoadingNotification(1, 1))

    expect(next.notifications).toEqual([])
    expect(next.queryNotifications[1][key]).toBeUndefined()
    expect(next.activeNotification).toBeNull()
    expect(query(next, actions.settleLoadingNotification(1, 1))).toBe(next)
  })

  it("retains completed history and restores the latest completed selection", () => {
    const regular = actions.addNotification(
      { query: key, createdAt: new Date(1000), content: "Earlier result" },
      1,
    )
    const explain = actions.addNotification(
      {
        query: key,
        createdAt: new Date(2000),
        content: "Earlier plan",
        isExplain: true,
      },
      1,
    )
    const completed = query(query(initialState, regular), explain)
    const state = query(completed, loading(3))
    const next = query(state, actions.settleLoadingNotification(1, 3))

    expect(next.notifications).toEqual(completed.notifications)
    expect(next.queryNotifications).toEqual(completed.queryNotifications)
    expect(next.activeNotification).toBeNull()
  })

  it("does not remove a newer execution of the same SQL", () => {
    const state = query(query(initialState, loading(1)), loading(2))
    const next = query(state, actions.settleLoadingNotification(1, 1))

    expect(next.notifications).toEqual([state.notifications[1]])
    expect(next.queryNotifications[1][key]).toBe(
      state.queryNotifications[1][key],
    )
    expect(next.activeNotification).toBe(state.activeNotification)
  })

  it("preserves another namespace's notification for the same SQL", () => {
    const state = query(query(initialState, loading(1)), loading(2, "chat"))
    const next = query(state, actions.settleLoadingNotification(1, 1))

    expect(next.notifications).toEqual([state.notifications[1]])
    expect(next.queryNotifications[1][key]).toBeUndefined()
    expect(next.queryNotifications.chat).toBe(state.queryNotifications.chat)
    expect(next.activeNotification).toBe(state.activeNotification)
  })

  it("settles a loading selection after the editor rekeys it", () => {
    const movedKey: QueryKey = "select 42@10-19"
    const state = query(
      query(initialState, loading(1)),
      actions.updateNotificationKey(key, movedKey, 1),
    )
    const next = query(state, actions.settleLoadingNotification(1, 1))

    expect(next.notifications).toEqual([])
    expect(next.queryNotifications[1][movedKey]).toBeUndefined()
    expect(next.activeNotification).toBeNull()
  })

  it("clears an active-only script notification without touching history", () => {
    const completed = query(
      initialState,
      actions.addNotification({ query: key, content: "Earlier result" }, 1),
    )
    const state = query(
      completed,
      actions.setActiveNotification({
        query: key,
        queryId: 2,
        type: NotificationType.LOADING,
        content: "Running script…",
        createdAt: new Date(),
      }),
    )
    const next = query(state, actions.settleLoadingNotification(1, 2))

    expect(next.notifications).toBe(completed.notifications)
    expect(next.queryNotifications).toBe(completed.queryNotifications)
    expect(next.activeNotification).toBeNull()
  })
})
