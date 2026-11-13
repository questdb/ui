import { describe, expect, it } from "vitest"
import reducer from "./reducers"
import actions from "./actions"
import type { Sidebar } from "./types"

describe("sidebar history", () => {
  it("discards the forward branch when a different panel opens after Back", () => {
    // Given
    const table: Sidebar = {
      type: "tableDetails",
      payload: { tableName: "trades", kind: "table" },
    }
    const chat: Sidebar = { type: "aiChat" }
    const news: Sidebar = { type: "news" }
    const next: Sidebar = {
      type: "tableDetails",
      payload: { tableName: "prices", kind: "table" },
    }
    let state = reducer(undefined, actions.pushSidebarHistory(table))
    state = reducer(state, actions.pushSidebarHistory(chat))
    state = reducer(state, actions.pushSidebarHistory(news))
    state = reducer(state, actions.goBackInSidebar())
    state = reducer(state, actions.goBackInSidebar())
    // When
    state = reducer(state, actions.pushSidebarHistory(next))
    // Then
    expect(state.sidebarHistory).toEqual([table, next])
    expect(state.sidebarHistoryPosition).toBe(1)
    expect(state.sidebarVisible).toBe(true)
    expect(reducer(state, actions.goForwardInSidebar())).toEqual(state)
    expect(
      reducer(state, actions.goBackInSidebar()).sidebarHistoryPosition,
    ).toBe(0)
  })
})
