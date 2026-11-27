import type { AgentQuestionField, AgentQuestionMessage } from "./protocol"
import { ownValue } from "../ownValue"

export type QuestionView = {
  // The question to show.
  text: string
  // A short name for its tab.
  label: string
}

const MAX_LABEL_LENGTH = 24

const present = (value: string | null | undefined): value is string =>
  !!value?.trim()

// Agents put a question's text in different places: Claude Code in the form's
// message for a single question and in the field's description otherwise,
// with a short header as its title; Codex in the field's title, with a
// generic message. The text is the one that reads as a question, else the
// longest; the label is the shorter one.
export const questionViews = (question: AgentQuestionMessage): QuestionView[] =>
  question.fields.map((field: AgentQuestionField, index) => {
    const own = [field.title, field.prompt].filter(present).map((s) => s.trim())
    const candidates =
      question.fields.length === 1 && present(question.message)
        ? [...own, question.message.trim()]
        : own
    const text =
      candidates.find((candidate) => candidate.endsWith("?")) ??
      [...own].sort((a, b) => b.length - a.length)[0] ??
      question.message.trim() ??
      "Question"
    const label =
      own
        .filter((candidate) => candidate !== text)
        .sort((a, b) => a.length - b.length)
        .find((candidate) => candidate.length <= MAX_LABEL_LENGTH) ??
      (text.length <= MAX_LABEL_LENGTH ? text : `Question ${index + 1}`)
    return { text, label }
  })

// A field's answer as the user would read it: option labels, and the user's
// own answer.
export const answerSummary = (
  field: AgentQuestionField,
  answers: Record<string, string | string[]>,
): string | null => {
  const listOf = (id: string | null) => {
    if (!id) return []
    const answer = ownValue(answers, id)
    return (Array.isArray(answer) ? answer : [answer ?? ""]).filter(
      (value) => value.trim() !== "",
    )
  }
  if (field.kind === "text") return listOf(field.id).join(", ") || null
  // In the options' order, whatever order they were picked in.
  const values = listOf(field.id)
  const picked = [
    ...field.options
      .filter((option) => values.includes(option.value))
      .map((option) => option.label),
    ...values.filter(
      (value) => !field.options.some((option) => option.value === value),
    ),
  ]
  const parts = [...picked, ...listOf(field.otherFieldId).map((s) => s.trim())]
  return parts.length > 0 ? parts.join(", ") : null
}
