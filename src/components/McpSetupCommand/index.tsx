import React from "react"
import styled from "styled-components"
import { CopyButton } from "../CopyButton"
import { CopyCommand } from "../icons/copy-command"
import {
  EXPECTED_MCP_VERSION,
  MCP_PACKAGE,
  MCP_SETUP_COMMAND,
} from "../../utils/mcp/protocolVersion"
import { color } from "../../utils"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const Code = styled.span`
  flex: 1;
  min-width: 0;
  background: transparent;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  color: ${color("offWhite2")};
  overflow-wrap: anywhere;
`

const Package = styled.span`
  color: ${color("cyan")};
`

const CopyCommandButton = styled(CopyButton)`
  && {
    height: auto;
    min-width: 0;
    flex-shrink: 0;
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

export const McpSetupCommand = ({
  iconSize = 16,
  source,
}: {
  iconSize?: number
  source: "promo" | "onboarding"
}) => (
  <>
    <Code>
      npx{" "}
      <Package>
        {MCP_PACKAGE}@{EXPECTED_MCP_VERSION}
      </Package>{" "}
      setup
    </Code>
    <CopyCommandButton
      iconOnly
      skin="transparent"
      size="sm"
      text={MCP_SETUP_COMMAND}
      icon={<CopyCommand size={iconSize} />}
      onCopy={() =>
        void trackEvent(ConsoleEvent.MCP_SETUP_COMMAND_COPY, { source })
      }
    />
  </>
)
