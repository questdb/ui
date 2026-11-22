// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderComponent } from "../../../test/component"
import { buildQuestionRecord } from "../../../utils/localAgent/questionTranscript"
import { QuestionRecord } from "./QuestionRecord"

describe("an answered question in the agent's reply", () => {
  it("shows the question and quotes only the user's answer", () => {
    // Given a reply that holds an answered question
    const record = buildQuestionRecord(
      {
        v: "0.6.0",
        type: "agent_question",
        requestId: "q1",
        conversationId: "c1",
        message: "Which database should we use?",
        fields: [
          {
            id: "question_0",
            kind: "choice",
            title: "Database",
            prompt: null,
            options: [
              { value: "QuestDB", label: "QuestDB", description: null },
            ],
            multiple: false,
            required: false,
            otherFieldId: null,
          },
        ],
      },
      { question_0: "QuestDB" },
    )

    // When
    renderComponent(<QuestionRecord record={record} />)

    // Then
    expect(screen.getByText("Which database should we use?")).toBeVisible()
    expect(screen.getByText("QuestDB")).toBeVisible()
  })
})
