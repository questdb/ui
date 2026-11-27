import React, { useCallback, useEffect, useRef, useState } from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css, keyframes } from "styled-components"
import {
  ChartBarIcon,
  ChartLineUpIcon,
  ChatsCircleIcon,
  PulseIcon,
  TerminalWindowIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Dialog } from "../Dialog"
import { Overlay } from "../Overlay"
import { ForwardRef } from "../ForwardRef"
import { IconButton } from "../IconButton"
import { ButtonBase } from "../Button"
import { McpSetupCommand, TerminalCommand } from "../McpSetupCommand"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../ConnectCodingAgent/connectCommand"
import {
  AGENT_VALUE,
  FROM_TERMINAL,
  IN_AI_ASSISTANT,
} from "../ConnectCodingAgent/copy"
import { Separator } from "../ConnectCodingAgent/parts"
import { useMCPBridge } from "../../providers/MCPBridgeProvider"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import {
  hasPendingPair,
  markAgentPromoSeen,
  shouldShowAgentPromo,
} from "../../utils/agentPromo"
import { color } from "../../utils"
import { AgentGallery } from "./AgentGallery"
import { AgentPromoDemo } from "./AgentPromoDemo"
import type { PromoAgentId } from "./AgentLogos"
import type { Flow, Scene } from "./demo/scene"

// The coding agent promo: what an agent does in the console (dashboards,
// analysis, monitoring), the agents it works with, and the two ways to start
// one. The demo on the right plays the three flows; the features on the left
// follow it and jump it to a flow.

export const AGENT_PROMO_TITLE = "Bring your agent to QuestDB"

const FEATURES: { flow: Flow; label: string; icon: React.ReactNode }[] = [
  { flow: "dashboards", label: "Build dashboards", icon: <ChartBarIcon /> },
  { flow: "analysis", label: "Analyze data", icon: <ChartLineUpIcon /> },
  { flow: "monitoring", label: "Monitor your instance", icon: <PulseIcon /> },
]

const contentShow = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`

const Content = styled(RadixDialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  display: grid;
  grid-template-columns: 37rem minmax(0, 1fr);
  width: min(118rem, calc(100vw - 4rem));
  height: min(70rem, calc(100vh - 4rem));
  overflow: hidden;
  background: ${color("surfaceOverlay")};
  border: 1px solid ${color("borderSubtle")};
  border-radius: 1rem;
  box-shadow: 0 2.4rem 6.4rem ${color("shadowOverlay")};

  &[data-state="open"] {
    animation: ${contentShow} 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:focus {
    outline: none;
  }

  /* Too narrow for the demo: the left panel alone. */
  @media (max-width: 960px) {
    grid-template-columns: minmax(0, 1fr);
    width: min(44rem, calc(100vw - 4rem));
  }
`

const Left = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  min-height: 0;
  padding: 3rem 2rem 2.2rem;
  overflow-y: auto;
`

const Title = styled(RadixDialog.Title)`
  margin: 0;
  font-size: 2.2rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02rem;
  color: ${color("contentPrimary")};
`

const Lede = styled.p`
  margin: 0.6rem 0 0;
  font-size: 1.35rem;
  line-height: 1.5;
  color: ${color("contentSecondary")};
`

const Features = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`

const Feature = styled(ButtonBase)<{ $active: boolean }>`
  && {
    display: flex;
    align-items: center;
    gap: 1.1rem;
    width: 100%;
    height: auto;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    font-size: 1.4rem;
    text-align: left;
    color: ${color("contentSecondary")};
    transition:
      background 0.3s,
      color 0.3s;
  }

  svg {
    flex-shrink: 0;
    width: 1.7rem;
    height: 1.7rem;
    color: ${color("contentMuted")};
    transition: color 0.3s;
  }

  &&:hover {
    background: ${color("interactionHover")};
    color: ${color("contentPrimary")};
  }

  ${({ $active, theme }) =>
    $active &&
    css`
      && {
        background: ${theme.color.interactionAccentActive};
        color: ${theme.color.contentPrimary};
      }

      &&:hover {
        background: ${theme.color.interactionAccentActive};
      }

      svg {
        color: ${theme.color.contentAccent};
      }
    `}
`

// The room left over goes around the agents; it shrinks first on a short
// screen, so everything stays in view without scrolling.
const Spacer = styled.div`
  flex: 1 1 0;
  min-height: 0.4rem;
`

const Ways = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

const Way = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`

const WayTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 1.3rem;
  font-weight: 600;
  color: ${color("contentPrimary")};

  svg {
    flex-shrink: 0;
    color: ${color("contentSecondary")};
  }
`

// The connect command keeps a line free under it for `--agent <id>`, so the
// panel does not move when an agent is shown.
const FLAG_LINE = "1.8rem"

