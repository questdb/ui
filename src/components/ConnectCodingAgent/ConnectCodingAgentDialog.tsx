import React, { useState } from "react"
import styled from "styled-components"
import { ChatsCircleIcon } from "@phosphor-icons/react"
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
import { DisclosureToggle } from "../../scenes/Footer/MCPBridgeStatus/popoverParts"
import {
  connectCommandOf,
  consoleUrlOf,
  MCP_RELEASES_URL,
  type CommandChannel,
} from "./connectCommand"
import type { ChatAgent } from "../../utils/localAgent/chatAgents"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { AGENT_VALUE } from "./copy"

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
  npx: { to: "standalone", label: "Show the node command" },
  standalone: { to: "npx", label: "Show the npx command" },
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The agent to run, when the console knows the user's coding agent.
  chatAgent: ChatAgent | null
}

export const ConnectCodingAgentDialog = ({
  open,
  onOpenChange,
  chatAgent,
}: Props) => {
  const [channel, setChannel] = useState<CommandChannel>("npx")
  const [showTroubles, setShowTroubles] = useState(false)
  // A known agent is named in the command; otherwise `connect` asks.
  const command = connectCommandOf(
    consoleUrlOf(window.location),
    channel,
    chatAgent?.id ?? null,
  )

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <Overlay
          primitive={AlertDialog.Overlay}
          onClick={() => onOpenChange(false)}
          dataHook="connect-agent-overlay"
        />
        <StyledContent data-hook="connect-agent-dialog">
          <Hero>
            <IconBadge>
              <ChatsCircleIcon size={28} weight="duotone" />
            </IconBadge>
            <Title>
              Use {chatAgent?.label ?? "your agent"} in the AI Assistant
            </Title>
            <Lede>{AGENT_VALUE}</Lede>
          </Hero>

          <Body>
            <Field>
              <FieldLabel>Start {chatAgent?.label ?? "your agent"}</FieldLabel>
              <CopyableCommand
                command={command}
                onCopy={() =>
                  void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
                    source: "dialog",
                    agent: chatAgent?.id ?? null,
                  })
                }
              />
            </Field>
            <DisclosureToggle
              type="button"
              aria-expanded={showTroubles}
              onClick={() => setShowTroubles(!showTroubles)}
              data-hook="connect-agent-troubles-toggle"
            >
              Having trouble?
            </DisclosureToggle>
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
                  shows, and accept the connection there.
                </li>
                <li>
                  <strong>npm cannot reach the internet</strong>: download the
                  .mjs file from the{" "}
                  <a href={MCP_RELEASES_URL} target="_blank" rel="noreferrer">
                    GitHub releases
                  </a>{" "}
                  and run it with node.{" "}
                  <TextButton
                    type="button"
                    onClick={() => setChannel(CHANNEL_SWITCH[channel].to)}
                    data-hook="connect-agent-channel-switch"
                  >
                    {CHANNEL_SWITCH[channel].label}
                  </TextButton>
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
