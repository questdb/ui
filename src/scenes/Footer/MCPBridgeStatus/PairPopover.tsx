import React, { forwardRef, useEffect, useState } from "react"
import styled from "styled-components"
import {
  PlugsConnectedIcon,
  PlugsIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { Button, LoadingSpinner } from "../../../components"
import { Input } from "../../../components/Input"
import { useMCPBridge } from "../../../providers/MCPBridgeProvider"
import { MAX_RECONNECT_ATTEMPTS } from "../../../utils/mcp/MCPBridgeClient"
import { LOCALHOST_WS_RE, TOKEN_RE } from "../../../utils/mcp/pairValidation"
import type { Permissions } from "../../../utils/tools/permissions"
import { Tone, accentColor, deriveTone } from "./tone"
import { PermissionsSection } from "./PermissionsSection"

const permissionsEqual = (a: Permissions, b: Permissions): boolean =>
  a.grantSchemaAccess === b.grantSchemaAccess &&
  a.read === b.read &&
  a.write === b.write

const SUCCESS_AUTOCLOSE_MS = 3_000

const DEFAULT_WS_URL_PREFIX = "ws://127.0.0.1:"

const Root = styled.div`
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.8rem;
  box-shadow: 0 12px 32px -8px ${({ theme }) => theme.color.black};
  width: min(38rem, calc(100vw - 2rem));
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 0;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.6rem 1.6rem 1.2rem;
`

const IconBadge = styled.div<{ $tone: Tone }>`
  width: 3.6rem;
  height: 3.6rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme, $tone }) => theme.color[accentColor($tone)]};
  color: ${({ theme, $tone }) => theme.color[accentColor($tone)]};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`

const Title = styled.div`
  font-weight: 600;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.color.foreground};
`

const Lede = styled.p`
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.gray2};
  word-break: break-word;
`

const Body = styled.div`
  padding: 0 1.6rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;

  input,
  select,
  textarea,
  [aria-haspopup="menu"] {
    font-size: 1.4rem;
    font-weight: 400;
    background: ${({ theme }) => theme.color.inputBackground};
    border-color: ${({ theme }) => theme.color.selection};

    &:focus {
      background: ${({ theme }) => theme.color.inputBackground};
    }
  }

  input,
  select,
  textarea {
    height: auto;
    line-height: normal;
    padding: 0.6rem 0.75rem;
  }
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const FieldLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
`

const FullWidthInput = styled(Input)`
  width: 100%;
  font-family: ${({ theme }) => theme.fontMonospace};
`

const StatusRow = styled.div<{ $tone: "info" | "danger" }>`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  width: 100%;
  padding: 1.6rem;
  background: ${({ theme, $tone }) =>
    $tone === "danger" ? `${theme.color.red}1f` : theme.color.backgroundDarker};
  color: ${({ theme, $tone }) =>
    $tone === "danger" ? theme.color.foreground : theme.color.gray2};

  svg {
    flex-shrink: 0;
    color: ${({ theme, $tone }) =>
      $tone === "danger" ? theme.color.red : theme.color.pinkPrimary};
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

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 1.2rem 1.6rem;
  border-top: 1px solid ${({ theme }) => theme.color.selection};
`

const RightActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: auto;
`

type Props = {
  open: boolean
  onClose: () => void
}

export const MCPBridgePairPopover = forwardRef<HTMLDivElement, Props>(
  ({ open, onClose, ...rest }, ref) => {
    const {
      status,
      lastError,
      retryAttempt,
      url,
      token,
      connect,
      disconnect,
      permissions,
      setPermissions,
    } = useMCPBridge()
    const [draftUrl, setDraftUrl] = useState(DEFAULT_WS_URL_PREFIX)
    const [draftToken, setDraftToken] = useState("")
    const [draftPermissions, setDraftPermissions] = useState<Permissions>(
      () => permissions,
    )
    const [validationError, setValidationError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)
    const [succeeded, setSucceeded] = useState(false)

    // Snapshot via refs so the [open] effect picks up the latest live
    // values without re-running on later background url/token changes.
    const urlRef = React.useRef(url)
    urlRef.current = url
    const tokenRef = React.useRef(token)
    tokenRef.current = token
    const permissionsRef = React.useRef(permissions)
    permissionsRef.current = permissions
    const sawDisconnectAfterSubmitRef = React.useRef(false)

    useEffect(() => {
      if (!open) return
      setDraftUrl(urlRef.current || DEFAULT_WS_URL_PREFIX)
      setDraftToken(tokenRef.current ?? "")
      setDraftPermissions(permissionsRef.current)
      setValidationError(null)
      setSubmitted(false)
      setSucceeded(false)
      sawDisconnectAfterSubmitRef.current = false
    }, [open])

    useEffect(() => {
      if (!submitted) {
        sawDisconnectAfterSubmitRef.current = false
        return
      }
      if (status !== "connected") {
        sawDisconnectAfterSubmitRef.current = true
      }
    }, [submitted, status])

    // In-render setState so the green icon, success title, and hidden
    // body all commit in the same paint — no one-frame flicker.
    if (
      open &&
      submitted &&
      sawDisconnectAfterSubmitRef.current &&
      status === "connected" &&
      !succeeded
    ) {
      setSucceeded(true)
    }

    useEffect(() => {
      if (!succeeded) return
      const t = setTimeout(() => onClose(), SUCCESS_AUTOCLOSE_MS)
      return () => clearTimeout(t)
    }, [succeeded, onClose])

    const isConnecting = status === "connecting" || status === "reconnecting"

    const showConnecting = !succeeded && isConnecting
    const showWsError =
      !succeeded && !isConnecting && (lastError || retryAttempt > 0)

    const credsDirty = draftUrl !== (url ?? "") || draftToken !== (token ?? "")
    const permsDirty = !permissionsEqual(draftPermissions, permissions)
    const isPaired = !!(url && token)
    const inErrorState = !!lastError || retryAttempt > 0
    const submitEnabled =
      !isConnecting && (credsDirty || permsDirty || !isPaired || inErrorState)
    const submitLabel = isConnecting ? "Connecting…" : "Connect"

    const clearValidationError = () => {
      if (validationError) setValidationError(null)
    }

    const onConnect = () => {
      const isConnected = status === "connected"
      const needsConnect = credsDirty || !isConnected
      if (!needsConnect && permsDirty) {
        setPermissions(draftPermissions)
        onClose()
        return
      }
      const nextUrl = draftUrl.trim()
      const nextToken = draftToken.trim()
      if (!nextUrl || !nextToken) {
        setValidationError("Both URL and token are required.")
        return
      }
      if (!LOCALHOST_WS_RE.test(nextUrl)) {
        setValidationError(
          "WebSocket URL must point to localhost (ws://127.0.0.1:<port> or ws://localhost:<port>).",
        )
        return
      }
      if (!TOKEN_RE.test(nextToken)) {
        setValidationError(
          "Token looks malformed — expected a long URL-safe string.",
        )
        return
      }
      setValidationError(null)
      setSucceeded(false)
      setSubmitted(true)
      // Order matters: the rebuilt client reads perms in its initial hello.
      if (permsDirty) setPermissions(draftPermissions)
      connect(nextUrl, nextToken)
    }

    const onDisconnect = () => {
      disconnect()
      setDraftUrl(DEFAULT_WS_URL_PREFIX)
      setDraftToken("")
      setSubmitted(false)
      setSucceeded(false)
    }

    // While connecting, Cancel must tear down the WS — otherwise the
    // bridge keeps retrying in the background after close.
    const onCancel = () => {
      if (isConnecting) {
        disconnect()
        setDraftUrl(DEFAULT_WS_URL_PREFIX)
        setDraftToken("")
        setValidationError(null)
        setSubmitted(false)
        setSucceeded(false)
      }
      onClose()
    }

    const tone = deriveTone(isPaired, status)
    const HeaderIcon = tone === "connected" ? PlugsConnectedIcon : PlugsIcon

    const canDisconnect = isPaired && status === "connected"

    const title = succeeded ? "MCP Bridge connected" : "MCP Bridge"

    const lede = succeeded
      ? "You can track the connection status from the bottom bar."
      : "Paste the WebSocket URL and token your coding agent gave you, or click the deep link from the agent."

    return (
      <Root ref={ref} {...rest} data-hook="mcp-pair-popover">
        <Header>
          <IconBadge
            $tone={tone}
            data-hook={succeeded ? "mcp-pair-success-badge" : undefined}
          >
            <HeaderIcon size={20} weight="duotone" />
          </IconBadge>
          <HeaderText>
            <Title>{title}</Title>
            <Lede>{lede}</Lede>
          </HeaderText>
        </Header>

        {!succeeded && (
          <Body>
            <Field>
              <FieldLabel>WebSocket URL</FieldLabel>
              <FullWidthInput
                name="mcp-pair-url"
                value={draftUrl}
                onChange={(e) => {
                  setDraftUrl(e.target.value)
                  clearValidationError()
                }}
                placeholder="ws://127.0.0.1:57123"
                disabled={isConnecting}
                data-hook="mcp-pair-url-input"
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>Token</FieldLabel>
              <FullWidthInput
                name="mcp-pair-token"
                value={draftToken}
                onChange={(e) => {
                  setDraftToken(e.target.value)
                  clearValidationError()
                }}
                placeholder="Paste the token from the agent's reply"
                disabled={isConnecting}
                data-hook="mcp-pair-token-input"
              />
            </Field>

            <PermissionsSection
              value={draftPermissions}
              onChange={(next) => {
                setDraftPermissions(next)
                clearValidationError()
              }}
              disabled={isConnecting}
            />
          </Body>
        )}

        {showConnecting && (
          <StatusRow
            $tone="info"
            data-hook="mcp-pair-connecting"
            role="status"
            aria-live="polite"
          >
            <LoadingSpinner size="16px" />
            <StatusText>
              <span>Establishing WebSocket connection...</span>
              {/* -1 on both sides so the counter shows retries-allowed,
                  not total attempts (the first attempt isn't a retry). */}
              {retryAttempt > 1 && (
                <StatusDetail data-hook="mcp-pair-retries">
                  (Retry {retryAttempt - 1} of {MAX_RECONNECT_ATTEMPTS - 1})
                </StatusDetail>
              )}
            </StatusText>
          </StatusRow>
        )}

        {!succeeded && validationError && (
          <StatusRow
            $tone="danger"
            data-hook="mcp-pair-validation-error"
            role="alert"
          >
            <WarningIcon size={16} weight="duotone" />
            <StatusText>
              <StatusDetail>{validationError}</StatusDetail>
            </StatusText>
          </StatusRow>
        )}

        {showWsError && (
          <StatusRow $tone="danger" data-hook="mcp-pair-error" role="alert">
            <WarningIcon size={16} weight="duotone" />
            <StatusText>
              <strong>Could not connect to MCP bridge</strong>
              <StatusDetail>
                {lastError ??
                  `Bridge stopped responding after ${MAX_RECONNECT_ATTEMPTS} attempts. Click Try again, or ask your coding agent for a fresh deep link.`}
              </StatusDetail>
            </StatusText>
          </StatusRow>
        )}

        {!succeeded && (
          <Footer>
            {canDisconnect && (
              <Button
                skin="danger"
                onClick={onDisconnect}
                dataHook="mcp-pair-disconnect"
              >
                Disconnect
              </Button>
            )}
            <RightActions>
              <Button
                skin="secondary"
                onClick={onCancel}
                dataHook="mcp-pair-cancel"
              >
                Cancel
              </Button>
              <Button
                skin="primary"
                onClick={onConnect}
                disabled={!submitEnabled}
                dataHook="mcp-pair-submit"
              >
                {submitLabel}
              </Button>
            </RightActions>
          </Footer>
        )}
      </Root>
    )
  },
)

MCPBridgePairPopover.displayName = "MCPBridgePairPopover"
