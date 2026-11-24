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

const messageOf = (severity: BridgeVersionMismatch, agentLabel: string) =>
  severity === "major"
    ? `${agentLabel} runs a version this console does not support. This console expects ${EXPECTED_MCP_VERSION}. Stop it with Ctrl+C and run:`
    : `${agentLabel} runs an older version than this console expects (${EXPECTED_MCP_VERSION}). Some tools may not work until you stop it with Ctrl+C and run:`

export const AgentUpgradeNotice = ({
  severity,
  agentLabel,
}: {
  severity: BridgeVersionMismatch
  agentLabel: string
}) => (
  <>
    <WarningIcon size={16} weight="duotone" />
    <Text>
      <strong>Run the connect command again</strong>
      <Detail>{messageOf(severity, agentLabel)}</Detail>
      <CopyableCommand
        command={connectCommandOf(consoleUrlOf(window.location), "npx")}
      />
    </Text>
  </>
)
