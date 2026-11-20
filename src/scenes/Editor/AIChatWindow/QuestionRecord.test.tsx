// @vitest-environment jsdom
import React from "react"
import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderComponent } from "../../../test/component"
import { questionTranscript } from "../../../utils/localAgent/questionTranscript"
import { AssistantMarkdown } from "./AssistantMarkdown"

describe("an answered question in the agent's reply", () => {
  it("shows the question and quotes only the user's answer", () => {
    // Given a reply that holds an answered question
    const record = questionTranscript(
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
    renderComponent(
      <AssistantMarkdown
        content={`Let me check first.\n\n${record}\n\nUsing QuestDB.`}
        messageId="m1"
        onOpenInEditor={vi.fn()}
      />,
    )

    // Then
    expect(screen.getByText("Which database should we use?")).toBeVisible()
    expect(screen.getByText("QuestDB")).toBeVisible()
    expect(screen.queryByText(/agent-question|"questions"/)).toBeNull()
    expect(screen.getByText("Using QuestDB.")).toBeVisible()
  })
})
