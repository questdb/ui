// @vitest-environment jsdom
import { renderComponent, getHook } from "../../test/component"
import React from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { createStore } from "redux"
import { Sidebar } from "../../components/Sidebar"
import rootReducer from "../../store/reducers"
import { Help } from "./help"

vi.mock("../../modules/ConsoleEventTracker", () => ({ trackEvent: vi.fn() }))

const openHelp = async () => {
  renderComponent(
    <Provider store={createStore(rootReducer)}>
      <Sidebar>
        <Help />
      </Sidebar>
    </Provider>,
  )
  await userEvent.click(getHook("help-panel-button"))
}

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
