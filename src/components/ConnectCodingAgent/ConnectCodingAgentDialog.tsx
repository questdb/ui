import React, { useState } from "react"
import styled from "styled-components"
import { Dialog } from "../Dialog"
import { Overlay } from "../Overlay"
import { ForwardRef } from "../ForwardRef"
import { Button } from "../Button"
import { CopyButton } from "../CopyButton"
import { TextButton } from "../TextButton"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  connectCommandOf,
  consoleUrlOf,
  MCP_RELEASES_URL,
  type CommandChannel,
} from "./connectCommand"

const Content = styled(Dialog.Content)`
  padding-bottom: 2rem;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  padding: 2rem 2rem 0;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Lede = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Steps = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
`

const Step = styled.li`
  display: grid;
  grid-template-columns: 2.2rem 1fr;
  gap: 1rem;
`

const StepNumber = styled.span`
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
  background: ${({ theme }) => theme.color.surfaceBase};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
`

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
`

const StepTitle = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const CommandRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
`

const Command = styled.code`
  flex: 1;
  min-width: 0;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.25rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.color.contentPrimary};
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.4rem;
  padding: 0.8rem 1rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: all;
`

const Hint = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentMuted};
`

const Trouble = styled.details`
  summary {
    cursor: pointer;
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  ul {
    margin: 0.8rem 0 0;
    padding-left: 1.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }

  a {
    color: ${({ theme }) => theme.color.contentAccent};
  }
`

const OTHER_CHANNEL: Record<CommandChannel, CommandChannel> = {
  npx: "standalone",
  standalone: "npx",
}

const CHANNEL_SWITCH_LABEL: Record<CommandChannel, string> = {
  npx: "Using the downloaded .mjs file?",
  standalone: "Using npx?",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ConnectCodingAgentDialog = ({ open, onOpenChange }: Props) => {
  const [channel, setChannel] = useState<CommandChannel>("npx")
  const command = connectCommandOf(consoleUrlOf(window.location), channel)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>
        <Content
          maxwidth="56rem"
          aria-describedby={undefined}
          data-hook="connect-agent-dialog"
        >
          <Dialog.Title>Connect your coding agent</Dialog.Title>
          <Body>
            <Lede>
              Chat with Claude Code, Codex, Gemini, Copilot or Cursor here, with
              the subscription you already have. It works on your tables and
              notebooks.
            </Lede>
            <Steps>
              <Step>
                <StepNumber>1</StepNumber>
                <StepBody>
                  <StepTitle>Run this in your terminal</StepTitle>
                  <CommandRow>
                    <Command data-hook="connect-agent-command">
                      {command}
                    </Command>
                    <CopyButton
                      text={command}
                      iconOnly
                      size="sm"
                      onCopy={() =>
                        void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
                          channel,
                        })
                      }
                    />
                  </CommandRow>
                  <Hint>
                    Needs Node.js 22 or later.{" "}
                    <TextButton
                      type="button"
                      onClick={() => setChannel(OTHER_CHANNEL[channel])}
                      data-hook="connect-agent-channel-switch"
                    >
                      {CHANNEL_SWITCH_LABEL[channel]}
                    </TextButton>
                  </Hint>
                </StepBody>
              </Step>
              <Step>
                <StepNumber>2</StepNumber>
                <StepBody>
                  <StepTitle>Accept the prompt</StepTitle>
                  <span>
                    It opens the Web Console in a new tab. Accept the prompt
                    there, then chat with your agent in the AI Assistant.
                  </span>
                </StepBody>
              </Step>
            </Steps>
            <Trouble>
              <summary>Having trouble?</summary>
              <ul>
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
              </ul>
            </Trouble>
          </Body>
          <Dialog.ActionButtons>
            <Dialog.Close asChild>
              <Button variant="secondary" dataHook="connect-agent-close">
                Close
              </Button>
            </Dialog.Close>
          </Dialog.ActionButtons>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
