import React, { useLayoutEffect, useRef } from "react"
import styled from "styled-components"
import { floatingSurfaceStyles } from "../../../components/overlayStyles"
import type { SlashCommand } from "./slashCommands"

const Menu = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--command-popup-bottom, calc(100% + 0.6rem));
  top: var(--command-popup-top, auto);
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  box-sizing: border-box;
  max-height: min(28rem, var(--command-popup-room, 28rem));
  overflow-x: hidden;
  overflow-y: auto;
  ${floatingSurfaceStyles}
`

const useCommandPopup = (highlighted?: number) => {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const popup = ref.current
    const anchor = popup?.parentElement
    const panel = anchor?.closest("[data-chat-panel]")
    if (!popup || !anchor || !panel) return

    const update = () => {
      const { top, bottom } = panel.getBoundingClientRect()
      const anchorTop = anchor.getBoundingClientRect().top
      const inset = 6
      const roomAbove = anchorTop - top - 2 * inset
      // When the transcript cannot fit even a full row, overlay the top of
      // the chat panel instead. The textarea retains keyboard focus.
      const overlay = roomAbove < 48
      popup.style.setProperty(
        "--command-popup-top",
        overlay ? `${top - anchorTop + inset}px` : "auto",
      )
      popup.style.setProperty(
        "--command-popup-bottom",
        overlay ? "auto" : `${inset}px`,
      )
      popup.style.setProperty(
        "--command-popup-room",
        `${Math.max(0, overlay ? bottom - top - 2 * inset : roomAbove)}px`,
      )
      revealActiveOption(popup)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(panel)
    observer.observe(anchor)
    if (anchor.parentElement) observer.observe(anchor.parentElement)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (ref.current) revealActiveOption(ref.current)
  }, [highlighted])

  return ref
}

const revealActiveOption = (popup: HTMLDivElement) => {
  const active = popup.querySelector('[role="option"][aria-selected="true"]')
  if (!active) return
  const option = active.getBoundingClientRect()
  const top = popup.getBoundingClientRect().top + popup.clientTop
  const bottom = top + popup.clientHeight
  // Scroll only the menu, not the clipped drawer or surrounding composer.
  if (option.top < top) popup.scrollTop += option.top - top
  else if (option.bottom > bottom) popup.scrollTop += option.bottom - bottom
}

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
export const CommandArgumentHint = ({ command }: { command: SlashCommand }) => {
  const ref = useCommandPopup()
  return (
    <ArgumentHint ref={ref} role="note" data-hook="chat-command-hint">
      <Name>
        /{command.name}
        {command.hint && <Hint> {command.hint}</Hint>}
      </Name>
      <Description>{command.description}</Description>
    </ArgumentHint>
  )
}

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
  const ref = useCommandPopup(highlighted)

  return (
    <Menu ref={ref} data-hook="chat-command-menu">
      <div id={id} role="listbox" aria-label="Commands">
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
