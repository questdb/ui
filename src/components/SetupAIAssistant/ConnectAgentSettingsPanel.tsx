import React from "react"
import styled from "styled-components"
import { CopyableCommand } from "../../scenes/Footer/MCPBridgeStatus/CopyableCommand"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../ConnectCodingAgent/connectCommand"
import { AGENT_VALUE } from "../ConnectCodingAgent/copy"
import { useMCPBridge } from "../../providers/MCPBridgeProvider"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  width: 100%;
`

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

const Title = styled.h3`
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Lede = styled.p`
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const FieldLabel = styled.span`
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.contentSecondary};
`

// The settings tab of a coding agent before one is connected: the same
// command as the connect dialog. Once the agent connects, the tab shows its
// settings instead.
export const ConnectAgentSettingsPanel = () => {
  // A coding agent working from the terminal is the one to suggest.
  const { mcpClient } = useMCPBridge()
  const command = connectCommandOf(
    consoleUrlOf(window.location),
    "npx",
    mcpClient?.chatAgent?.id ?? null,
  )

  return (
    <Panel data-hook="ai-settings-connect-agent">
      <Intro>
        <Title>Use your agent in the AI Assistant</Title>
        <Lede>{AGENT_VALUE}</Lede>
      </Intro>
      <Field>
        <FieldLabel>
          Start {mcpClient?.chatAgent?.label ?? "your agent"}
        </FieldLabel>
        <CopyableCommand
          command={command}
          onCopy={() =>
            void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
              source: "settings",
            })
          }
        />
      </Field>
    </Panel>
  )
}
