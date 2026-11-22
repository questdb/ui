// @vitest-environment jsdom
import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../../test/component"
import { ModelPicker } from "./ModelPicker"
import type { ModelGroup } from "./modelOptions"

const providerGroup = (
  provider: string,
  label: string,
  models: string[],
): ModelGroup => ({
  key: provider,
  label,
  caption: null,
  provider,
  options: models.map((model) => ({
    key: `${provider}:${model}`,
    label: model,
    detail: null,
    selection: { kind: "api", model: `${provider}:${model}` },
  })),
})

const groups = [
  providerGroup("openai", "OpenAI", ["GPT 5", "GPT 5 Mini"]),
  providerGroup("anthropic", "Anthropic", ["Claude Haiku", "Claude Sonnet"]),
]

const renderPicker = (openSignal: number | null = null) => {
  const onSelect = vi.fn()
  const onDone = vi.fn(() =>
    screen.getByRole("textbox", { name: "Composer" }).focus(),
  )
  const picker = (disabled: boolean) => (
    <>
      <input aria-label="Composer" />
      <input aria-label="Outside control" />
      <ModelPicker
        groups={groups}
        selectedKey="anthropic:Claude Sonnet"
        triggerLabel="Claude Sonnet"
        triggerProvider="anthropic"
        agent={null}
        disabled={disabled}
        onSelect={onSelect}
        onRestartAgent={vi.fn()}
        openSignal={openSignal}
        onDone={onDone}
      />
    </>
  )
  const view = renderComponent(picker(false))
  return {
    onSelect,
    onDone,
    setDisabled: (disabled: boolean) => view.rerender(picker(disabled)),
  }
}

const group = (name: string) => screen.getByRole("button", { name })
const optionNames = () =>
  screen.queryAllByRole("option").map((option) => option.textContent)

describe("ModelPicker", () => {
  beforeAll(() => {
    // jsdom has no layout; the picker scrolls the highlighted row into view.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("opens with only the selected model's provider expanded", async () => {
    // Given
    renderPicker()

    // When
    await userEvent.click(screen.getByRole("button", { name: /Model:/ }))

    // Then
    expect(group("Anthropic")).toHaveAttribute("aria-expanded", "true")
    expect(group("OpenAI")).toHaveAttribute("aria-expanded", "false")
    expect(optionNames()).toEqual(["Claude Haiku", "Claude Sonnet"])
  })

  it("expands and collapses a provider from its header", async () => {
    // Given
    renderPicker()
    await userEvent.click(screen.getByRole("button", { name: /Model:/ }))

    // When
    await userEvent.click(group("OpenAI"))
    await userEvent.click(group("Anthropic"))

    // Then
    expect(optionNames()).toEqual(["GPT 5", "GPT 5 Mini"])
  })

  it("shows every provider with a match while searching", async () => {
    // Given
    renderPicker()
    await userEvent.click(screen.getByRole("button", { name: /Model:/ }))

    // When
    await userEvent.type(screen.getByRole("combobox"), "5")

    // Then
    expect(optionNames()).toEqual(["GPT 5", "GPT 5 Mini"])
    expect(group("OpenAI")).toHaveAttribute("aria-expanded", "true")
  })

  it("closes an open picker when disabled and does not reopen or accept Enter", async () => {
    const { onSelect, setDisabled } = renderPicker()
    const user = userEvent.setup()
    const trigger = screen.getByRole("button", { name: /Model:/ })
    await user.click(trigger)
    expect(screen.getByRole("combobox")).toHaveFocus()
    expect(screen.getByRole("option", { name: "Claude Haiku" })).toBeVisible()

    setDisabled(true)
    expect(trigger).toBeDisabled()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(optionNames()).toEqual([])
    await user.click(trigger)
    await user.keyboard("{Enter}")
    expect(onSelect).not.toHaveBeenCalled()

    setDisabled(false)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole("combobox")).toHaveFocus()
  })

  it("leaves focus on the clicked field when a slash-opened picker closes outside", async () => {
    const { onDone, onSelect } = renderPicker(1)
    const user = userEvent.setup()
    expect(await screen.findByRole("combobox")).toHaveFocus()
    const other = screen.getByRole("textbox", { name: "Outside control" })
    await user.click(other)
    await waitFor(() =>
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument(),
    )
    await user.keyboard("sample")
    expect(other).toHaveFocus()
    expect(other).toHaveValue("sample")
    expect(onDone).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("opens a collapsed provider and picks its model from the keyboard", async () => {
    // Given
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole("button", { name: /Model:/ }))

    // When the highlight moves from the selected model up to the OpenAI header
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{Enter}")
    await userEvent.keyboard("{ArrowDown}{Enter}")

    // Then
    expect(onSelect).toHaveBeenCalledWith({
      kind: "api",
      model: "openai:GPT 5",
    })
  })

  it("does not pick a model on the Enter that confirms an IME candidate", async () => {
    // Given
    const { onSelect } = renderPicker()
    await userEvent.click(screen.getByRole("button", { name: /Model:/ }))
    const search = screen.getByRole("combobox")
    await userEvent.type(search, "gpt")

    // When WebKit confirms the candidate after compositionend
    fireEvent.keyDown(search, {
      key: "Enter",
      isComposing: false,
      keyCode: 229,
    })

    // Then
    expect(onSelect).not.toHaveBeenCalled()
    expect(search).toBeInTheDocument()
    await userEvent.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledWith({
      kind: "api",
      model: "openai:GPT 5",
    })
  })
})
