// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { questClient } from "../../../../utils/questdb/queryClient"
import { VariablesPopover } from "./VariablesPopover"

const notebook = vi.hoisted(() => ({
  settings: { variables: [{ name: "a", value: "1" }] },
  updateSettings: vi.fn(),
}))

vi.mock("../NotebookProvider", () => ({
  useNotebookState: () => ({ settings: notebook.settings }),
  useNotebookActions: () => ({ updateSettings: notebook.updateSettings }),
  useNotebookBufferId: () => 1,
}))
vi.mock("../../../../modules/ConsoleEventTracker", () => ({
  trackEvent: vi.fn(),
}))

type Answer = Awaited<ReturnType<typeof questClient.validateQuery>>

// Each check waits until the test answers it.
const deferChecks = () => {
  const answers: ((value: Answer) => void)[] = []
  const validate = vi
    .spyOn(questClient, "validateQuery")
    .mockImplementation(
      () => new Promise<Answer>((resolve) => answers.push(resolve)),
    )
  const answer = (index: number) =>
    act(async () => {
      answers[index]({} as Answer)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  return { validate, answer }
}

const openPopover = async () => {
  await userEvent.click(screen.getByRole("button", { name: /^Variables/ }))
  return screen.findByPlaceholderText(/^value/)
}

const setValue = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } })

describe("variables popover", () => {
  it("drops an Apply cancelled before the database answered, also once the popover reopens", async () => {
    // Given an Apply waiting on the database, cancelled
    notebook.updateSettings.mockClear()
    const { answer } = deferChecks()
    renderComponent(<VariablesPopover />)
    setValue(await openPopover(), "2")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    // When the popover opens again and applies another value, and then the
    // first check answers
    setValue(await openPopover(), "3")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await answer(0)

    // Then the cancelled Apply writes nothing, and the new one still waits
    expect(notebook.updateSettings).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Validating..." })).toBeVisible()

    // When its own check answers, it applies its value
    await answer(1)
    expect(notebook.updateSettings).toHaveBeenCalledOnce()
    expect(notebook.updateSettings).toHaveBeenCalledWith({
      variables: [{ name: "a", value: "3" }],
    })
  })

  it("checks a value edited while the database checked before it applies it", async () => {
    // Given an Apply waiting on the database
    notebook.updateSettings.mockClear()
    const { validate, answer } = deferChecks()
    renderComponent(<VariablesPopover />)
    const value = await openPopover()
    setValue(value, "2")
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))

    // When the user edits the value before the check answers
    setValue(value, "3")
    await answer(0)

    // Then the edit is checked, not the value before it
    expect(notebook.updateSettings).not.toHaveBeenCalled()
    expect(validate).toHaveBeenCalledTimes(2)
    expect(validate).toHaveBeenLastCalledWith(
      expect.stringContaining("@a := 3"),
    )

    // And once it passes, the edit is applied
    await answer(1)
    await waitFor(() =>
      expect(notebook.updateSettings).toHaveBeenCalledWith({
        variables: [{ name: "a", value: "3" }],
      }),
    )
    expect(notebook.updateSettings).toHaveBeenCalledOnce()
  })
})
