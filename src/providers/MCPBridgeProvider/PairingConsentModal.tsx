import React, { useEffect, useState } from "react"
import styled from "styled-components"
import {
  PlugsConnectedIcon,
  PlugsIcon,
  ShieldCheckIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { AlertDialog } from "../../components/AlertDialog"
import { Overlay } from "../../components/Overlay"
import { Button, LoadingSpinner } from "../../components"
import { MAX_RECONNECT_ATTEMPTS } from "../../utils/mcp/MCPBridgeClient"
import type { Permissions } from "../../utils/tools/permissions"
import { PermissionsSection } from "../../scenes/Footer/MCPBridgeStatus/PermissionsSection"

const CONNECT_HOOK = "mcp-pair-consent-connect"

const StyledContent = styled(AlertDialog.Content)`
  background-color: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  padding: 0;
  display: flex;
  flex-direction: column;
`

const Hero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2.4rem 2.4rem 1.6rem;
  gap: 1.2rem;
`

const IconBadge = styled.div<{ $tone?: "neutral" | "success" }>`
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 0.8rem;
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === "success" ? theme.color.green : theme.color.pinkPrimary};
  color: ${({ theme, $tone }) =>
    $tone === "success" ? theme.color.green : theme.color.pinkPrimary};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const Title = styled(AlertDialog.Title)`
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const Lede = styled(AlertDialog.Description)`
  margin: 0;
  color: ${({ theme }) => theme.color.gray2};
  line-height: 1.5;
  font-size: 1.4rem;
`

const Body = styled.div`
  padding: 0 2.4rem 1.6rem;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;

  [aria-haspopup="menu"] {
    font-size: 1.4rem;
    font-weight: 400;
    background: ${({ theme }) => theme.color.inputBackground};
    border-color: ${({ theme }) => theme.color.selection};

    &:focus {
      background: ${({ theme }) => theme.color.inputBackground};
    }
  }
`

const Fields = styled.dl`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 0;
  padding: 1.6rem 0;
  background: ${({ theme }) => theme.color.backgroundDarker};

  @media (min-width: 32em) {
    grid-template-columns: max-content 1fr;
    column-gap: 2rem;
    row-gap: 1rem;
    align-items: baseline;
  }

  dt {
    font-size: 1.1rem;
    color: ${({ theme }) => theme.color.gray2};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    margin: 0;
  }

  dd {
    margin: 0;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.3rem;
    color: ${({ theme }) => theme.color.foreground};
    word-break: break-all;
    line-height: 1.5;
  }
`

const TrustNote = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: ${({ theme }) => theme.color.gray2};

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.green};
  }

  strong {
    color: ${({ theme }) => theme.color.foreground};
    font-weight: 600;
  }
`

const StatusRow = styled.div<{ $tone: "info" | "danger" }>`
  display: flex;
  align-items: flex-start;
  margin-right: auto;
  gap: 0.8rem;
  width: 100%;
  background: ${({ theme, $tone }) =>
    $tone === "danger" ? `${theme.color.red}1f` : theme.color.backgroundDarker};
  color: ${({ theme, $tone }) =>
    $tone === "danger" ? theme.color.foreground : theme.color.gray2};

  padding: 0.8rem 2.4rem;

  svg {
    flex-shrink: 0;
    color: ${({ theme, $tone }) =>
      $tone === "danger" ? theme.color.red : theme.color.pinkPrimary};
    margin-top: 0.2rem;
  }

  strong {
    color: ${({ theme }) => theme.color.foreground};
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
  color: ${({ theme }) => theme.color.gray2};
  word-break: break-word;
`

const Actions = styled.div`
  display: flex;
  gap: 0.8rem;
  justify-content: flex-end;
  padding: 2rem 2.4rem 2.4rem;

  @media (max-width: 28em) {
    flex-direction: column-reverse;

    > * {
      width: 100%;
    }
  }
`

type Props = {
  pending: { url: string; token: string } | null
  isConnecting: boolean
  succeeded: boolean
  retryAttempt: number
  error: string | null
  permissions: Permissions
  onConnect: (committedPermissions: Permissions) => void
  onCancel: () => void
}

export const PairingConsentModal: React.FC<Props> = ({
  pending,
  isConnecting,
  succeeded,
  retryAttempt,
  error,
  permissions,
  onConnect,
  onCancel,
}) => {
  const [pendingPermissions, setPendingPermissions] = useState<Permissions>(
    () => permissions,
  )
  useEffect(() => {
    if (pending) setPendingPermissions(permissions)
  }, [pending])
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
    <AlertDialog.Root open={pending !== null}>
      <AlertDialog.Portal>
        <Overlay primitive={AlertDialog.Overlay} />
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
              {succeeded ? (
                <PlugsConnectedIcon size={28} weight="duotone" />
              ) : (
                <PlugsIcon size={28} weight="duotone" />
              )}
            </IconBadge>
            <Title>
              {succeeded ? "MCP Bridge connected" : "Connect to MCP Bridge?"}
            </Title>
            <Lede>
              {succeeded
                ? "You can track the connection status from the bottom bar."
                : "An external coding agent is asking to pair with this Web Console. Once connected, it can read and edit notebooks, run SQL, and inspect schemas on your behalf."}
            </Lede>
          </Hero>

          {!succeeded && (
            <Body>
              <Fields>
                <dt>WebSocket URL:</dt>
                <dd data-hook="mcp-pair-consent-ws">{pending?.url ?? ""}</dd>
                <dt>Token:</dt>
                <dd data-hook="mcp-pair-consent-token">
                  {pending?.token ?? ""}
                </dd>
              </Fields>

              <PermissionsSection
                value={pendingPermissions}
                onChange={setPendingPermissions}
                disabled={isConnecting}
              />

              <TrustNote>
                <ShieldCheckIcon size={16} weight="duotone" />
                <span>
                  <strong>Loopback only:</strong> The bridge runs on your
                  machine and never leaves it. Every action runs through your
                  already-authenticated console session.
                </span>
              </TrustNote>
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
                <span>Establishing WebSocket connection...</span>
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

          {!succeeded && !isConnecting && (error || retryAttempt > 0) && (
            <StatusRow
              $tone="danger"
              data-hook="mcp-pair-consent-error"
              role="alert"
            >
              <WarningIcon size={16} weight="duotone" />
              <StatusText>
                <strong>Could not connect to MCP bridge</strong>
                <StatusDetail>
                  {error ??
                    `Bridge stopped responding after ${MAX_RECONNECT_ATTEMPTS} attempts. Click Try again, or ask your coding agent for a fresh deep link.`}
                </StatusDetail>
              </StatusText>
            </StatusRow>
          )}

          <Actions>
            <AlertDialog.Cancel asChild>
              <Button
                skin="secondary"
                onClick={onCancel}
                data-hook="mcp-pair-consent-cancel"
              >
                {succeeded ? "Dismiss" : "Cancel"}
              </Button>
            </AlertDialog.Cancel>
            {!succeeded && (
              <AlertDialog.Action asChild>
                <Button
                  skin="primary"
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
