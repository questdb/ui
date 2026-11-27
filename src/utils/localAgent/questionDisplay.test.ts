import { describe, expect, it } from "vitest"
import type { AgentQuestionField, AgentQuestionMessage } from "./protocol"
import { answerSummary, questionViews } from "./questionDisplay"

const field = (
  title: string | null,
  prompt: string | null,
): AgentQuestionField => ({
  id: "question_0",
  kind: "choice",
  title,
  prompt,
  options: [{ value: "a", label: "A", description: null }],
  multiple: false,
  required: false,
  otherFieldId: null,
})

const question = (
  message: string,
  fields: AgentQuestionField[],
): AgentQuestionMessage => ({
  v: "0.6.0",
  type: "agent_question",
  requestId: "q1",
  conversationId: "c1",
  message,
  fields,
})

describe("questionViews", () => {
  it("finds the question wherever the agent put it", () => {
    // Then: Claude Code, one question in the message with a short header
    expect(
      questionViews(
        question("Which database should we use?", [field("Database", null)]),
      ),
    ).toEqual([{ text: "Which database should we use?", label: "Database" }])

    // Then: Codex, the question as the field's title and a generic message
    expect(
      questionViews(
        question(
          "Codex keeps working while you answer. An answer sent after it finishes is not delivered.",
          [field("Which database should we use?", null)],
        ),
      ),
    ).toEqual([{ text: "Which database should we use?", label: "Question 1" }])

    // Then: Claude Code, several questions with headers
    expect(
      questionViews(
        question("Please answer the following questions.", [
          field("Database", "Which database should we use?"),
          field("Features", "Which features do you need?"),
        ]),
      ).map((view) => view.label),
    ).toEqual(["Database", "Features"])
  })
})

describe("answerSummary", () => {
  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "reads only the user's answers for a field the agent names %s",
    (name) => {
      // Given a text field and a choice's own-answer field with that id
      const text: AgentQuestionField = {
        id: name,
        kind: "text",
        title: null,
        prompt: "Label?",
        required: true,
      }
      const choice: AgentQuestionField = {
        id: "question_0",
        kind: "choice",
        title: "Database",
        prompt: null,
        options: [{ value: "QuestDB", label: "QuestDB", description: null }],
        multiple: false,
        required: false,
        otherFieldId: name,
      }

      // Then: not answered yet
      expect(answerSummary(text, {})).toBeNull()
      expect(answerSummary(choice, {})).toBeNull()

      // Then: answered
      expect(answerSummary(text, { [name]: "Trades" })).toBe("Trades")
      expect(answerSummary(choice, { [name]: "SQLite" })).toBe("SQLite")
    },
  )
})
