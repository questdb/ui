import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import { CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react"
import { Button, ButtonBase } from "../../../components"
import { AIStopButton } from "../../../components/AIStopButton"
import { Input } from "../../../components/Input"
import type {
  AgentQuestionField,
  AgentQuestionMessage,
} from "../../../utils/localAgent/protocol"
import {
  answerSummary,
  questionViews,
} from "../../../utils/localAgent/questionDisplay"
import { isImeKeyEvent } from "../../../utils/isImeKeyEvent"
import { focusWithinChat } from "./focusWithinChat"

type Answers = Record<string, string | string[]>

type QuestionDraft = {
  tab: number
  answers: Answers
  editing: boolean
  customDrafts: Map<string, string>
}

// Keep drafts only for the live request objects, never in saved chat history.
export type QuestionDrafts = WeakMap<AgentQuestionMessage, QuestionDraft>

export const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 1.2rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.8rem;
  background: ${({ theme }) => theme.color.surfaceInset};
`

export const Header = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.8rem;
`

export const Heading = styled.h3`
  flex: 1;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.contentSecondary};

  &:focus {
    outline: none;
  }
`

export const QuestionBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  /* Keep a scrollable slice in the body even if the card itself must scroll. */
  min-height: 3.2rem;
  overflow-y: auto;

  > * {
    flex-shrink: 0;
  }
`

const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`

const Tab = styled(ButtonBase)`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 2.6rem;
  padding: 0 0.9rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 999px;
  background: transparent;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;

  &:hover {
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  &[aria-selected="true"] {
    border-color: ${({ theme }) => theme.color.borderAccentStrong};
    color: ${({ theme }) => theme.color.contentPrimary};
  }

  svg {
    color: ${({ theme }) => theme.color.contentAccent};
  }
`

const SendError = styled.p`
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.statusDanger};
`

export const AnswerSendError = () => (
  <SendError role="alert">
    Could not send the answer. Check the connection to your coding agent and try
    again.
  </SendError>
)

export const QuestionText = styled.p`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 500;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`

const Hint = styled.span`
  font-size: 1.2rem;
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const Option = styled(ButtonBase)`
  display: grid;
  grid-template-columns: 1.8rem minmax(0, 1fr) 1.6rem;
  align-items: start;
  gap: 0.8rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
  background: transparent;
  color: ${({ theme }) => theme.color.contentPrimary};
  text-align: left;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.interactionHover};
  }

  &[aria-checked="true"] {
    border-color: ${({ theme }) => theme.color.borderAccentStrong};
  }
`

const OwnAnswerRow = styled.div`
  display: grid;
  grid-template-columns: 1.8rem minmax(0, 1fr);
  align-items: center;
  gap: 0.8rem;
  padding: 0.4rem 0.4rem 0.4rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.borderAccentStrong};
  border-radius: 0.6rem;
`

const OptionNumber = styled.span`
  font-size: 1.2rem;
  line-height: 1.8rem;
  color: ${({ theme }) => theme.color.contentMuted};
  font-variant-numeric: tabular-nums;
`

const OptionCopy = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`

const OptionLabel = styled.span`
  font-size: 1.3rem;
  line-height: 1.8rem;
  overflow-wrap: anywhere;
`

const OptionDescription = styled.span`
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Mark = styled.span`
  display: inline-flex;
  align-items: center;
  height: 1.8rem;
  color: ${({ theme }) => theme.color.contentAccent};
`

const Review = styled.dl`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
`

const ReviewItem = styled(ButtonBase)`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.6rem;
  background: transparent;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.color.interactionHover};
  }
`

const ReviewQuestion = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const ReviewAnswer = styled.span<{ $missing: boolean }>`
  font-size: 1.3rem;
  color: ${({ theme, $missing }) =>
    $missing ? theme.color.contentMuted : theme.color.contentPrimary};
  overflow-wrap: anywhere;
`

export const Footer = styled.div`
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
`

const KeyHint = styled.span`
  margin-left: auto;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

const valuesOf = (answer: string | string[] | undefined): string[] =>
  (Array.isArray(answer) ? answer : [answer ?? ""]).filter(
    (value) => value.trim() !== "",
  )

const isAnswered = (field: AgentQuestionField, answers: Answers): boolean =>
  answerSummary(field, answers) !== null

