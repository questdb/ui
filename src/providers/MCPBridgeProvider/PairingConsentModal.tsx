import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import {
  ChatsCircleIcon,
  PlugsConnectedIcon,
  PlugsIcon,
  ShieldCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { AlertDialog } from "../../components/AlertDialog"
import { Overlay } from "../../components/Overlay"
import { Button, LoadingSpinner } from "../../components"
import { DisclosureToggle } from "../../scenes/Footer/MCPBridgeStatus/popoverParts"
import { MAX_RECONNECT_ATTEMPTS } from "../../utils/mcp/MCPBridgeClient"
import type { BridgeVersionMismatch } from "../../utils/mcp/protocolVersion"
import type { Permissions } from "../../utils/tools/permissions"
import type { PendingPairAgent } from "../../utils/mcp/mcpBridgeStorage"
import { BridgeUpgradeNotice } from "../../scenes/Footer/MCPBridgeStatus/BridgeUpgradeNotice"
import { AgentUpgradeNotice } from "../../scenes/Footer/MCPBridgeStatus/AgentUpgradeNotice"
import { PermissionsSection } from "../../scenes/Footer/MCPBridgeStatus/PermissionsSection"
import {
  chatAgentNames,
  mcpAgentNames,
} from "../../scenes/Footer/MCPBridgeStatus/agentStatus"
import { mcpClientOf } from "../../utils/mcp/mcpClients"

import {
  Actions,
  Body,
  Hero,
  IconBadge,
  Lede,
  StyledContent,
  Title,
} from "./consentDialogParts"
import { PathText } from "../../components/PathText"

const CONNECT_HOOK = "mcp-pair-consent-connect"

const WorkspaceField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const FieldLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-transform: uppercase;
  font-weight: 600;
`

const WorkspaceNote = styled.span`
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Fields = styled.dl`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 0;
  padding: 1.6rem;
  background: ${({ theme }) => theme.color.surfaceInset};

  @media (min-width: 32em) {
    grid-template-columns: max-content 1fr;
    column-gap: 2rem;
    row-gap: 1rem;
    align-items: baseline;
  }

  dt {
    font-size: 1.1rem;
    color: ${({ theme }) => theme.color.contentSecondary};
    text-transform: uppercase;
    font-weight: 600;
    margin: 0;
  }

  dd {
    margin: 0;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: ${({ theme }) => theme.color.contentPrimary};
    word-break: break-all;
    line-height: 1.5;
  }
`

const TrustNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 1.2rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.statusSuccess};
  }

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

const StatusRow = styled.div<{ $tone: "info" | "danger" | "warning" }>`
  display: flex;
  align-items: flex-start;
  margin-right: auto;
  gap: 0.8rem;
  width: 100%;
  background: ${({ theme, $tone }) =>
    $tone === "danger"
      ? theme.color.statusDangerSurface
      : $tone === "warning"
        ? theme.color.statusWarningSurface
        : theme.color.surfaceInset};
  color: ${({ theme, $tone }) =>
    $tone === "danger"
      ? theme.color.statusDangerContrast
      : $tone === "info"
        ? theme.color.contentSecondary
        : theme.color.contentPrimary};

  padding: 0.8rem 2.4rem;

  & > svg {
    flex-shrink: 0;
    color: ${({ theme, $tone }) =>
      $tone === "danger"
        ? theme.color.statusDanger
        : $tone === "warning"
          ? theme.color.statusWarning
          : theme.color.contentAccentStrong};
    margin-top: 0.2rem;
  }

  strong {
    color: ${({ theme, $tone }) =>
      $tone === "danger"
        ? theme.color.statusDangerContrast
        : theme.color.contentPrimary};
    font-weight: 600;
  }
`

const StatusText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  line-height: 1.4;
`

const StatusDetail = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  word-break: break-word;
`

type Props = {
  pending: {
    url: string
    token: string
    // Chat mode: the agent to chat with.
    agent?: PendingPairAgent
    // MCP mode: the coding agent's MCP client name.
    mcpClient?: string
  } | null
  isConnecting: boolean
  succeeded: boolean
  retryAttempt: number
  error: string | null
  versionMismatch: BridgeVersionMismatch | null
  permissions: Permissions
  onConnect: (committedPermissions: Permissions) => void
  onCancel: () => void
}

