import React, { forwardRef, useEffect, useState } from "react"
import styled from "styled-components"
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
import { mcpAgentNames, mcpAgentStatusOf } from "./agentStatus"
import {
  AgentChangesNotice,
  Body,
  DisclosureToggle,
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
import { ConnectAgentOptions } from "./ConnectAgentOptions"
import { AGENT_VALUE } from "../../../components/ConnectCodingAgent/copy"
import { CodingAgentChatInvite } from "./CodingAgentChatInvite"
import { useLocalAgent } from "../../../utils/localAgent/LocalAgentContext"
import { PermissionsSection } from "./PermissionsSection"

const permissionsEqual = (a: Permissions, b: Permissions): boolean =>
  a.grantSchemaAccess === b.grantSchemaAccess &&
  a.read === b.read &&
  a.write === b.write

const SUCCESS_AUTOCLOSE_MS = 3_000

// A section of its own, like the connect options above it.
const ManualBody = styled(Body)`
  padding-top: 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const DEFAULT_WS_URL_PREFIX = "ws://127.0.0.1:"

type Props = {
  open: boolean
  onClose: () => void
  agentChanges: AgentChanges
}

export const McpAgentPopover = forwardRef<HTMLDivElement, Props>(
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
      mcpClient,
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
    // The address and key fields: a fallback for when the agent's link
    // does not open in this tab, so they start hidden.
    const [showManual, setShowManual] = useState(false)

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
      setShowManual(false)
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

    const showConnecting = !succeeded && isConnecting && retryAttempt > 1
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
    // Connected with the same address and key: the button only saves
    // permission changes.
    const savesOnly = isPaired && status === "connected" && !credsDirty
    const submitLabel = isConnecting
      ? "Connecting…"
      : savesOnly
        ? "Save"
        : inErrorState && !credsDirty
          ? "Try again"
          : "Connect"

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
        setShowManual(true)
        setValidationError("Enter both the address and the key.")
        return
      }
      if (!LOCALHOST_WS_RE.test(nextUrl)) {
        setShowManual(true)
        setValidationError(
          "The address must be on this computer: ws://127.0.0.1:<port> or ws://localhost:<port>.",
        )
        return
      }
      if (!TOKEN_RE.test(nextToken)) {
        setShowManual(true)
        setValidationError(
          "This key does not look right. Copy it again from your agent's reply.",
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

    const names = mcpAgentNames(mcpClient)
    const agentStatus = mcpAgentStatusOf({
      tone,
      client: mcpClient,
      versionMismatch,
    })
    const isIdle = agentStatus.tone === "idle"

    const title = isIdle ? "Connect your agent" : agentStatus.label

    // The version notice below explains an outdated agent, so the lede
    // does not repeat it.
    const lede = succeeded
      ? `${names.subject} works from your terminal.`
      : isIdle
        ? AGENT_VALUE
        : versionMismatch === "minor"
          ? mcpAgentStatusOf({
              tone: "connected",
              client: mcpClient,
              versionMismatch: null,
            }).description
          : agentStatus.description

    // An agent that works from the terminal can also chat in the AI
    // Assistant. With no agent connected, ConnectAgentOptions offers both.
    const showChatInvite =
      !localAgent && (tone === "connected" || tone === "warning")
    const showFooter = !succeeded && (isPaired || showManual)

    const manualFields = (
      <>
        <Field>
          <FieldLabel>Address</FieldLabel>
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
          <FieldLabel>Key</FieldLabel>
          <FullWidthInput
            name="mcp-pair-token"
            value={draftToken}
            onChange={(e) => {
              setDraftToken(e.target.value)
              clearValidationError()
            }}
            placeholder="Paste the key"
            disabled={isConnecting}
            data-hook="mcp-pair-token-input"
          />
        </Field>
      </>
    )

    const permissionsSection = (
      <PermissionsSection
        value={draftPermissions}
        onChange={(next) => {
          setDraftPermissions(next)
          clearValidationError()
        }}
        disabled={isConnecting}
      />
    )

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

        {!succeeded && isPaired && <Body>{permissionsSection}</Body>}

        {showWsError && (
          <StatusRow $tone="danger" data-hook="mcp-pair-error" role="alert">
            <WarningIcon size={16} weight="duotone" />
            <StatusText>
              <strong>Could not connect to {names.inline}</strong>
              <StatusDetail>
                {lastError ??
                  `${names.subject} stopped responding. Try again, or ask it to connect to the QuestDB Web Console again.`}
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
            <BridgeUpgradeNotice severity="major" client={mcpClient} />
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
            {/* The title already says it is connecting; the row only counts
                retries. -1 on both sides so it shows retries-allowed, not
                total attempts (the first attempt isn't a retry). */}
            <StatusText>
              <StatusDetail data-hook="mcp-pair-retries">
                Retry {retryAttempt - 1} of {MAX_RECONNECT_ATTEMPTS - 1}
              </StatusDetail>
            </StatusText>
          </StatusRow>
        )}

        {showMinorMismatch && (
          <StatusRow
            $tone="warning"
            data-hook="mcp-pair-version-mismatch"
            role="alert"
          >
            <BridgeUpgradeNotice severity="minor" client={mcpClient} />
          </StatusRow>
        )}

        {isIdle && <ConnectAgentOptions />}

        {showChatInvite && (
          <CodingAgentChatInvite
            onOpen={onClose}
            chatAgent={mcpClient?.chatAgent ?? null}
          />
        )}

        <AgentChangesNotice agentChanges={agentChanges} onClose={onClose} />

        {/* A fallback for connecting: hidden while an agent is connected. */}
        {!succeeded && (!isPaired || inErrorState) && (
          <ManualBody>
            <DisclosureToggle
              type="button"
              aria-expanded={showManual}
              onClick={() => setShowManual(!showManual)}
              data-hook="mcp-pair-manual-toggle"
            >
              {showManual ? "Hide details" : "Enter details manually"}
            </DisclosureToggle>
            {showManual && manualFields}
            {showManual && !isPaired && permissionsSection}
          </ManualBody>
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

        {showFooter && (
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

McpAgentPopover.displayName = "McpAgentPopover"
