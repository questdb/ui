import React, { useState } from "react"
import styled from "styled-components"
import { TerminalWindowIcon } from "@phosphor-icons/react"
import { AlertDialog } from "../AlertDialog"
import { Overlay } from "../Overlay"
import { Button } from "../Button"
import { TextButton } from "../TextButton"
import {
  Actions,
  Body,
  Hero,
  IconBadge,
  Lede,
  StyledContent,
  Title,
} from "../../providers/MCPBridgeProvider/consentDialogParts"
import { CopyableCommand } from "../../scenes/Footer/MCPBridgeStatus/CopyableCommand"
import {
  connectCommandOf,
  consoleUrlOf,
  MCP_RELEASES_URL,
  type CommandChannel,
} from "./connectCommand"

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 1.1rem;
`

const FieldLabel = styled.span`
  color: ${({ theme }) => theme.color.contentSecondary};
  text-transform: uppercase;
  font-weight: 600;
`

const Hint = styled.p`
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const TroublesToggle = styled(TextButton)`
  align-self: flex-start;
  font-size: 1.2rem;
`

const Troubles = styled.ul`
  margin: 0;
  padding: 1.2rem 1.6rem 1.2rem 3.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
  background: ${({ theme }) => theme.color.surfaceInset};

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }

  a {
    color: ${({ theme }) => theme.color.contentAccent};
  }
`

const CHANNEL_SWITCH: Record<
  CommandChannel,
  { to: CommandChannel; label: string }
> = {
  npx: { to: "standalone", label: "Using the downloaded .mjs file?" },
  standalone: { to: "npx", label: "Using npx?" },
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ConnectCodingAgentDialog = ({ open, onOpenChange }: Props) => {
  const [channel, setChannel] = useState<CommandChannel>("npx")
  const [showTroubles, setShowTroubles] = useState(false)
  const command = connectCommandOf(consoleUrlOf(window.location), channel)

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <Overlay primitive={AlertDialog.Overlay} />
        <StyledContent data-hook="connect-agent-dialog">
          <Hero>
            <IconBadge>
              <TerminalWindowIcon size={28} weight="duotone" />
            </IconBadge>
            <Title>Connect your coding agent</Title>
            <Lede>
              Chat with Claude Code, Codex, Gemini, Copilot or Cursor here, with
              the subscription you already have.
            </Lede>
          </Hero>

          <Body>
            <Field>
              <FieldLabel>Run this in your terminal</FieldLabel>
              <CopyableCommand command={command} />
            </Field>
            <Hint>
              It opens the Web Console in a new tab, where you accept the
              connection. It needs Node.js 22 or later.{" "}
              <TextButton
                type="button"
                onClick={() => setChannel(CHANNEL_SWITCH[channel].to)}
                data-hook="connect-agent-channel-switch"
              >
                {CHANNEL_SWITCH[channel].label}
              </TextButton>
            </Hint>
            <TroublesToggle
              type="button"
              aria-expanded={showTroubles}
              onClick={() => setShowTroubles(!showTroubles)}
              data-hook="connect-agent-troubles-toggle"
            >
              Having trouble?
            </TroublesToggle>
            {showTroubles && (
              <Troubles data-hook="connect-agent-troubles">
                <li>
                  <strong>npx: command not found</strong>: install Node.js from{" "}
                  <a href="https://nodejs.org" target="_blank" rel="noreferrer">
                    nodejs.org
                  </a>
                  , then run the command again.
                </li>
                <li>
                  <strong>No new tab opens</strong>: open the link the terminal
                  shows.
                </li>
                <li>
                  <strong>npm cannot reach the internet</strong>: download the
                  .mjs file from the{" "}
                  <a href={MCP_RELEASES_URL} target="_blank" rel="noreferrer">
                    GitHub releases
                  </a>{" "}
                  and run it with node.
                </li>
              </Troubles>
            )}
          </Body>

          <Actions>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" dataHook="connect-agent-close">
                Close
              </Button>
            </AlertDialog.Cancel>
          </Actions>
        </StyledContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
