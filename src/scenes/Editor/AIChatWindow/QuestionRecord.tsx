import React from "react"
import styled from "styled-components"
import { LinkSimpleIcon, QuestionIcon } from "@phosphor-icons/react"
import type { QuestionRecord as Record } from "../../../utils/localAgent/questionTranscript"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin: 1rem 0;
`

const Entry = styled.div`
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  column-gap: 0.8rem;
  row-gap: 0.6rem;
`

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  height: 2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Question = styled.span`
  font-size: 1.4rem;
  line-height: 2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow-wrap: anywhere;
`

// Only the user's answer is quoted.
const Answer = styled.span<{ $missing: boolean }>`
  grid-column: 2;
  padding-left: 1rem;
  border-left: 2px solid ${({ theme }) => theme.color.borderStrong};
  font-size: 1.4rem;
  line-height: 1.5;
  color: ${({ theme, $missing }) =>
    $missing ? theme.color.contentMuted : theme.color.contentPrimary};
  font-style: ${({ $missing }) => ($missing ? "italic" : "normal")};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`

// A question the agent asked during its reply, and what the user answered.
export const QuestionRecord = ({ record }: { record: Record }) => (
  <Root data-hook="chat-question-record">
    {record.questions.map((entry, index) => (
      // eslint-disable-next-line react/no-array-index-key -- questions have no id and never reorder
      <Entry key={index}>
        <Icon aria-hidden="true">
          {record.link ? (
            <LinkSimpleIcon size={16} />
          ) : (
            <QuestionIcon size={16} />
          )}
        </Icon>
        <Question>{entry.question}</Question>
        <Answer $missing={!entry.answer}>
          {entry.answer ??
            (record.link
              ? "Not opened"
              : record.skipped
                ? "Skipped"
                : "No answer")}
        </Answer>
      </Entry>
    ))}
  </Root>
)
