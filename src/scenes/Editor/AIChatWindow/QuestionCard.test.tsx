// @vitest-environment jsdom
import React from "react"
import { act, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { getHook, renderComponent } from "../../../test/component"
import {
  DRAWER_ESCAPE_CLAIM,
  DRAWER_ESCAPE_EVENT,
} from "../../../components/Drawer/escapeClaim"
import type {
  AgentQuestionField,
  AgentQuestionMessage,
} from "../../../utils/localAgent/protocol"
import { QuestionCard } from "./QuestionCard"

const database: AgentQuestionField = {
  id: "question_0",
  kind: "choice",
  title: "Database",
  prompt: "Which database should we use?",
  options: [
    { value: "QuestDB", label: "QuestDB", description: "Time series" },
    { value: "Postgres", label: "Postgres", description: null },
  ],
  multiple: false,
  required: false,
  otherFieldId: "question_0_custom",
}

const features: AgentQuestionField = {
  id: "question_1",
  kind: "choice",
  title: "Features",
  prompt: "Which features do you need?",
  options: [
    { value: "SQL", label: "SQL", description: null },
    { value: "ILP", label: "ILP", description: null },
  ],
  multiple: true,
  required: false,
  otherFieldId: null,
}

const question = (fields: AgentQuestionField[]): AgentQuestionMessage => ({
  v: "0.6.0",
  type: "agent_question",
  requestId: "q1",
  conversationId: "c1",
  message: "Please answer the following questions.",
  fields,
})

const label: AgentQuestionField = {
  id: "label",
  kind: "text",
  title: null,
  prompt: "Label?",
  required: true,
}

const renderCard = (
  message: AgentQuestionMessage,
  interruptsTyping = false,
) => {
  const onAnswer = vi.fn(() => true)
  const onStop = vi.fn()
  renderComponent(
    <QuestionCard
      agentLabel="Claude Code"
      question={message}
      interruptsTyping={interruptsTyping}
      onAnswer={onAnswer}
      onStop={onStop}
    />,
  )
  return { onAnswer, onStop }
}

describe("QuestionCard", () => {
  it("answers a single question with one click", async () => {
    // Given
    const { onAnswer } = renderCard(question([database]))
    expect(screen.getByText("Which database should we use?")).toBeVisible()

    // When
    await userEvent.click(screen.getByRole("radio", { name: /QuestDB/ }))

    // Then
    expect(onAnswer).toHaveBeenCalledWith({ question_0: "QuestDB" })
  })

  it.each([
    ["choice", database],
    ["text", label],
  ])(
    "does not take focus or keystrokes from an editor outside the chat for a %s question",
    async (_, field) => {
      // Given the user is typing SQL outside the chat
      renderComponent(<textarea aria-label="SQL editor" />)
      const editor = screen.getByRole("textbox", { name: "SQL editor" })
      editor.focus()
      await userEvent.keyboard("LIMIT ")

      // When a question arrives
      const { onAnswer } = renderCard(question([field]))
      await userEvent.keyboard("1")

      // Then
      expect(editor).toHaveFocus()
      expect(editor).toHaveValue("LIMIT 1")
      expect(onAnswer).not.toHaveBeenCalled()
    },
  )

  it("does not answer with a number typed into the message box it replaced", async () => {
    // Given a question replaces the message box while the user types in it
    const { onAnswer } = renderCard(question([database]), true)
    expect(screen.getByRole("heading", { name: /Claude Code/ })).toHaveFocus()

    // When the user types on
    await userEvent.keyboard("top 2")

    // Then no option is picked until the user moves into the card
    expect(onAnswer).not.toHaveBeenCalled()
    await userEvent.tab()
    await userEvent.keyboard("2")
    expect(onAnswer).toHaveBeenCalledWith({ question_0: "Postgres" })
  })

  it("focuses its heading when nothing else holds focus", () => {
    renderCard(question([database]))
    expect(screen.getByRole("heading", { name: /Claude Code/ })).toHaveFocus()
  })

  it("lets the user send a choice again after a failed delivery", async () => {
    // Given
    const { onAnswer } = renderCard(question([database]))
    onAnswer.mockReturnValueOnce(false)
    const choice = screen.getByRole("radio", { name: /QuestDB/ })

    // When
    await userEvent.click(choice)

    // Then
    expect(screen.getByRole("alert")).toHaveTextContent("Could not send")
    expect(choice).toBeEnabled()
    await userEvent.click(choice)
    expect(onAnswer).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("moves to the next question after a pick, lets the user go back, and sends from the review", async () => {
    // Given
    const { onAnswer } = renderCard(question([database, features]))

    // When
    await userEvent.click(screen.getByRole("radio", { name: /Postgres/ }))

    // Then
    expect(screen.getByText("Which features do you need?")).toBeVisible()

    // When
    await userEvent.click(screen.getByRole("checkbox", { name: /ILP/ }))
    await userEvent.click(screen.getByRole("tab", { name: /Database/ }))
    await userEvent.click(screen.getByRole("radio", { name: /QuestDB/ }))
    await userEvent.click(screen.getByRole("button", { name: "Review" }))

    // Then
    expect(
      screen.getByRole("button", {
        name: /Which database should we use\?\s*QuestDB/,
      }),
    ).toBeVisible()
    expect(onAnswer).not.toHaveBeenCalled()

    // When
    await userEvent.click(screen.getByRole("button", { name: "Send" }))

    // Then
    expect(onAnswer).toHaveBeenCalledWith({
      question_0: "QuestDB",
      question_1: ["ILP"],
    })
  })

  it("takes the user's own answer in place of the options", async () => {
    // Given
    const { onAnswer } = renderCard(question([database]))

    // When
    await userEvent.click(
      screen.getByRole("radio", { name: /Type your own answer/ }),
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your own answer" }),
      "SQLite{Enter}",
    )

    // Then
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith({ question_0_custom: "SQLite" })
  })

  it("chooses the listed answer instead of submitting a focused custom draft", async () => {
    const { onAnswer } = renderCard(question([database]))
    await userEvent.click(
      screen.getByRole("radio", { name: /Type your own answer/ }),
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your own answer" }),
      "SQLite",
    )
    await userEvent.click(screen.getByText("Which database should we use?"))
    expect(onAnswer).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("radio", { name: /Postgres/ }))
    expect(onAnswer.mock.calls).toEqual([[{ question_0: "Postgres" }]])
  })

  it("keeps each custom draft across tabs without adding it to the submitted answers", async () => {
    const { onAnswer } = renderCard(
      question([database, { ...features, otherFieldId: "custom_feature" }]),
    )
    const openDraft = async (role: "radio" | "checkbox") => {
      await userEvent.click(
        screen.getByRole(role, { name: /Type your own answer/ }),
      )
      return screen.getByRole("textbox", { name: "Your own answer" })
    }
    const databaseTab = screen.getByRole("tab", { name: "Database" })
    const featuresTab = screen.getByRole("tab", { name: "Features" })
    const reviewTab = screen.getByRole("tab", { name: "Review" })
    await userEvent.type(await openDraft("radio"), "SQLite")
    await userEvent.click(featuresTab)
    await userEvent.type(await openDraft("checkbox"), "Charts")
    await userEvent.click(databaseTab)
    expect(await openDraft("radio")).toHaveValue("SQLite")
    await userEvent.click(featuresTab)
    expect(await openDraft("checkbox")).toHaveValue("Charts")
    await userEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(reviewTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Not answered")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onAnswer.mock.calls).toEqual([[{ custom_feature: "Charts" }]])
  })

  it("confirms a custom answer on a multiple-choice step before review", async () => {
    const { onAnswer } = renderCard(
      question([database, { ...features, otherFieldId: "custom_feature" }]),
    )
    await userEvent.click(screen.getByRole("radio", { name: /Postgres/ }))
    await userEvent.click(screen.getByRole("checkbox", { name: /SQL/ }))
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Type your own answer/ }),
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your own answer" }),
      "Charts",
    )
    await userEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(onAnswer).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(onAnswer).toHaveBeenCalledWith({
      question_0: "Postgres",
      question_1: ["SQL"],
      custom_feature: "Charts",
    })
  })

  it("skips without submitting a focused custom draft", async () => {
    const { onAnswer } = renderCard(question([database]))
    await userEvent.click(
      screen.getByRole("radio", { name: /Type your own answer/ }),
    )
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your own answer" }),
      "SQLite",
    )
    await userEvent.click(screen.getByRole("button", { name: "Skip" }))
    expect(onAnswer.mock.calls).toEqual([[null]])
  })

  it("keeps focus in the question form across keyboard navigation", async () => {
    const { onAnswer } = renderCard(question([database, features]))
    const option = screen.getByRole("radio", { name: /Postgres/ })
    option.focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(option).not.toBeInTheDocument()
    expect(screen.getByText(/Which features do you need/)).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: "Review" })).toHaveFocus()
    await userEvent.keyboard("{ArrowLeft}1")
    expect(screen.getByRole("checkbox", { name: /SQL/ })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it.each(["text", "custom"])(
    "ignores WebKit's IME Enter in a %s answer",
    async (kind) => {
      const { onAnswer } = renderCard(
        question(kind === "custom" ? [database] : [label]),
      )
      if (kind === "custom")
        await userEvent.click(
          screen.getByRole("radio", { name: /Type your own answer/ }),
        )
      const input = screen.getByRole("textbox")
      await userEvent.type(input, "Sample label")
      fireEvent.keyDown(input, {
        key: "Enter",
        isComposing: false,
        keyCode: 229,
      })
      expect(input).toHaveFocus()
      expect(onAnswer).not.toHaveBeenCalled()
      await userEvent.keyboard("{Enter}")
      expect(onAnswer.mock.calls).toEqual([
        [
          {
            [kind === "custom" ? "question_0_custom" : "label"]: "Sample label",
          },
        ],
      ])
    },
  )

  it("picks an option with its number key", async () => {
    // Given
    const { onAnswer } = renderCard(question([database]))

    // When
    await userEvent.keyboard("2")

    // Then
    expect(onAnswer).toHaveBeenCalledWith({ question_0: "Postgres" })
  })

  it.each(["1", "{Enter}"])(
    "moves focus to the next question when a focused option is picked with %s",
    async (key) => {
      const { onAnswer } = renderCard(
        question([database, { ...features, multiple: false }]),
      )
      const firstOption = screen.getByRole("radio", { name: /QuestDB/ })
      firstOption.focus()
      expect(firstOption).toHaveFocus()

      await userEvent.keyboard(key)
      expect(screen.getByText("Which features do you need?")).toHaveFocus()

      await userEvent.keyboard("2")
      expect(screen.getByRole("tab", { name: "Review" })).toHaveFocus()
      await userEvent.click(screen.getByRole("button", { name: "Send" }))
      expect(onAnswer).toHaveBeenCalledWith({
        question_0: "QuestDB",
        question_1: "ILP",
      })
    },
  )

  it("skips the question when the chat hands it Escape, and stops claiming Escape once answered", () => {
    // Given
    const { onAnswer } = renderCard(question([database, features]))
    const card = getHook("chat-question-card")
    expect(card).toHaveAttribute(DRAWER_ESCAPE_CLAIM)

    // When the drawer it sits in passes it Escape
    act(() => {
      card.dispatchEvent(new CustomEvent(DRAWER_ESCAPE_EVENT))
    })

    // Then the question is skipped, as Skip does
    expect(onAnswer).toHaveBeenCalledWith(null)
    expect(card).not.toHaveAttribute(DRAWER_ESCAPE_CLAIM)
  })

  it("skips the question on Skip, and Escape does not answer it", async () => {
    // Given
    const { onAnswer, onStop } = renderCard(question([database, features]))

    // When
    await userEvent.keyboard("{Escape}")

    // Then
    expect(onAnswer).not.toHaveBeenCalled()

    // When
    await userEvent.click(screen.getByRole("button", { name: "Skip" }))
    await userEvent.click(
      screen.getByRole("button", { name: "Stop the agent" }),
    )

    // Then
    expect(onAnswer).toHaveBeenCalledWith(null)
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
