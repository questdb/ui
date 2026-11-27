import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"
import {
  MCP_UPGRADE_COMMAND,
  mcpVersionMismatchCopy,
  type BridgeVersionMismatch,
} from "../../../utils/mcp/protocolVersion"
import type { McpClient } from "../../../utils/mcp/mcpClients"
import { mcpAgentNames } from "./agentStatus"
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

// MCP mode: the coding agent's MCP server runs another version than this
// console expects. Chat mode has AgentUpgradeNotice.
export const BridgeUpgradeNotice = ({
  severity,
  client,
}: {
  severity: BridgeVersionMismatch
  client: McpClient | null
}) => {
  const copy = mcpVersionMismatchCopy(severity, mcpAgentNames(client))
  return (
    <>
      <WarningIcon size={16} weight="duotone" />
      <Text>
        <strong>{copy.title}</strong>
        <Detail>{copy.message}</Detail>
        <CopyableCommand command={MCP_UPGRADE_COMMAND} />
      </Text>
    </>
  )
}
