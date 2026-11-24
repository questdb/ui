import React, { forwardRef, useEffect, useState } from "react"
import {
  PlugsConnectedIcon,
  PlugsIcon,
  WarningIcon,
} from "@phosphor-icons/react"
import { Button, LoadingSpinner } from "../../../components"
import type { AgentChanges } from "./useAgentChanges"
import { useMCPBridge } from "../../../providers/MCPBridgeProvider"
import { MAX_RECONNECT_ATTEMPTS } from "../../../utils/mcp/MCPBridgeClient"
import { LOCALHOST_WS_RE, TOKEN_RE } from "../../../utils/mcp/pairValidation"
import {
  normalizePermissions,
  type Permissions,
} from "../../../utils/tools/permissions"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { permissionLevelOf } from "../../../modules/ConsoleEventTracker/mcpToolEvents"
import { deriveTone } from "./tone"
import {
  AgentChangesNotice,
  Body,
  Field,
  FieldLabel,
  Footer,
  FullWidthInput,
  Header,
  HeaderText,
  IconBadge,
  Lede,
  RightActions,
  Root,
  StatusDetail,
  StatusRow,
  StatusText,
  Title,
} from "./popoverParts"
import { BridgeUpgradeNotice } from "./BridgeUpgradeNotice"
import { BridgeSetupNotice } from "./BridgeSetupNotice"
import { CodingAgentChatInvite } from "./CodingAgentChatInvite"
import { useLocalAgent } from "../../../utils/localAgent/LocalAgentContext"
import { PermissionsSection } from "./PermissionsSection"

const permissionsEqual = (a: Permissions, b: Permissions): boolean =>
  a.grantSchemaAccess === b.grantSchemaAccess &&
  a.read === b.read &&
  a.write === b.write

const SUCCESS_AUTOCLOSE_MS = 3_000

const DEFAULT_WS_URL_PREFIX = "ws://127.0.0.1:"

type Props = {
  open: boolean
  onClose: () => void
  agentChanges: AgentChanges
}

export const MCPBridgePairPopover = forwardRef<HTMLDivElement, Props>(
  ({ open, onClose, agentChanges, ...rest }, ref) => {
    const {
      status,
      lastError,
      retryAttempt,
      versionMismatch,
      url,
      token,
      connect,
      disconnect,
      permissions,
      setPermissions,
    } = useMCPBridge()
    const localAgent = useLocalAgent()
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
      versionMismatch !== "minor" &&
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
    const showValidationError = !succeeded && validationError !== null
    const showMajorMismatch = !succeeded && versionMismatch === "major"
    const showMinorMismatch =
      versionMismatch === "minor" && status === "connected"
    const showWsError =
      !succeeded &&
      !isConnecting &&
      versionMismatch !== "major" &&
      (lastError || retryAttempt > 0)

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
        void trackEvent(ConsoleEvent.MCP_PERMISSIONS_CHANGE, {
          level: permissionLevelOf(normalizePermissions(draftPermissions)),
        })
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
      if (permsDirty) {
        void trackEvent(ConsoleEvent.MCP_PERMISSIONS_CHANGE, {
          level: permissionLevelOf(normalizePermissions(draftPermissions)),
        })
        setPermissions(draftPermissions)
      }
      void trackEvent(ConsoleEvent.MCP_MANUAL_PAIR_SUBMIT)
      connect(nextUrl, nextToken)
    }

    const onDisconnect = () => {
      void trackEvent(ConsoleEvent.MCP_DISCONNECT_CLICK)
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

    const tone = deriveTone(isPaired, status, versionMismatch)
    const HeaderIcon =
      tone === "connected" || tone === "warning"
        ? PlugsConnectedIcon
        : PlugsIcon

    const canDisconnect = isPaired && status === "connected"

    const title = succeeded ? "MCP server connected" : "MCP server"

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

        {showValidationError && (
          <StatusRow
            $tone="danger"
            data-hook="mcp-pair-validation-error"
            role="alert"
          >
            <WarningIcon size={16} weight="duotone" />
            <StatusText>
              <span>{validationError}</span>
            </StatusText>
          </StatusRow>
        )}

        {showWsError && (
          <StatusRow $tone="danger" data-hook="mcp-pair-error" role="alert">
            <WarningIcon size={16} weight="duotone" />
            <StatusText>
              <strong>Could not connect to MCP server</strong>
              <StatusDetail>
                {lastError ??
                  `MCP server stopped responding after ${MAX_RECONNECT_ATTEMPTS} attempts. Try again, or ask your coding agent for a fresh deep link.`}
              </StatusDetail>
            </StatusText>
          </StatusRow>
        )}

        {showMajorMismatch && (
          <StatusRow
            $tone="danger"
            data-hook="mcp-pair-version-mismatch"
            role="alert"
          >
            <BridgeUpgradeNotice severity="major" />
          </StatusRow>
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

        {showMinorMismatch && (
          <StatusRow
            $tone="warning"
            data-hook="mcp-pair-version-mismatch"
            role="alert"
          >
            <BridgeUpgradeNotice severity="minor" />
          </StatusRow>
        )}

        {tone === "idle" && !validationError && <BridgeSetupNotice />}

        {(tone === "connected" || tone === "warning") && !localAgent && (
          <CodingAgentChatInvite onOpen={onClose} />
        )}

        <AgentChangesNotice agentChanges={agentChanges} onClose={onClose} />

        {!succeeded && (
          <Footer>
            {canDisconnect && (
              <Button
                variant="danger"
                onClick={onDisconnect}
                dataHook="mcp-pair-disconnect"
              >
                Disconnect
              </Button>
            )}
            <RightActions>
              <Button
                variant="secondary"
                onClick={onCancel}
                dataHook="mcp-pair-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
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
