// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
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

const renderPicker = (selectedKey = "anthropic:Claude Sonnet") => {
  const onSelect = vi.fn()
  renderComponent(
    <ModelPicker
      groups={groups}
      selectedKey={selectedKey}
      triggerLabel="Claude Sonnet"
      triggerProvider="anthropic"
      agent={null}
      disabled={false}
      onSelect={onSelect}
      onRestartAgent={vi.fn()}
    />,
  )
  return { onSelect }
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
})
