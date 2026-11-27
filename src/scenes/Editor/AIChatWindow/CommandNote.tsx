import React from "react"
import styled, { useTheme } from "styled-components"
import { CheckIcon, WarningCircleIcon } from "@phosphor-icons/react"

// What a console command, like /model, did: shown in the chat where the user
// ran it, for the user only; it is not part of what the model reads.
export type CommandNoteEntry = {
  id: string
  command: string
  text: string
  error: boolean
  // The message it follows; null before the first.
  afterMessageId: string | null
}

const Row = styled.div`
  align-self: stretch;
  width: 100%;
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  column-gap: 0.8rem;
  row-gap: 0.2rem;
  padding: 0.4rem 0.8rem;
`

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  height: 2rem;
`

const Command = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  line-height: 2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow-wrap: anywhere;
`

const Result = styled.span<{ $error: boolean }>`
  grid-column: 2;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${({ theme, $error }) =>
    $error ? theme.color.statusDanger : theme.color.contentPrimary};
  overflow-wrap: anywhere;
`

export const CommandNote = ({ note }: { note: CommandNoteEntry }) => {
  const theme = useTheme()
  return (
    <Row
      role={note.error ? "alert" : "status"}
      data-hook={note.error ? "chat-command-error" : "chat-command-done"}
    >
      <Icon aria-hidden="true">
        {note.error ? (
          <WarningCircleIcon size={16} color={theme.color.statusDanger} />
        ) : (
          <CheckIcon size={16} color={theme.color.aiPinkStart} />
        )}
      </Icon>
      <Command>{note.command}</Command>
      <Result $error={note.error}>{note.text}</Result>
    </Row>
  )
}
