import React, { forwardRef, useCallback, useState } from "react"
import styled, { css, keyframes } from "styled-components"
import type { DefaultTheme } from "styled-components"
import { PlugsConnectedIcon, PlugsIcon } from "@phosphor-icons/react"
import { PopperToggle } from "../../../components"
import { useMCPBridge } from "../../../providers/MCPBridgeProvider"
import { MCPBridgePairPopover } from "./PairPopover"
import { AgentChangesPopper } from "./AgentChangesPopper"
import { useAgentChanges } from "./useAgentChanges"
import { Tone, accentColor, deriveTone, hexToRgba } from "./tone"

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`

type PillStyleProps = {
  $tone: Tone
  $blink: boolean
  $newChanges: boolean
}

// New agent changes turn the pill cyan regardless of the connection tone —
// they are the one state the user can act on straight from the footer.
const accent = ({
  theme,
  $tone,
  $newChanges,
}: PillStyleProps & { theme: DefaultTheme }) =>
  $newChanges ? theme.color.cyan : theme.color[accentColor($tone)]

const Wrapper = styled.button<PillStyleProps>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  height: 3rem;
  padding: 0 1.1rem;
  border: 1px solid ${(props) => hexToRgba(accent(props), 0.1)};
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  background: ${(props) => hexToRgba(accent(props), 0.05)};
  color: ${({ theme }) => theme.color.foreground};
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: ${(props) => hexToRgba(accent(props), 0.1)};
    border-color: ${(props) => hexToRgba(accent(props), 0.25)};
  }

  &:focus-visible {
    outline: 1px solid
      ${(props) =>
        props.$tone === "idle" ? props.theme.color.cyan : accent(props)};
    outline-offset: 2px;
  }

  svg {
    color: ${accent};
    flex-shrink: 0;
    ${({ $tone, $blink }) =>
      ($tone === "connecting" || $blink) &&
      css`
        @media (prefers-reduced-motion: no-preference) {
          animation: ${pulse} 1.2s ease-in-out infinite;
        }
      `}
  }
`

type PillProps = {
  tone: Tone
  label: string
  title: string
  blink: boolean
  newChanges: boolean
}

const Pill = forwardRef<
  HTMLButtonElement,
  PillProps & React.HTMLAttributes<HTMLButtonElement>
>(({ tone, label, title, blink, newChanges, ...rest }, ref) => {
  const Icon =
    tone === "connected" || tone === "warning" ? PlugsConnectedIcon : PlugsIcon
  return (
    <Wrapper
      ref={ref}
      type="button"
      title={title}
      aria-label={label}
      data-hook="mcp-bridge-status-pill"
      $tone={tone}
      $blink={blink}
      $newChanges={newChanges}
      {...rest}
    >
      <Icon size={14} weight="duotone" />
      <span>{label}</span>
    </Wrapper>
  )
})
Pill.displayName = "MCPBridgeStatusPill"

const POPPER_MODIFIERS = [
  { name: "offset", options: { offset: [0, 8] as [number, number] } },
]

const Container = styled.div`
  display: inline-flex;
`

const Announcer = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

export const MCPBridgeStatus: React.FC = () => {
  const { status, url, token, versionMismatch } = useMCPBridge()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null)
  const agentChanges = useAgentChanges()
  const paired = !!(url && token)
  const tone = deriveTone(paired, status, versionMismatch)

  let label: string
  let title: string

  if (tone === "idle") {
    label = "MCP not connected"
    title =
      "Click to enter MCP credentials manually, or ask Claude / Codex to pair this console."
  } else if (tone === "connected") {
    label = "MCP connected"
    title = "Paired with the MCP bridge. Click to manage."
  } else if (tone === "warning") {
    label = "MCP connected"
    title =
      "Connected, but the bridge version differs from what this console expects. Click to see the upgrade command."
  } else if (tone === "connecting") {
    label = "MCP connecting…"
    title = "Connecting to the bridge. Click to manage."
  } else {
    label = "MCP disconnected"
    title =
      "Click to re-enter MCP credentials, or ask Claude for a fresh pairing link."
  }

  const closePopover = useCallback(() => setPopoverOpen(false), [])

  // Opening the popover is the user's "check": it shows the agent-changes
  // row, so the pill stops blinking until the next background edit.
  const handleToggle = (open: boolean) => {
    setPopoverOpen(open)
    if (open) agentChanges.markPopoverOpened()
  }

  // Viewing the change also closes the pair popover if it's open.
  const handleView = useCallback(() => {
    void agentChanges.view()
    setPopoverOpen(false)
  }, [agentChanges])

  if (agentChanges.unread) {
    label = `${label} (new changes)`
    title = `${title} New agent changes in ${agentChanges.label}.`
  } else if (tone === "warning") {
    label = `${label} (outdated)`
  }

  return (
    <Container ref={setAnchorEl}>
      <PopperToggle
        placement="top-end"
        modifiers={POPPER_MODIFIERS}
        active={popoverOpen}
        onToggle={handleToggle}
        trigger={
          <Pill
            tone={tone}
            label={label}
            title={title}
            blink={agentChanges.unread}
            newChanges={agentChanges.unread}
          />
        }
      >
        <MCPBridgePairPopover
          open={popoverOpen}
          onClose={closePopover}
          agentChanges={agentChanges}
        />
      </PopperToggle>
      <AgentChangesPopper
        open={agentChanges.showPopper && !popoverOpen}
        anchorEl={anchorEl}
        label={agentChanges.label}
        onView={handleView}
        onDismiss={agentChanges.dismiss}
        onAutoHidePausedChange={agentChanges.setAutoHidePaused}
      />
      <Announcer role="status" aria-live="polite" aria-atomic="true">
        {agentChanges.hasUnseen
          ? `New changes from the agent in ${agentChanges.label}`
          : ""}
      </Announcer>
    </Container>
  )
}

export default MCPBridgeStatus
