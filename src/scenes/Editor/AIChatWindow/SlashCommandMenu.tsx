import React, { useEffect, useRef } from "react"
import styled from "styled-components"
import type { SlashCommand } from "./slashCommands"

const Menu = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 0.6rem);
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  max-height: 28rem;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.8rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  box-shadow: 0 0.8rem 2.4rem ${({ theme }) => theme.color.shadowMedium};
`

const Row = styled.div<{ $active: boolean }>`
  display: grid;
  grid-template-columns: fit-content(70%) minmax(0, 1fr);
  align-items: baseline;
  column-gap: 1.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  cursor: pointer;
  background: ${({ theme, $active }) =>
    $active ? theme.color.interactionHover : "transparent"};
`

const Name = styled.span`
  font-size: 1.3rem;
  font-weight: 500;
  color: ${({ theme }) => theme.color.contentPrimary};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Hint = styled.span`
  font-weight: 400;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Description = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Footer = styled.div`
  padding: 0.6rem 0.8rem 0.2rem;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentMuted};
  overflow-wrap: anywhere;
`

export const commandOptionId = (listId: string, index: number) =>
  `${listId}-${index}`

const argumentName = (hint: string) => hint.replace(/[[\]<>]/g, "").trim()

// What Enter does for the highlighted command, when it is not just running.
const footerFor = (command: SlashCommand | undefined): string | null => {
  if (!command) return null
  if (command.source === "console")
    return `Enter to pick from the list · Tab to type a ${argumentName(command.hint ?? "name")}`
  if (command.hint)
    return `Enter to add ${argumentName(command.hint)} · Esc to close`
  return null
}

const ArgumentHint = styled(Menu)`
  padding: 0.8rem 1.2rem;
  gap: 0.2rem;

  ${Name} {
    white-space: normal;
    overflow-wrap: anywhere;
  }
`

// The argument a command takes, until the user types it, as the menu left it.
export const CommandArgumentHint = ({ command }: { command: SlashCommand }) => (
  <ArgumentHint role="note" data-hook="chat-command-hint">
    <Name>
      /{command.name}
      {command.hint && <Hint> {command.hint}</Hint>}
    </Name>
    <Description>{command.description}</Description>
  </ArgumentHint>
)

type SlashCommandMenuProps = {
  id: string
  commands: SlashCommand[]
  highlighted: number
  onHighlight: (index: number) => void
  onChoose: (command: SlashCommand) => void
}

// The commands that match what the user types after "/", above the message
// box. The keyboard stays in the message box: ↑/↓ move, Enter runs, Tab
// completes, Escape closes.
export const SlashCommandMenu = ({
  id,
  commands,
  highlighted,
  onHighlight,
  onChoose,
}: SlashCommandMenuProps) => {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current
      ?.querySelector(`#${CSS.escape(commandOptionId(id, highlighted))}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [id, highlighted])

  return (
    <Menu data-hook="chat-command-menu">
      <div ref={listRef} id={id} role="listbox" aria-label="Commands">
        {commands.map((command, index) => (
          <Row
            key={command.name}
            id={commandOptionId(id, index)}
            role="option"
            aria-selected={index === highlighted}
            $active={index === highlighted}
            // The message box keeps the focus.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHighlight(index)}
            onClick={() => onChoose(command)}
            data-hook="chat-command-option"
          >
            <Name
              title={`/${command.name}${command.hint ? ` ${command.hint}` : ""}`}
            >
              /{command.name}
              {command.hint && <Hint> {command.hint}</Hint>}
            </Name>
            <Description title={command.description}>
              {command.description}
            </Description>
          </Row>
        ))}
      </div>
      {footerFor(commands[highlighted]) && (
        <Footer aria-hidden="true">{footerFor(commands[highlighted])}</Footer>
      )}
    </Menu>
  )
}
