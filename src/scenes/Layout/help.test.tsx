// @vitest-environment jsdom
import React from "react"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { getHook, renderComponent } from "../../test/component"
import { Sidebar } from "../../components/Sidebar"
import rootReducer from "../../store/reducers"
import { Help } from "./help"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const menuOpen = () => screen.queryAllByRole("menu").length > 0
const shortcutsShown = () => screen.queryAllByText("Run query").length > 0

describe("Help Escape", () => {
  it("closes the menu opened over the shortcuts panel first", async () => {
    renderComponent(
      <Provider store={createStore(rootReducer)}>
        <Sidebar>
          <Help />
        </Sidebar>
      </Provider>,
    )
    await userEvent.click(getHook("help-panel-button"))
    await userEvent.click(screen.getByRole("menuitem", { name: "Shortcuts" }))
    await waitFor(() => expect(menuOpen()).toBe(false))
    expect(shortcutsShown()).toBe(true)

    // The shortcuts panel (a PopperToggle) stays open under the re-opened menu.
    getHook("help-panel-button").focus()
    await userEvent.keyboard("{Enter}")
    expect(menuOpen()).toBe(true)

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(menuOpen()).toBe(false))
    expect(shortcutsShown()).toBe(true)

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(shortcutsShown()).toBe(false))
  })
})