// What the dialog shows. Radix keeps it on screen for its exit animation
// after `pending` goes null, and the provider resets the rest at the same
// moment; drawing the live props then would flash the dialog back to its
// first state ("Connect …?") while it fades out.
type View = Pick<
  Props,
  | "pending"
  | "isConnecting"
  | "succeeded"
  | "retryAttempt"
  | "error"
  | "versionMismatch"
>

export const PairingConsentModal: React.FC<Props> = ({
  permissions,
  onConnect,
  onCancel,
  ...live
}) => {
  const open = live.pending !== null
  const lastOpenView = useRef<View>(live)
  if (open) lastOpenView.current = live
  const {
    pending,
    isConnecting,
    succeeded,
    retryAttempt,
    error,
    versionMismatch,
  } = open ? live : lastOpenView.current
  const [pendingPermissions, setPendingPermissions] = useState<Permissions>(
    () => permissions,
  )
  const [showDetails, setShowDetails] = useState(false)
  useEffect(() => {
    if (!live.pending) return
    setPendingPermissions(permissions)
    setShowDetails(false)
  }, [live.pending])
  const agent = pending?.agent
  // MCP mode names the agent when the console knows it.
  const client = agent ? null : mcpClientOf(pending?.mcpClient)
  const names = mcpAgentNames(client)
  const connectionFields = (
    <Fields>
      <dt>Address:</dt>
      <dd data-hook="mcp-pair-consent-ws">{pending?.url ?? ""}</dd>
      <dt>Key:</dt>
      <dd data-hook="mcp-pair-consent-token">{pending?.token ?? ""}</dd>
    </Fields>
  )

  const handleOpenAutoFocus = (e: Event) => {
    e.preventDefault()
    const root = e.currentTarget as HTMLElement | null
    const target = root?.querySelector<HTMLButtonElement>(
      `[data-hook="${CONNECT_HOOK}"]`,
    )
    target?.focus()
  }

  const handleConnectClick = () => {
    if (isConnecting) return
    onConnect(pendingPermissions)
  }

  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        {/* An outside click is Cancel (or Dismiss once connected), except
            while connecting, like Escape. */}
        <Overlay
          primitive={AlertDialog.Overlay}
          onClick={() => {
            if (!isConnecting) onCancel()
          }}
          dataHook="mcp-pair-consent-overlay"
        />
        <StyledContent
          onOpenAutoFocus={handleOpenAutoFocus}
          onEscapeKeyDown={(e) => {
            if (isConnecting) e.preventDefault()
          }}
        >
          <Hero>
            <IconBadge
              $tone={succeeded ? "success" : "neutral"}
              data-hook={
                succeeded ? "mcp-pair-consent-success-badge" : undefined
              }
            >
              {agent ? (
                <ChatsCircleIcon size={28} weight="duotone" />
              ) : succeeded ? (
                <PlugsConnectedIcon size={28} weight="duotone" />
              ) : (
                <PlugsIcon size={28} weight="duotone" />
              )}
            </IconBadge>
            <Title>
              {agent
                ? succeeded
                  ? `${agent.label} connected`
                  : `Connect ${agent.label}?`
                : succeeded
                  ? `${names.label} connected`
                  : client
                    ? `Connect ${client.label}?`
                    : "Connect your agent?"}
            </Title>
            <Lede>
              {succeeded
                ? agent
                  ? `${chatAgentNames(agent.label).subject} works in the AI Assistant. Its status is at the bottom of the screen.`
                  : `${names.subject} works from your terminal. Its status is at the bottom of the screen.`
                : agent
                  ? "It works in the AI Assistant: analyze your data, monitor your instance and build dashboards."
                  : "It works from your terminal and can read and edit notebooks, run SQL and inspect schemas."}
            </Lede>
          </Hero>

          {!succeeded && (
            <Body>
              {agent?.cwd && (
                <WorkspaceField>
                  <FieldLabel>Workspace</FieldLabel>
                  <PathText
                    path={agent.cwd}
                    dataHook="mcp-pair-consent-workspace"
                  />
                  <WorkspaceNote>
                    It can edit files and run commands in this folder on your
                    computer.
                  </WorkspaceNote>
                </WorkspaceField>
              )}
              <PermissionsSection
                value={pendingPermissions}
                onChange={setPendingPermissions}
                disabled={isConnecting}
              />

              <DisclosureToggle
                type="button"
                aria-expanded={showDetails}
                onClick={() => setShowDetails(!showDetails)}
                data-hook="mcp-pair-consent-details"
              >
                {showDetails ? "Hide details" : "Details"}
              </DisclosureToggle>
              {showDetails && connectionFields}
              {showDetails && !agent && (
                <TrustNote>
                  <ShieldCheckIcon size={16} weight="duotone" />
                  <span>
                    <strong>On this computer only:</strong> {names.subject}{" "}
                    connects from this computer. Every action runs through your
                    signed-in console session.
                  </span>
                </TrustNote>
              )}
            </Body>
          )}

          {!succeeded && isConnecting && (
            <StatusRow
              $tone="info"
              data-hook="mcp-pair-consent-connecting"
              role="status"
              aria-live="polite"
            >
              <LoadingSpinner size="16px" />
              <StatusText>
                <span>
                  {agent
                    ? `Connecting to ${agent.label}…`
                    : `Connecting to ${names.inline}…`}
                </span>
                {/* -1 on both sides so the counter shows retries-allowed,
                    not total attempts (the first attempt isn't a retry). */}
                {retryAttempt > 1 && (
                  <StatusDetail data-hook="mcp-pair-consent-retries">
                    (Retry {retryAttempt - 1} of {MAX_RECONNECT_ATTEMPTS - 1})
                  </StatusDetail>
                )}
              </StatusText>
            </StatusRow>
          )}

          {!succeeded &&
            !isConnecting &&
            versionMismatch !== "major" &&
            (error || retryAttempt > 0) && (
              <StatusRow
                $tone="danger"
                data-hook="mcp-pair-consent-error"
                role="alert"
              >
                <WarningIcon size={16} weight="duotone" />
                <StatusText>
                  <strong>
                    {agent
                      ? `Could not connect to ${agent.label}`
                      : `Could not connect to ${names.inline}`}
                  </strong>
                  <StatusDetail>
                    {error ??
                      (agent
                        ? "It stopped responding. Try again, or run the connect command again in your terminal."
                        : `${names.subject} stopped responding. Try again, or ask it to connect to the QuestDB Web Console again.`)}
                  </StatusDetail>
                </StatusText>
              </StatusRow>
            )}

          {!isConnecting && versionMismatch && (
            <StatusRow
              $tone={versionMismatch === "major" ? "danger" : "warning"}
              data-hook="mcp-pair-consent-version-mismatch"
              role="alert"
            >
              {agent ? (
                <AgentUpgradeNotice
                  severity={versionMismatch}
                  agentLabel={agent.label}
                  agentId={null}
                />
              ) : (
                <BridgeUpgradeNotice
                  severity={versionMismatch}
                  client={client}
                />
              )}
            </StatusRow>
          )}

          <Actions>
            <AlertDialog.Cancel asChild>
              <Button
                variant="secondary"
                onClick={onCancel}
                data-hook="mcp-pair-consent-cancel"
              >
                {succeeded ? "Dismiss" : "Cancel"}
              </Button>
            </AlertDialog.Cancel>
            {!succeeded && (
              <AlertDialog.Action asChild>
                <Button
                  variant="primary"
                  onClick={handleConnectClick}
                  disabled={isConnecting}
                  data-hook={CONNECT_HOOK}
                >
                  {isConnecting
                    ? "Connecting…"
                    : error || retryAttempt > 0
                      ? "Try again"
                      : "Connect"}
                </Button>
              </AlertDialog.Action>
            )}
          </Actions>
        </StyledContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
