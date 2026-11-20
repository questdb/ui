import { answerSummary, questionViews } from "./questionDisplay"
import type { AgentQuestionMessage } from "./protocol"

// The language of the fenced block that keeps an answered question in the
// agent's reply. The chat renders it as the question and the user's answer;
// as text, the agent's next turns can still read it.
export const QUESTION_RECORD_LANGUAGE = "agent-question"

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
export const questionTranscript = (
  question: AgentQuestionMessage,
  answers: Record<string, string | string[]> | null,
): string => {
  const views = questionViews(question)
  const record: QuestionRecord = question.url
    ? {
        questions: [
          {
            question: question.message || `Open ${hostOf(question.url)}`,
            answer: answers ? `Opened ${hostOf(question.url)}` : null,
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
  // Backticks are escaped so that an answer cannot close the fence.
  const json = JSON.stringify(record).replace(/`/g, "\\u0060")
  return `\`\`\`${QUESTION_RECORD_LANGUAGE}\n${json}\n\`\`\``
}

export const parseQuestionRecord = (text: string): QuestionRecord | null => {
  try {
    const parsed = JSON.parse(text) as Partial<QuestionRecord> | null
    if (!parsed || !Array.isArray(parsed.questions)) return null
    const questions = parsed.questions.filter(
      (entry): entry is QuestionRecord["questions"][number] =>
        typeof entry?.question === "string" &&
        (typeof entry.answer === "string" || entry.answer === null),
    )
    return {
      questions,
      skipped: parsed.skipped === true,
      ...(parsed.link === true && { link: true }),
    }
  } catch {
    return null
  }
}