type QuestionCardProps = {
  agentLabel: string
  question: AgentQuestionMessage
  drafts?: QuestionDrafts
  // The card replaced the message box while the user typed in it.
  interruptsTyping: boolean
  onAnswer: (answers: Answers | null) => boolean
  onStop: () => void
}

// Shown in place of the message box while the agent waits for the user to
// answer, like the question prompts of Codex, Claude Code and OpenCode: one
// question at a time with tabs between them, a pick moves on by itself, the
// user's own answer is the last option, and several questions end in a
// review. Escape never answers.
export const QuestionCard = ({
  agentLabel,
  question,
  drafts,
  interruptsTyping,
  onAnswer,
  onStop,
}: QuestionCardProps) => {
  const fields = question.fields
  const views = useMemo(() => questionViews(question), [question])
  const single = fields.length === 1
  const reviewTab = fields.length
  const [tab, setTab] = useState(() => drafts?.get(question)?.tab ?? 0)
  const [answers, setAnswers] = useState<Answers>(
    () => drafts?.get(question)?.answers ?? {},
  )
  const [editing, setEditing] = useState(
    () => drafts?.get(question)?.editing ?? false,
  )
  const [customDrafts, setCustomDrafts] = useState(
    () => drafts?.get(question)?.customDrafts ?? new Map<string, string>(),
  )
  useLayoutEffect(() => {
    drafts?.set(question, { tab, answers, editing, customDrafts })
  }, [drafts, question, tab, answers, editing, customDrafts])
  const [answered, setAnswered] = useState(false)
  const [sendFailed, setSendFailed] = useState(false)
  const [ignoresDigitsOnHeading] = useState(interruptsTyping)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const questionTextRef = useRef<HTMLParagraphElement>(null)
  const textAnswerRef = useRef<HTMLInputElement>(null)
  const reviewTabRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const focusAfterAdvance = useRef(false)
  const field = fields[tab] as AgentQuestionField | undefined
  const draft =
    field?.kind === "choice" && field.otherFieldId
      ? (customDrafts.get(field.id) ??
        valuesOf(answers[field.otherFieldId])[0] ??
        "")
      : ""
  const canSend = fields.every(
    (candidate) => !candidate.required || isAnswered(candidate, answers),
  )

  useEffect(() => {
    focusWithinChat(headingRef.current)
  }, [question.requestId])

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    if (!focusAfterAdvance.current) return
    focusAfterAdvance.current = false
    focusWithinChat(
      tab === reviewTab
        ? reviewTabRef.current
        : (textAnswerRef.current ?? questionTextRef.current),
    )
  }, [tab, reviewTab])

  const finish = (result: Answers | null) => {
    if (answered) return
    const sent = onAnswer(result)
    setAnswered(sent)
    setSendFailed(!sent)
  }

  const goTo = (next: number, focus = false) => {
    const destination = Math.max(0, Math.min(single ? 0 : reviewTab, next))
    if (destination === tab) return
    focusAfterAdvance.current = focus
    setEditing(false)
    setTab(destination)
  }

  // After a pick: the next question, or the review after the last one. A
  // single question is sent right away.
  const moveOn = (next: Answers) => {
    if (single) {
      if (fields.every((f) => !f.required || isAnswered(f, next))) finish(next)
      return
    }
    goTo(tab + 1, true)
  }

  const setAnswer = (id: string, value: string | string[] | null) =>
    setAnswers((current) => {
      const next = { ...current }
      if (value === null) delete next[id]
      else next[id] = value
      return next
    })

  const clearCustomDraft = (id: string) =>
    setCustomDrafts((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })

  const pick = (target: AgentQuestionField, value: string) => {
    if (target.kind !== "choice") return
    if (target.multiple) {
      const picked = valuesOf(answers[target.id])
      setAnswer(
        target.id,
        picked.includes(value)
          ? picked.filter((item) => item !== value)
          : [...picked, value],
      )
      return
    }
    const next = { ...answers, [target.id]: value }
    if (target.otherFieldId) {
      delete next[target.otherFieldId]
      clearCustomDraft(target.id)
    }
    setAnswers(next)
    setEditing(false)
    moveOn(next)
  }

  const openOwnAnswer = (target: AgentQuestionField) => {
    if (target.kind !== "choice" || !target.otherFieldId) return
    setEditing(true)
  }

  const commitOwnAnswer = (target: AgentQuestionField): Answers => {
    if (target.kind !== "choice" || !target.otherFieldId) return answers
    const text = draft.trim()
    const next = { ...answers }
    if (text) next[target.otherFieldId] = text
    else delete next[target.otherFieldId]
    // A single choice has one answer: the user's own replaces the pick.
    if (text && !target.multiple) delete next[target.id]
    setAnswers(next)
    clearCustomDraft(target.id)
    setEditing(false)
    return next
  }

  const next = () => {
    moveOn(editing && field ? commitOwnAnswer(field) : answers)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (
      answered ||
      isImeKeyEvent(event) ||
      event.target instanceof HTMLInputElement
    )
      return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === "ArrowLeft" && !single) {
      event.preventDefault()
      goTo(tab - 1, true)
      return
    }
    if (event.key === "ArrowRight" && !single) {
      event.preventDefault()
      goTo(tab + 1, true)
      return
    }
    if (ignoresDigitsOnHeading && event.target === headingRef.current) return
    if (!field || field.kind !== "choice" || !/^[1-9]$/.test(event.key)) return
    const index = Number.parseInt(event.key, 10) - 1
    if (index < field.options.length) {
      event.preventDefault()
      pick(field, field.options[index].value)
    } else if (index === field.options.length && field.otherFieldId) {
      event.preventDefault()
      openOwnAnswer(field)
    }
  }

  const renderChoice = (
    target: Extract<AgentQuestionField, { kind: "choice" }>,
  ) => {
    const picked = valuesOf(answers[target.id])
    const own = target.otherFieldId
      ? (valuesOf(answers[target.otherFieldId])[0] ?? "")
      : ""
    return (
      <Options
        role={target.multiple ? "group" : "radiogroup"}
        aria-label={views[tab].text}
      >
        {target.options.map((option, index) => {
          const checked = picked.includes(option.value)
          return (
            <Option
              key={option.value}
              type="button"
              role={target.multiple ? "checkbox" : "radio"}
              aria-checked={checked}
              disabled={answered}
              onClick={() => pick(target, option.value)}
              data-hook="chat-question-option"
            >
              <OptionNumber aria-hidden="true">{index + 1}</OptionNumber>
              <OptionCopy>
                <OptionLabel>{option.label}</OptionLabel>
                {option.description && (
                  <OptionDescription>{option.description}</OptionDescription>
                )}
              </OptionCopy>
              <Mark>{checked && <CheckIcon size={14} weight="bold" />}</Mark>
            </Option>
          )
        })}
        {target.otherFieldId &&
          (editing ? (
            <OwnAnswerRow>
              <OptionNumber aria-hidden="true">
                {target.options.length + 1}
              </OptionNumber>
              <Input
                autoFocus
                value={draft}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomDrafts((current) =>
                    new Map(current).set(target.id, value),
                  )
                }}
                onKeyDown={(event) => {
                  if (isImeKeyEvent(event)) return
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const next = commitOwnAnswer(target)
                    if (draft.trim() && !target.multiple) moveOn(next)
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    event.stopPropagation()
                    clearCustomDraft(target.id)
                    setEditing(false)
                    questionTextRef.current?.focus()
                  }
                }}
                disabled={answered}
                data-drawer-owns-escape=""
                placeholder="Type your own answer"
                aria-label="Your own answer"
                data-hook="chat-question-own-answer"
              />
            </OwnAnswerRow>
          ) : (
            <Option
              type="button"
              role={target.multiple ? "checkbox" : "radio"}
              aria-checked={own !== ""}
              disabled={answered}
              onClick={() => openOwnAnswer(target)}
              data-hook="chat-question-own-answer-option"
            >
              <OptionNumber aria-hidden="true">
                {target.options.length + 1}
              </OptionNumber>
              <OptionCopy>
                <OptionLabel>{own || "Type your own answer"}</OptionLabel>
                {own && <OptionDescription>Your own answer</OptionDescription>}
              </OptionCopy>
              <Mark>
                {own ? (
                  <CheckIcon size={14} weight="bold" />
                ) : (
                  <PencilSimpleIcon size={14} aria-hidden="true" />
                )}
              </Mark>
            </Option>
          ))}
      </Options>
    )
  }

  const onReview = !single && tab === reviewTab
  const primaryLabel = single
    ? "Send"
    : tab + 1 >= reviewTab
      ? "Review"
      : "Next"
  const hasCustomDraft = editing && draft.trim() !== ""
  const showPrimary =
    // A listed single choice moves on by itself; a custom draft needs confirmation.
    !onReview && !!field && (editing || field.kind === "text" || field.multiple)

  return (
    <Card
      role="alertdialog"
      aria-labelledby={`question-${question.requestId}`}
      onKeyDown={handleKeyDown}
      data-hook="chat-question-card"
    >
      <Header>
        <Heading
          id={`question-${question.requestId}`}
          ref={headingRef}
          tabIndex={-1}
        >
          {agentLabel} asks
        </Heading>
        <AIStopButton
          size="sm"
          onClick={onStop}
          title="Stop the agent"
          ariaLabel="Stop the agent"
          dataHook="chat-question-stop"
        />
      </Header>

      <QuestionBody ref={bodyRef}>
        {!single && (
          <Tabs role="tablist" aria-label="Questions">
            {fields.map((candidate, index) => (
              <Tab
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={tab === index}
                onClick={() => goTo(index)}
                data-hook="chat-question-tab"
              >
                {isAnswered(candidate, answers) && (
                  <CheckIcon size={12} weight="bold" aria-hidden="true" />
                )}
                {views[index].label}
              </Tab>
            ))}
            <Tab
              type="button"
              role="tab"
              aria-selected={onReview}
              ref={reviewTabRef}
              onClick={() => goTo(reviewTab)}
              data-hook="chat-question-review-tab"
            >
              Review
            </Tab>
          </Tabs>
        )}

        {onReview ? (
          <Review>
            {fields.map((candidate, index) => {
              const summary = answerSummary(candidate, answers)
              return (
                <ReviewItem
                  key={candidate.id}
                  type="button"
                  onClick={() => goTo(index, true)}
                  data-hook="chat-question-review-item"
                >
                  <ReviewQuestion>{views[index].text}</ReviewQuestion>
                  <ReviewAnswer $missing={!summary}>
                    {summary ?? "Not answered"}
                  </ReviewAnswer>
                </ReviewItem>
              )
            })}
          </Review>
        ) : (
          field && (
            <>
              <QuestionText
                ref={questionTextRef}
                tabIndex={-1}
                data-hook="chat-question-text"
              >
                {views[tab].text}
                {field.kind === "choice" && field.multiple && (
                  <Hint> Select all that apply</Hint>
                )}
              </QuestionText>
              {field.kind === "choice" ? (
                renderChoice(field)
              ) : (
                <Input
                  ref={textAnswerRef}
                  value={valuesOf(answers[field.id])[0] ?? ""}
                  onChange={(event) =>
                    setAnswer(field.id, event.target.value || null)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !isImeKeyEvent(event)) {
                      event.preventDefault()
                      next()
                    }
                  }}
                  placeholder="Type your answer"
                  aria-label={views[tab].text}
                  disabled={answered}
                  data-hook="chat-question-text-answer"
                />
              )}
            </>
          )
        )}

        {sendFailed && <AnswerSendError />}
      </QuestionBody>
      <Footer>
        {onReview && (
          <Button
            size="sm"
            variant="primary"
            disabled={answered || !canSend}
            onClick={() => finish(answers)}
            data-hook="chat-question-send"
          >
            Send
          </Button>
        )}
        {showPrimary && (
          <Button
            size="sm"
            variant="primary"
            disabled={
              answered ||
              (editing &&
                field?.kind === "choice" &&
                !field.multiple &&
                !hasCustomDraft) ||
              (single && !canSend && !hasCustomDraft)
            }
            onClick={next}
            data-hook="chat-question-next"
          >
            {primaryLabel}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={answered}
          onClick={() => finish(null)}
          data-hook="chat-question-skip"
        >
          Skip
        </Button>
        {field?.kind === "choice" && !onReview && (
          <KeyHint aria-hidden="true">
            1–{Math.min(9, field.options.length + (field.otherFieldId ? 1 : 0))}{" "}
            to pick{single ? "" : " · ←/→ questions"}
          </KeyHint>
        )}
      </Footer>
    </Card>
  )
}
