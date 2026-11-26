// @vitest-environment jsdom
import React from "react"
import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import {
  DRAWER_ESCAPE_CLAIM,
  DRAWER_ESCAPE_EVENT,
} from "../../../components/Drawer/escapeClaim"
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
  it("declines the request when the chat hands it Escape", () => {
    // Given
    const onAnswer = vi.fn(() => true)
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={question}
        onAnswer={onAnswer}
        onStop={vi.fn()}
      />,
    )
    const card = screen.getByRole("alertdialog")
    expect(card).toHaveAttribute(DRAWER_ESCAPE_CLAIM)

    // When the drawer it sits in passes it Escape
    act(() => {
      card.dispatchEvent(new CustomEvent(DRAWER_ESCAPE_EVENT))
    })

    // Then the page is not opened and the request is declined
    expect(onAnswer).toHaveBeenCalledWith(null)
  })

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

  it("shows a long address in full, wrapped instead of cut", () => {
    // Given a sign-in page with a long OAuth address
    const url =
      "https://auth.example.com/oauth/authorize?client_id=questdb-console" +
      "&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback" +
      `&scope=openid%20profile%20email&state=${"f".repeat(64)}`

    // When
    renderComponent(
      <LinkRequestCard
        agentLabel="Codex"
        question={{ ...question, url }}
        onAnswer={vi.fn(() => true)}
        onStop={vi.fn()}
      />,
    )

    // Then the whole address breaks onto more lines, as its host does
    const address = getComputedStyle(screen.getByText(url))
    expect(address.whiteSpace).not.toBe("nowrap")
    expect(address.textOverflow).not.toBe("ellipsis")
    expect(address.overflow).not.toBe("hidden")
    expect(address.getPropertyValue("overflow-wrap")).toBe("anywhere")
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
