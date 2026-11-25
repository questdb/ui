import React from "react"
import styled from "styled-components"
import { CopyButton } from "../CopyButton"
import { CopyCommand } from "../icons/copy-command"
import { MCP_SETUP_COMMAND } from "../../utils/mcp/protocolVersion"
import { CommandText } from "../CommandText"
import { color } from "../../utils"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

const Code = styled.span`
  flex: 1;
  min-width: 0;
  background: transparent;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${color("contentSecondary")};
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
    color: ${color("contentMuted")};
  }

  &&:hover:not([disabled]) {
    background: transparent;
    color: ${color("contentPrimary")};
  }

  &[data-copied] > svg:first-child {
    top: 0.1rem;
    right: 0.1rem;
    transform: none;
  }
`

// A command in a notebook surface's command box, with a copy button.
// `after` draws more of the command under it (an option that comes and goes),
// and `copyText` is then the whole command the button copies.
export const TerminalCommand = ({
  command,
  iconSize = 16,
  onCopy,
  after,
  copyText,
}: {
  command: string
  iconSize?: number
  onCopy?: () => void
  after?: React.ReactNode
  copyText?: string
}) => (
  <>
    <Code>
      <CommandText command={command} />
      {after}
    </Code>
    <CopyCommandButton
      iconOnly
      variant="ghost"
      size="sm"
      text={copyText ?? command}
      icon={<CopyCommand size={iconSize} />}
      onCopy={onCopy}
    />
  </>
)

export const McpSetupCommand = ({
  iconSize = 16,
  source,
}: {
  iconSize?: number
  source: "promo" | "agent_promo"
}) => (
  <TerminalCommand
    command={MCP_SETUP_COMMAND}
    iconSize={iconSize}
    onCopy={() =>
      void trackEvent(ConsoleEvent.MCP_SETUP_COMMAND_COPY, { source })
    }
  />
)
