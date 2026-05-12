import React, { forwardRef, useCallback, useState } from "react"
import styled, { css, keyframes } from "styled-components"
import { PlugsConnectedIcon, PlugsIcon } from "@phosphor-icons/react"
import { PopperToggle } from "../../../components"
import { useMCPBridge } from "../../../providers/MCPBridgeProvider"
import { MCPBridgePairPopover } from "./PairPopover"
import { Tone, accentColor, deriveTone } from "./tone"

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`

const Wrapper = styled.button<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  height: 3rem;
  padding: 0 1rem;
  border: 1px solid transparent;
  background: ${({ theme }) => theme.color.backgroundDarker};
  color: ${({ theme }) => theme.color.foreground};
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.selection};
  }

  &:focus-visible {
    outline: 1px solid
      ${({ theme, $tone }) =>
        $tone === "idle" ? theme.color.cyan : theme.color[accentColor($tone)]};
    outline-offset: 2px;
  }

  svg {
    color: ${({ theme, $tone }) => theme.color[accentColor($tone)]};
    flex-shrink: 0;
    ${({ $tone }) =>
      $tone === "connecting" &&
      css`
        animation: ${pulse} 1.2s ease-in-out infinite;
      `}
  }
`

type PillProps = {
  tone: Tone
  label: string
  title: string
}

const Pill = forwardRef<
  HTMLButtonElement,
  PillProps & React.HTMLAttributes<HTMLButtonElement>
>(({ tone, label, title, ...rest }, ref) => {
  const Icon = tone === "connected" ? PlugsConnectedIcon : PlugsIcon
  return (
    <Wrapper
      ref={ref}
      type="button"
      title={title}
      aria-label={label}
      data-hook="mcp-bridge-status-pill"
      $tone={tone}
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

export const MCPBridgeStatus: React.FC = () => {
  const { status, url, token } = useMCPBridge()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const paired = !!(url && token)
  const tone = deriveTone(paired, status)

  let label: string
  let title: string

  if (tone === "idle") {
    label = "MCP not connected"
    title =
      "Click to enter MCP credentials manually, or ask Claude / Codex to pair this console."
  } else if (tone === "connected") {
    label = "MCP connected"
    title = "Paired with the MCP bridge. Click to manage."
  } else if (tone === "connecting") {
    label = "MCP connecting…"
    title = "Connecting to the bridge. Click to manage."
  } else {
    label = "MCP disconnected"
    title =
      "Click to re-enter MCP credentials, or ask Claude for a fresh pairing link."
  }

  const closePopover = useCallback(() => setPopoverOpen(false), [])

  return (
    <PopperToggle
      placement="top-end"
      modifiers={POPPER_MODIFIERS}
      active={popoverOpen}
      onToggle={setPopoverOpen}
      trigger={<Pill tone={tone} label={label} title={title} />}
    >
      <MCPBridgePairPopover open={popoverOpen} onClose={closePopover} />
    </PopperToggle>
  )
}

export default MCPBridgeStatus
