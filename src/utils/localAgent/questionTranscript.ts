import { answerSummary, questionViews } from "./questionDisplay"
import type { AgentQuestionMessage } from "./protocol"

export type QuestionRecord = {
  questions: { question: string; answer: string | null }[]
  skipped: boolean
  // A page the agent asked the user to open, not a question.
  link?: boolean
}

// Just the host: a sign-in address carries state and codes that should not
// stay in the chat or go back to the agent.
const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return "the page"
  }
}

// The questions and the user's answers, in the reply where they were asked,
// so the chat keeps both.
export const buildQuestionRecord = (
  question: AgentQuestionMessage,
  answers: Record<string, string | string[]> | null,
): QuestionRecord => {
  const views = questionViews(question)
  const host = question.url ? hostOf(question.url) : null
  return question.url && host
    ? {
        questions: [
          {
            // The agent's prompt may also repeat the requested address.
            question:
              question.message.replaceAll(question.url, () => host) ||
              `Open ${host}`,
            answer: answers ? `Opened ${host}` : null,
          },
        ],
        skipped: answers === null,
        link: true,
      }
    : {
        questions: question.fields.map((field, index) => ({
          question: views[index].text,
          answer: answers ? answerSummary(field, answers) : null,
        })),
        skipped: answers === null,
      }
}

// Plain text for copy and future turns. Card rendering uses the saved record,
// not this text.
export const questionRecordText = (record: QuestionRecord): string =>
  record.questions
    .map(({ question, answer }) => {
      if (record.link) return `${question}\n${answer ?? "Not opened"}`
      return `Question: ${question}\nAnswer: ${answer ?? (record.skipped ? "Skipped" : "No answer")}`
    })
    .join("\n\n")
