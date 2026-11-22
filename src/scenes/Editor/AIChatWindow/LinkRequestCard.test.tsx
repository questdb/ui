// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { LinkRequestCard } from "./LinkRequestCard"

const question = {
  v: "0.6.0",
  type: "agent_question" as const,
  requestId: "r1",
  conversationId: "c1",
  message: "Sign in to Example Analytics.",
  fields: [],
  url: "https://auth.example.com/authorize?client=questdb",
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("LinkRequestCard", () => {
  it("opens an isolated tab and reports opening only after the user confirms", async () => {
    // Given
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const onAnswer = vi.fn(() => true)
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={question}
        onAnswer={onAnswer}
        onStop={vi.fn()}
      />,
    )
    expect(screen.getByText("auth.example.com")).toBeVisible()

    // When
    await userEvent.click(screen.getByRole("button", { name: /Open page/ }))

    // Then
    expect(open).toHaveBeenCalledWith(
      question.url,
      "_blank",
      "noopener,noreferrer",
    )
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled()
    await userEvent.click(
      screen.getByRole("button", { name: "I opened the page" }),
    )
    expect(onAnswer).toHaveBeenCalledWith({})
    expect(open).toHaveBeenCalledOnce()
  })

  it("keeps launch, copy and confirmation available after an unsuccessful send", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const onAnswer = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const url = "http://example.invalid/setup"
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={{ ...question, url }}
        onAnswer={onAnswer}
        onStop={vi.fn()}
      />,
    )
    const button = screen.getByRole("button", { name: /Open page/ })
    await userEvent.click(button)
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer")
    const confirm = screen.getByRole("button", { name: "I opened the page" })
    await userEvent.click(confirm)
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not send/)
    expect(button).toBeEnabled()
    expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled()
    await userEvent.click(confirm)
    expect(onAnswer.mock.calls).toEqual([[{}], [{}]])
    expect(open).toHaveBeenCalledOnce()
  })

  it("offers an error and Cancel when the address is empty", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const onAnswer = vi.fn(() => true)
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={{ ...question, url: "" }}
        onAnswer={onAnswer}
        onStop={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "valid HTTP or HTTPS link",
    )
    expect(screen.getByRole("button", { name: /Open page/ })).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "Copy link" }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onAnswer).toHaveBeenCalledWith(null)
    expect(open).not.toHaveBeenCalled()
  })

  it("declines without opening anything", async () => {
    // Given
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const onAnswer = vi.fn(() => true)
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={question}
        onAnswer={onAnswer}
        onStop={vi.fn()}
      />,
    )

    // When
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    // Then
    expect(open).not.toHaveBeenCalled()
    expect(onAnswer).toHaveBeenCalledWith(null)
  })
})
