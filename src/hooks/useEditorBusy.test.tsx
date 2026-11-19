import React from "react"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { act, create } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { useEditorBusy } from "./useEditorBusy"
import { RunningType } from "../store/Query/types"

const editor = vi.hoisted(() => ({ tabsDisabled: false }))
vi.mock("../providers/EditorProvider", () => ({
  useEditor: () => ({ isTabsDisabled: () => editor.tabsDisabled }),
}))

describe("useEditorBusy", () => {
  it("reads live editor state after the component that asked has unmounted", () => {
    const store = createStore(
      (
        state = { query: { running: RunningType.NONE } },
        action: { type: string; running?: RunningType },
      ) =>
        action.type === "run" ? { query: { running: action.running } } : state,
    )
    let isEditorBusy!: () => boolean
    const Probe = () => {
      isEditorBusy = useEditorBusy()
      return null
    }
    let renderer!: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <Provider store={store}>
          <Probe />
        </Provider>,
      )
    })
    expect(isEditorBusy()).toBe(false)
    act(() => renderer.unmount())

    store.dispatch({ type: "run", running: RunningType.QUERY })
    expect(isEditorBusy()).toBe(true)

    store.dispatch({ type: "run", running: RunningType.NONE })
    expect(isEditorBusy()).toBe(false)
    editor.tabsDisabled = true
    expect(isEditorBusy()).toBe(true)
  })
})