const CommandBox = styled.div<{ $reserve?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  margin-bottom: ${({ $reserve }) => ($reserve ? FLAG_LINE : 0)};
  padding: 0.7rem 0.5rem 0.7rem 1rem;
  background: ${color("onboardingCommand")};
  border: 1px solid ${color("borderDefault")};
  border-radius: 0.5rem;

  & > span:first-child {
    font-size: 1.2rem;
  }
`

const flagIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-0.4rem);
  }
`

const Flag = styled.span`
  display: block;
  white-space: nowrap;
  animation: ${flagIn} 0.2s ease;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const FlagName = styled.span`
  color: ${color("contentAccent")};
`

const FlagValue = styled.span`
  color: ${color("contentPrimary")};
`

const RightColumn = styled.div`
  min-width: 0;
  min-height: 0;

  @media (max-width: 960px) {
    display: none;
  }
`

const CloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
`

// The way that works in the AI Assistant: `connect`, naming the agent shown.
const ConnectCommand = ({ agent }: { agent: PromoAgentId | null }) => {
  const consoleUrl = consoleUrlOf(window.location)
  const base = connectCommandOf(consoleUrl, "npx")
  const full = connectCommandOf(consoleUrl, "npx", agent)
  return (
    <CommandBox $reserve={!agent} data-hook="agent-promo-connect-command">
      <TerminalCommand
        command={base}
        copyText={full}
        after={
          agent ? (
            // A new agent slides its flag in: the key remounts it.
            <Flag key={agent}>
              <FlagName>--agent</FlagName> <FlagValue>{agent}</FlagValue>
            </Flag>
          ) : null
        }
        onCopy={() =>
          void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
            source: "agent_promo",
            agent,
          })
        }
      />
    </CommandBox>
  )
}

export const AgentPromoModal = () => {
  const [open, setOpen] = useState(
    () => shouldShowAgentPromo() && !hasPendingPair(),
  )
  const [flow, setFlow] = useState<Flow>("dashboards")
  const [agent, setAgent] = useState<PromoAgentId | null>(null)
  // The pointer or focus is at the commands: the gallery holds still.
  const [atCommands, setAtCommands] = useState({ pointer: false, focus: false })
  const sceneRef = useRef<Scene | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { status } = useMCPBridge()

  // Seen once it opens: it does not come back on the next load.
  useEffect(() => {
    if (!open) return
    markAgentPromoSeen()
    void trackEvent(ConsoleEvent.AGENT_PROMO_OPEN)
  }, [open])

  // An agent that connects has done what the promo asks.
  useEffect(() => {
    if (status === "connected") setOpen(false)
  }, [status])

  const close = useCallback(() => {
    void trackEvent(ConsoleEvent.AGENT_PROMO_CLOSE, { flow })
    setOpen(false)
  }, [flow])

  const jump = (next: Flow) => {
    void trackEvent(ConsoleEvent.AGENT_PROMO_FLOW, { flow: next })
    setFlow(next)
    sceneRef.current?.jump(next)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close()
      }}
    >
      <RadixDialog.Portal>
        <ForwardRef>
          <Overlay primitive={RadixDialog.Overlay} />
        </ForwardRef>
        <Content
          ref={contentRef}
          aria-describedby={undefined}
          data-hook="agent-promo"
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
        >
          <CloseButton title="Close" onClick={close}>
            <XIcon size={16} weight="bold" />
          </CloseButton>
          <Left>
            <div>
              <Title>{AGENT_PROMO_TITLE}</Title>
              <Lede>{AGENT_VALUE}</Lede>
            </div>
            <Features>
              {FEATURES.map((feature) => (
                <Feature
                  key={feature.flow}
                  type="button"
                  aria-pressed={flow === feature.flow}
                  data-hook={`agent-promo-feature-${feature.flow}`}
                  $active={flow === feature.flow}
                  onClick={() => jump(feature.flow)}
                >
                  {feature.icon}
                  {feature.label}
                </Feature>
              ))}
            </Features>
            <Spacer />
            <AgentGallery
              onShow={setAgent}
              paused={atCommands.pointer || atCommands.focus}
              onKeep={(kept) =>
                void trackEvent(ConsoleEvent.AGENT_PROMO_AGENT, {
                  agent: kept,
                })
              }
            />
            <Spacer />
            <Ways
              data-hook="agent-promo-ways"
              onPointerEnter={() =>
                setAtCommands((s) => ({ ...s, pointer: true }))
              }
              onPointerLeave={() =>
                setAtCommands((s) => ({ ...s, pointer: false }))
              }
              onFocus={() => setAtCommands((s) => ({ ...s, focus: true }))}
              onBlur={(event: React.FocusEvent<HTMLDivElement>) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setAtCommands((s) => ({ ...s, focus: false }))
              }}
            >
              <Way data-hook="agent-promo-ai-assistant-option">
                <WayTitle>
                  <ChatsCircleIcon size={16} weight="duotone" />
                  {IN_AI_ASSISTANT.title}
                </WayTitle>
                <ConnectCommand agent={agent} />
              </Way>
              <Separator label="or" />
              <Way data-hook="agent-promo-terminal-option">
                <WayTitle>
                  <TerminalWindowIcon size={16} weight="duotone" />
                  {FROM_TERMINAL.title}
                </WayTitle>
                <CommandBox>
                  <McpSetupCommand source="agent_promo" />
                </CommandBox>
              </Way>
            </Ways>
          </Left>
          <RightColumn>
            <AgentPromoDemo onFlow={setFlow} sceneRef={sceneRef} />
          </RightColumn>
        </Content>
      </RadixDialog.Portal>
    </Dialog.Root>
  )
}
