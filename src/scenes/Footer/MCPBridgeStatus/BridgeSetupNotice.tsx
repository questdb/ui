import React from "react"
import styled from "styled-components"
import { TerminalWindowIcon } from "@phosphor-icons/react"
import { MCP_SETUP_COMMAND } from "../../../utils/mcp/protocolVersion"
import { CopyableCommand } from "./CopyableCommand"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1.2rem 1.6rem;
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.contentSecondary};
  }

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

export const BridgeSetupNotice = () => (
  <Root data-hook="mcp-pair-setup-notice">
    <Header>
      <TerminalWindowIcon size={16} weight="duotone" />
      <span>Haven&apos;t installed yet? Set it up in your terminal:</span>
    </Header>
    <CopyableCommand command={MCP_SETUP_COMMAND} />
  </Root>
)
