import { describe, expect, it } from "vitest"
import type { AgentQuestionField, AgentQuestionMessage } from "./protocol"
import { questionViews } from "./questionDisplay"

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
