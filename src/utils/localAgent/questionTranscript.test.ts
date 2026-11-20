import { describe, expect, it } from "vitest"
import type { AgentQuestionMessage } from "./protocol"
import { parseQuestionRecord, questionTranscript } from "./questionTranscript"

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

const recordOf = (text: string) => {
  const match = /^```agent-question\n([\s\S]*)\n```$/.exec(text)
  return match ? parseQuestionRecord(match[1]) : null
}

describe("questionTranscript", () => {
  it("keeps each question with its answer by label, the user's own answer included", () => {
    // When
    const text = questionTranscript(question, {
      database_custom: "SQLite",
      features: ["sql", "ilp"],
    })

    // Then
    expect(recordOf(text)).toEqual({
      questions: [
        { question: "Database", answer: "SQLite" },
        { question: "Features", answer: "SQL, ILP" },
        { question: "Other", answer: null },
      ],
      skipped: false,
    })
  })

  it("keeps a backtick in an answer from closing the block, and records skipped questions", () => {
    // When
    const withBackticks = questionTranscript(question, {
      database_custom: "use ```sqlite```",
    })
    const skipped = questionTranscript(question, null)

    // Then
    expect(withBackticks.match(/```/g)).toHaveLength(2)
    expect(recordOf(withBackticks)?.questions[0].answer).toBe(
      "use ```sqlite```",
    )
    expect(recordOf(skipped)).toMatchObject({ skipped: true })
  })

  it("ignores a block that is not a question record", () => {
    // Then
    expect(parseQuestionRecord("not json")).toBeNull()
    expect(parseQuestionRecord('{"other":1}')).toBeNull()
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
    const opened = questionTranscript(link, {})
    const body = /```agent-question\n([^]*)\n```/.exec(opened)?.[1] ?? ""

    // Then
    expect(opened).not.toContain("secret")
    expect(parseQuestionRecord(body)).toEqual({
      questions: [
        { question: "Sign in to Example.", answer: "Opened auth.example.com" },
      ],
      skipped: false,
      link: true,
    })
  })
})
