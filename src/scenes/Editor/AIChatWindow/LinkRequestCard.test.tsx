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
  it("shows where the page leads, opens it in a new tab and tells the agent", async () => {
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
    expect(onAnswer).toHaveBeenCalledWith({})
  })

  it("does not open a valid HTTP link until the answer can be sent", async () => {
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
    expect(open).not.toHaveBeenCalled()
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer")
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
