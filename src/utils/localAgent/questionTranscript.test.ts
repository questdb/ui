import { describe, expect, it } from "vitest"
import type { AgentQuestionMessage } from "./protocol"
import { buildQuestionRecord, questionRecordText } from "./questionTranscript"

const question: AgentQuestionMessage = {
  v: "0.6.0",
  type: "agent_question",
  requestId: "q1",
  conversationId: "c1",
  message: "Which database should we use?",
  fields: [
    {
      id: "database",
      kind: "choice",
      title: "Database",
      prompt: null,
      options: [
        { value: "questdb", label: "QuestDB", description: null },
        { value: "postgres", label: "Postgres", description: null },
      ],
      multiple: false,
      required: true,
      otherFieldId: "database_custom",
    },
    {
      id: "features",
      kind: "choice",
      title: "Features",
      prompt: null,
      options: [
        { value: "sql", label: "SQL", description: null },
        { value: "ilp", label: "ILP", description: null },
      ],
      multiple: true,
      required: false,
      otherFieldId: null,
    },
    {
      id: "notes",
      kind: "text",
      title: "Other",
      prompt: null,
      required: false,
    },
  ],
}

describe("buildQuestionRecord", () => {
  it("keeps each question with its answer by label, the user's own answer included", () => {
    // When
    const record = buildQuestionRecord(question, {
      database_custom: "SQLite",
      features: ["sql", "ilp"],
    })

    // Then
    expect(record).toEqual({
      questions: [
        { question: "Database", answer: "SQLite" },
        { question: "Features", answer: "SQL, ILP" },
        { question: "Other", answer: null },
      ],
      skipped: false,
    })
  })

  it("preserves a literal answer and records skipped questions", () => {
    // When
    const withBackticks = buildQuestionRecord(question, {
      database_custom: "use ```sqlite```",
    })
    const skipped = buildQuestionRecord(question, null)

    // Then
    expect(withBackticks.questions[0].answer).toBe("use ```sqlite```")
    expect(skipped).toMatchObject({ skipped: true })
    expect(questionRecordText(skipped)).toContain("Answer: Skipped")
  })

  it("keeps only where a link led, not its address", () => {
    // Given
    const link = {
      v: "0.6.0",
      type: "agent_question" as const,
      requestId: "r1",
      conversationId: "c1",
      message: "Sign in to Example.",
      fields: [],
      url: "https://auth.example.com/authorize?state=abc&code=secret",
    }

    // When
    const opened = buildQuestionRecord(link, {})
    // Then
    expect(questionRecordText(opened)).not.toContain("secret")
    expect(opened).toEqual({
      questions: [
        { question: "Sign in to Example.", answer: "Opened auth.example.com" },
      ],
      skipped: false,
      link: true,
    })
  })
})
