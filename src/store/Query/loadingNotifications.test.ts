import { describe, expect, it, vi } from "vitest"
import query, { initialState } from "./reducers"
import actions from "./actions"
import { NotificationType } from "./types"
import type { QueryKey } from "./types"
import { createDetachedQueryKey } from "../../scenes/Editor/Monaco/utils"

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
  it("keeps loading out of history and removes the ended selection and active state", () => {
    const state = query(initialState, loading(1))
    const next = query(state, actions.settleLoadingNotification(1))

    expect(state.notifications).toBe(initialState.notifications)
    expect(next.notifications).toBe(state.notifications)
    expect(next.pendingLoadingNotifications).toEqual({})
    expect(next.queryNotifications[1][key]).toBeUndefined()
    expect(next.activeNotification).toBeNull()
    expect(query(next, actions.settleLoadingNotification(1))).toBe(next)
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
    const next = query(state, actions.settleLoadingNotification(3))

    expect(next.notifications).toEqual(completed.notifications)
    expect(next.queryNotifications).toEqual(completed.queryNotifications)
    expect(next.activeNotification).toBeNull()
  })

  it("keeps an unmounted run's cancellation instead of restoring older success", () => {
    const completed = query(
      initialState,
      actions.addNotification({ query: key, content: "Old success" }, 1),
    )
    const running = query(completed, loading(3))
    const cancelled = query(
      running,
      actions.addNotification(
        {
          query: key,
          type: NotificationType.ERROR,
          content: "Cancelled by user",
          updateActiveNotification: false,
        },
        1,
      ),
    )
    const next = query(cancelled, actions.settleLoadingNotification(3))
    expect(next.queryNotifications[1][key].latest).toMatchObject({
      type: NotificationType.ERROR,
      content: "Cancelled by user",
    })
    expect(next.activeNotification).toBeNull()
    expect(next.notifications).toHaveLength(2)
  })

  it("does not remove a newer execution of the same SQL", () => {
    const state = query(query(initialState, loading(1)), loading(2))
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.notifications).toBe(state.notifications)
    expect(next.queryNotifications[1][key]).toBe(
      state.queryNotifications[1][key],
    )
    expect(next.activeNotification).toBe(state.activeNotification)
  })

  it("preserves another namespace's notification for the same SQL", () => {
    const state = query(query(initialState, loading(1)), loading(2, "chat"))
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.notifications).toBe(state.notifications)
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
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.notifications).toEqual([])
    expect(next.queryNotifications[1][movedKey]).toBeUndefined()
    expect(next.activeNotification).toBeNull()
  })

  it("settles a completed slow query without scanning history or completed groups", () => {
    const state = query(
      query(initialState, loading(1)),
      actions.addNotification({ query: key, queryId: 1, content: "Done" }, 1),
    )
    const scanHistory = vi.spyOn(state.notifications, "filter")
    const scanGroups = vi.fn(Reflect.ownKeys)
    state.queryNotifications[1] = new Proxy<
      (typeof state.queryNotifications)[1]
    >(state.queryNotifications[1], {
      ownKeys: scanGroups,
    })

    const next = query(state, actions.settleLoadingNotification(1))

    expect(scanHistory).not.toHaveBeenCalled()
    expect(scanGroups).not.toHaveBeenCalled()
    scanHistory.mockRestore()
    expect(next.notifications).toBe(state.notifications)
    expect(next.queryNotifications).toBe(state.queryNotifications)
    expect(next.activeNotification).toBe(state.activeNotification)
    expect(next.pendingLoadingNotifications).toEqual({})
    expect(query(next, actions.settleLoadingNotification(1))).toBe(next)
  })

  it("settles all aliases when a loading query is rekeyed with preserveOldKey", () => {
    const movedKey: QueryKey = "select 42@10-19"
    const state = query(
      query(initialState, loading(1)),
      actions.updateNotificationKey(key, movedKey, 1, true),
    )
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.queryNotifications[1]).toEqual({})
    expect(next.pendingLoadingNotifications).toEqual({})
  })

  it.each([
    NotificationType.ERROR,
    NotificationType.SUCCESS,
    NotificationType.NOTICE,
  ])("publishes a rerun's %s outcome to its accepted editor alias", (type) => {
    let state = query(
      initialState,
      actions.addNotification({ query: key, content: "Old success" }, 1),
    )
    state = query(state, loading(3))
    const alias: QueryKey = "select 42@10-19"
    state = query(state, actions.updateNotificationKey(key, alias, 1, true))
    state = query(
      state,
      actions.addNotification(
        { query: key, queryId: 3, type, content: "Current outcome" },
        1,
      ),
    )
    state = query(state, actions.settleLoadingNotification(3))

    for (const queryKey of [key, alias]) {
      expect(state.queryNotifications[1][queryKey].latest).toMatchObject({
        query: queryKey,
        type,
        content: "Current outcome",
      })
    }
    expect(state.notifications).toHaveLength(2)
    expect(state.pendingLoadingNotifications).toEqual({})
  })

  it("routes a terminal outcome through a moved namespace without recreating the old one", () => {
    const detachedKey = createDetachedQueryKey("select 42")
    let state = query(
      initialState,
      actions.addNotification(
        { query: detachedKey, content: "Old success" },
        "chat",
      ),
    )
    state = query(
      state,
      actions.addNotification(
        {
          query: detachedKey,
          queryId: 3,
          type: NotificationType.LOADING,
          content: "Running",
        },
        "chat",
      ),
    )
    state = query(state, actions.moveNotificationNamespace("chat", 1, key))
    state = query(
      state,
      actions.addNotification(
        {
          query: detachedKey,
          queryId: 3,
          type: NotificationType.ERROR,
          content: "Failed",
        },
        "chat",
      ),
    )
    state = query(state, actions.settleLoadingNotification(3))

    expect(state.queryNotifications.chat).toBeUndefined()
    for (const queryKey of [key, detachedKey]) {
      expect(state.queryNotifications[1][queryKey].latest).toMatchObject({
        type: NotificationType.ERROR,
        content: "Failed",
      })
    }
    expect(state.pendingLoadingNotifications).toEqual({})
  })

  it("does not publish an older outcome over a newer execution of an alias", () => {
    const alias: QueryKey = "select 42@10-19"
    let state = query(initialState, loading(3))
    state = query(state, actions.updateNotificationKey(key, alias, 1, true))
    state = query(
      state,
      actions.addNotification(
        {
          query: alias,
          queryId: 4,
          type: NotificationType.LOADING,
          content: "Newer run",
        },
        1,
      ),
    )
    const newer = state.queryNotifications[1][alias]
    state = query(
      state,
      actions.addNotification(
        {
          query: key,
          queryId: 3,
          type: NotificationType.ERROR,
          content: "Failed",
        },
        1,
      ),
    )
    state = query(state, actions.settleLoadingNotification(3))
    expect(state.queryNotifications[1][alias]).toBe(newer)
    expect(state.queryNotifications[1][key].latest.type).toBe(
      NotificationType.ERROR,
    )
    expect(state.pendingLoadingNotifications[4]).toBeDefined()
  })

  it("publishes to a rekeyed destination without resurrecting its original key", () => {
    const alias: QueryKey = "select 42@10-19"
    let state = query(initialState, loading(3))
    state = query(state, actions.updateNotificationKey(key, alias, 1))
    state = query(
      state,
      actions.addNotification(
        {
          query: key,
          queryId: 3,
          type: NotificationType.ERROR,
          content: "Failed",
        },
        1,
      ),
    )
    state = query(state, actions.settleLoadingNotification(3))
    expect(state.queryNotifications[1][key]).toBeUndefined()
    expect(state.queryNotifications[1][alias].latest.type).toBe(
      NotificationType.ERROR,
    )
  })

  it("retains the original loading index when a newer destination blocks rekeying", () => {
    const movedKey: QueryKey = "select 42@10-19"
    const state = query(
      query(initialState, loading(1)),
      actions.addNotification(
        {
          query: movedKey,
          content: "Newer result",
          createdAt: new Date(Date.now() + 1000),
        },
        1,
      ),
    )
    const blocked = query(
      state,
      actions.updateNotificationKey(key, movedKey, 1),
    )
    expect(blocked).toBe(state)

    const next = query(blocked, actions.settleLoadingNotification(1))

    expect(next.queryNotifications[1][key]).toBeUndefined()
    expect(next.queryNotifications[1][movedKey]).toBe(
      state.queryNotifications[1][movedKey],
    )
    expect(next.pendingLoadingNotifications).toEqual({})
  })

  it("tracks loading keys across an atomic batch rekey", () => {
    const movedKey: QueryKey = "select 42@10-19"
    const state = query(
      query(initialState, loading(1)),
      actions.updateNotificationKeys([{ oldKey: key, newKey: movedKey }], 1),
    )
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.queryNotifications[1]).toEqual({})
    expect(next.activeNotification).toBeNull()
    expect(next.pendingLoadingNotifications).toEqual({})
  })

  it("settles a moved namespace and its editor alias using the original execution", () => {
    const detachedKey = createDetachedQueryKey("select 42")
    const state = query(
      query(
        initialState,
        actions.addNotification(
          {
            query: detachedKey,
            queryId: 1,
            type: NotificationType.LOADING,
            content: "Running…",
          },
          "chat",
        ),
      ),
      actions.moveNotificationNamespace("chat", 1, key),
    )
    const next = query(state, actions.settleLoadingNotification(1))

    expect(next.queryNotifications.chat).toBeUndefined()
    expect(next.queryNotifications[1]).toEqual({})
    expect(next.activeNotification).toBeNull()
    expect(next.pendingLoadingNotifications).toEqual({})
  })

  it.each(["all", "buffer", "query"])(
    "cleans the pending index on %s cleanup",
    (kind) => {
      const state = query(initialState, loading(1))
      const action =
        kind === "all"
          ? actions.cleanupNotifications()
          : kind === "buffer"
            ? actions.cleanupBufferNotifications(1)
            : actions.removeNotification(key, 1)
      const next = query(state, action)

      expect(next.pendingLoadingNotifications).toEqual({})
      expect(
        query(next, actions.settleLoadingNotification(1)).notifications,
      ).toBe(next.notifications)
    },
  )

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
    const scanHistory = vi.spyOn(state.notifications, "filter")
    const scanGroups = vi.fn(Reflect.ownKeys)
    state.queryNotifications[1] = new Proxy<
      (typeof state.queryNotifications)[1]
    >(state.queryNotifications[1], { ownKeys: scanGroups })
    const next = query(state, actions.settleLoadingNotification(2))

    expect(scanHistory).not.toHaveBeenCalled()
    expect(scanGroups).not.toHaveBeenCalled()
    scanHistory.mockRestore()
    expect(next.notifications).toBe(completed.notifications)
    expect(next.queryNotifications).toBe(completed.queryNotifications)
    expect(next.activeNotification).toBeNull()
    expect(query(next, actions.settleLoadingNotification(2))).toBe(next)
  })

  it("preserves a newer script or a completed active notification", () => {
    const active = {
      query: key,
      queryId: 3,
      type: NotificationType.LOADING,
      content: "Newer script…",
      createdAt: new Date(),
    }
    const state = query(initialState, actions.setActiveNotification(active))
    expect(query(state, actions.settleLoadingNotification(2))).toBe(state)
    const completed = query(
      state,
      actions.setActiveNotification({
        ...active,
        type: NotificationType.SUCCESS,
      }),
    )
    expect(query(completed, actions.settleLoadingNotification(3))).toBe(
      completed,
    )
  })
})
