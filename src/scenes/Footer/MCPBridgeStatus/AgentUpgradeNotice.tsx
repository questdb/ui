import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"
import {
  EXPECTED_MCP_VERSION,
  type BridgeVersionMismatch,
} from "../../../utils/mcp/protocolVersion"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../../../components/ConnectCodingAgent/connectCommand"
import { CopyableCommand } from "./CopyableCommand"
import { chatAgentOf } from "../../../utils/localAgent/chatAgents"

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  line-height: 1.4;
`

const Detail = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  word-break: break-word;
`

// `run` ends the sentence: the command to run, or how to run it. The title
// and the popover already say which agent needs the update.
const messageOf = (severity: BridgeVersionMismatch, run: string) =>
  severity === "major"
    ? `This console expects ${EXPECTED_MCP_VERSION}. Stop it with Ctrl+C and run ${run}`
    : `This console expects ${EXPECTED_MCP_VERSION}. Some tools may not work until you stop it with Ctrl+C and run ${run}`

// Chat mode: the agent's MCP server runs another version than this console
// expects. Titles match the terminal mode's BridgeUpgradeNotice; the command
// runs the same agent again.
export const AgentUpgradeNotice = ({
  severity,
  agentLabel,
  agentId = null,
}: {
  severity: BridgeVersionMismatch
  agentLabel: string
  agentId?: string | null
}) => {
  // A custom agent (--agent-command) has no preset: no command runs it.
  const preset = chatAgentOf({ id: agentId ?? undefined, label: agentLabel })
  return (
    <>
      <WarningIcon size={16} weight="duotone" />
      <Text>
        <strong>
          {severity === "major" ? "Update required" : "Update recommended"}
        </strong>
        <Detail>
          {messageOf(
            severity,
            preset ? "this:" : "the connect command you started it with again.",
          )}
        </Detail>
        {preset && (
          <CopyableCommand
            command={connectCommandOf(
              consoleUrlOf(window.location),
              "npx",
              preset.id,
            )}
          />
        )}
      </Text>
    </>
  )
}
