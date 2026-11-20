// @vitest-environment jsdom
import {
  renderChat,
  openChat,
  getByHook,
  getAllByHook,
  queryByHook,
} from "./support/chatHarness"
import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const findMenuItem = (name: string) =>
  screen.findByRole("menuitemradio", { name })

const typeInChat = async (text: string) => {
  await userEvent.click(getByHook("chat-input-textarea"))
  await userEvent.keyboard(text)
}

describe("slash commands", () => {
  it("lists the commands as the user types a slash, and narrows them down", async () => {
    // Given
    renderChat()
    await openChat()

    // When
    await typeInChat("/")

    // Then
    expect(getByHook("chat-input-textarea")).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(
      getAllByHook("chat-command-option").map((option) => option.textContent),
    ).toEqual([
      expect.stringMatching(/^\/model/),
      expect.stringMatching(/^\/effort/),
    ])

    // When
    await userEvent.keyboard("ef")

    // Then
    expect(getAllByHook("chat-command-option")).toHaveLength(1)

    // When the user closes it
    await userEvent.keyboard("{Escape}")

    // Then
    expect(queryByHook("chat-command-menu")).not.toBeInTheDocument()
  })

  it("opens the model picker for /model, and picks the model it names", async () => {
    // Given
    renderChat()
    await openChat()

    // When
    await typeInChat("/model{Enter}")

    // Then
    await waitFor(() =>
      expect(getAllByHook("chat-model-picker-option").length).toBeGreaterThan(
        0,
      ),
    )
    expect(getByHook("chat-input-textarea")).toHaveValue("")

    // When
    await userEvent.keyboard("{Escape}")
    await typeInChat("/model gpt 5 mini{Enter}")

    // Then
    await waitFor(() =>
      expect(getByHook("chat-model-picker")).toHaveTextContent("GPT 5 Mini"),
    )
    expect(getByHook("chat-input-textarea")).toHaveValue("")
    expect(getByHook("chat-messages-container")).toContainElement(
      getByHook("chat-command-done"),
    )
    expect(getByHook("chat-command-done")).toHaveTextContent(
      "Model set to GPT 5 Mini",
    )
  })

  it("says what Enter does for the highlighted command", async () => {
    // Given
    renderChat()
    await openChat()

    // When
    await typeInChat("/")

    // Then
    expect(getByHook("chat-command-menu")).toHaveTextContent(
      "Enter to pick from the list · Tab to type a name",
    )
  })

  it("says in the chat, in red, why it cannot pick a model, and keeps what the user wrote", async () => {
    // Given
    renderChat()
    await openChat()

    // When
    await typeInChat("/model llama{Enter}")

    // Then
    const note = getByHook("chat-command-error")
    expect(getByHook("chat-messages-container")).toContainElement(note)
    expect(note).toHaveTextContent("/model llama")
    expect(note).toHaveTextContent(
      "No model matches “llama”. Type /model to pick one from the list.",
    )
    expect(getByHook("chat-input-textarea")).toHaveValue("/model llama")
  })

  it("sets the effort a /effort names, and lists the levels for a wrong one", async () => {
    // Given
    renderChat()
    await openChat()

    // When
    await typeInChat("/effort extreme{Enter}")

    // Then
    expect(getByHook("chat-command-error")).toHaveTextContent(
      "No effort level “extreme”. Choose Default or High.",
    )

    // When
    await userEvent.clear(getByHook("chat-input-textarea"))
    await typeInChat("/effort high{Enter}")

    // Then
    await waitFor(() =>
      expect(getByHook("chat-effort-picker")).toHaveTextContent("High"),
    )
  })
})

describe("/effort on a model without effort", () => {
  it("says the model has no effort setting instead of sending it as a message", async () => {
    // Given an Anthropic API model, which has no effort setting
    renderChat("anthropic")
    await openChat()

    // When
    await typeInChat("/effort{Enter}")

    // Then
    expect(getByHook("chat-command-error")).toHaveTextContent(
      "This model has no effort setting.",
    )
    expect(queryByHook("chat-message-user")).toBeNull()

    // When
    await userEvent.clear(getByHook("chat-input-textarea"))
    await typeInChat("/effort high{Enter}")

    // Then
    expect(getAllByHook("chat-command-error")).toHaveLength(2)
    expect(queryByHook("chat-message-user")).toBeNull()
  })

  it("leaves /effort out of the menu", async () => {
    // Given
    renderChat("anthropic")
    await openChat()

    // When
    await typeInChat("/")

    // Then
    const names = getAllByHook("chat-command-option").map(
      (option) => option.textContent ?? "",
    )
    expect(names.some((name) => name.startsWith("/model"))).toBe(true)
    expect(names.some((name) => name.startsWith("/effort"))).toBe(false)
  })
})

describe("composer pickers", () => {
  it("puts focus back in the input once a model or effort is chosen", async () => {
    // Given
    renderChat()
    await openChat()

    // When the user picks a model from the menu
    await userEvent.click(getByHook("chat-model-picker"))
    await waitFor(() =>
      expect(getAllByHook("chat-model-picker-option").length).toBeGreaterThan(
        0,
      ),
    )
    const model = getAllByHook("chat-model-picker-option").find(
      (option) => option.getAttribute("aria-selected") !== "true",
    )
    await userEvent.click(model!)

    // Then
    await waitFor(() => expect(getByHook("chat-input-textarea")).toHaveFocus())

    // When the user picks an effort level
    await userEvent.click(getByHook("chat-effort-picker"))
    await userEvent.click(await findMenuItem("High"))

    // Then
    await waitFor(() =>
      expect(getByHook("chat-effort-picker")).toHaveTextContent("High"),
    )
    expect(getByHook("chat-input-textarea")).toHaveFocus()
  })

  it("leaves focus on the picker when its menu closes without a choice", async () => {
    // Given
    renderChat()
    await openChat()
    await userEvent.click(getByHook("chat-effort-picker"))
    await findMenuItem("High")

    // When
    await userEvent.keyboard("{Escape}")

    // Then
    await waitFor(() => expect(getByHook("chat-effort-picker")).toHaveFocus())
  })

  it("puts focus back in the input when the picker /model opened closes", async () => {
    // Given
    renderChat()
    await openChat()
    await typeInChat("/model{Enter}")
    await waitFor(() =>
      expect(getAllByHook("chat-model-picker-option").length).toBeGreaterThan(
        0,
      ),
    )

    // When
    await userEvent.keyboard("{Escape}")

    // Then
    await waitFor(() => expect(getByHook("chat-input-textarea")).toHaveFocus())
  })
})
