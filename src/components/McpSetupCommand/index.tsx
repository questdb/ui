import React from "react"
import styled from "styled-components"
import { CopyButton } from "../CopyButton"
import { CopyCommand } from "../icons/copy-command"
import { EXPECTED_BRIDGE_VERSION } from "../../utils/mcp/protocolVersion"
import { color } from "../../utils"

export const SETUP_COMMAND = `npx @questdb/mcp-bridge@${EXPECTED_BRIDGE_VERSION} setup`

const Code = styled.span`
  flex: 1;
  min-width: 0;
  background: transparent;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  color: ${color("offWhite2")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Package = styled.span`
  color: ${color("cyan")};
`

const CopyCommandButton = styled(CopyButton)`
  && {
    height: auto;
    min-width: 0;
    padding: 0.4rem;
    background: transparent;
    border: none;
    box-shadow: none;
    color: ${color("mutedLabel")};
  }

  &&:hover:not([disabled]) {
    background: transparent;
    color: ${color("foreground")};
  }

  &[data-copied] > svg:first-child {
    top: 0.1rem;
    right: 0.1rem;
    transform: none;
  }
`

export const McpSetupCommand = ({ iconSize = 16 }: { iconSize?: number }) => (
  <>
    <Code>
      npx <Package>@questdb/mcp-bridge@{EXPECTED_BRIDGE_VERSION}</Package> setup
    </Code>
    <CopyCommandButton
      iconOnly
      skin="transparent"
      size="sm"
      text={SETUP_COMMAND}
      icon={<CopyCommand size={iconSize} />}
    />
  </>
)
