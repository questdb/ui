// @vitest-environment jsdom
import React from "react"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { getHook, renderComponent } from "../../test/component"
import { Sidebar } from "../../components/Sidebar"
import rootReducer from "../../store/reducers"
import { Help } from "./help"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const renderHelp = () =>
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <Sidebar>
        <Help />
      </Sidebar>
    </Provider>,
  )

const openHelp = async () => {
  renderHelp()
  await userEvent.click(getHook("help-panel-button"))
}

const menuOpen = () => screen.queryAllByRole("menu").length > 0
const shortcutsShown = () => screen.queryAllByText("Run query").length > 0

describe("Help menu", () => {
  it("offers the four support destinations from the sidebar", async () => {
    // Given / When
    await openHelp()

    // Then
    for (const [name, href] of [
      ["Slack community", "https://slack.questdb.io/"],
      ["Public forum", "https://community.questdb.io/"],
      ["Stack Overflow", "https://stackoverflow.com/tags/questdb"],
      ["Web Console Docs", "https://questdb.io/docs/develop/web-console/"],
    ])
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
        "href",
        href,
      )
  })

  it("opens Contact us and enables Send after the user enters a message", async () => {
    // Given
    await openHelp()

    // When
    await userEvent.click(getHook("help-link-contact-us"))

    // Then
    const form = within(await screen.findByRole("alertdialog"))
    expect(form.getByRole("button", { name: /send/i })).toBeDisabled()

    // When
    await userEvent.type(
      form.getByPlaceholderText("email@address.com"),
      "email@address.com",
    )
    await userEvent.type(
      form.getByPlaceholderText("It would be great if I could..."),
      "This is a test message",
    )

    // Then
    expect(form.getByRole("button", { name: /send/i })).toBeEnabled()
  })
})

describe("Help Escape", () => {
  it("closes the menu opened over the shortcuts panel first", async () => {
    await openHelp()
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
