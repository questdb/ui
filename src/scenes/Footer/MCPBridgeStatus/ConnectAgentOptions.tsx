import React from "react"
import styled from "styled-components"
import { ChatsCircleIcon, TerminalWindowIcon } from "@phosphor-icons/react"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../../../components/ConnectCodingAgent/connectCommand"
import {
  FROM_TERMINAL,
  IN_AI_ASSISTANT,
} from "../../../components/ConnectCodingAgent/copy"
import { MCP_SETUP_COMMAND } from "../../../utils/mcp/protocolVersion"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { CopyableCommand } from "./CopyableCommand"
import { Separator } from "../../../components/ConnectCodingAgent/parts"

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1.4rem 1.6rem;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const Option = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`

const OptionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`

const OptionTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const Note = styled.p`
  margin: 0.6rem 0 0;
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// No agent connected: the two ways to use a coding agent with the console,
// the AI Assistant first. A title and a command each; nothing more.
// `connect` asks in the terminal which agent to run.
export const ConnectAgentOptions = () => {
  const connectCommand = connectCommandOf(consoleUrlOf(window.location), "npx")

  return (
    <Options>
      <Option data-hook="mcp-pair-chat-option">
        <OptionHeader>
          <OptionTitle>
            <ChatsCircleIcon size={16} weight="duotone" />
            {IN_AI_ASSISTANT.title}
          </OptionTitle>
        </OptionHeader>
        <CopyableCommand
          command={connectCommand}
          onCopy={() =>
            void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
              source: "mcp_popover",
            })
          }
        />
      </Option>
      <Separator label="or" />
      <Option data-hook="mcp-pair-setup-notice">
        <OptionHeader>
          <OptionTitle>
            <TerminalWindowIcon size={16} weight="duotone" />
            {FROM_TERMINAL.title}
          </OptionTitle>
        </OptionHeader>
        <CopyableCommand
          command={MCP_SETUP_COMMAND}
          onCopy={() =>
            void trackEvent(ConsoleEvent.MCP_SETUP_COMMAND_COPY, {
              source: "mcp_popover",
            })
          }
        />
        <Note>{FROM_TERMINAL.then}</Note>
      </Option>
    </Options>
  )
}
