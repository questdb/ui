import React, { forwardRef, useEffect, useState } from "react"
import { ChatsCircleIcon } from "@phosphor-icons/react"
import { Button } from "../../../components"
import { useMCPBridge } from "../../../providers/MCPBridgeProvider"
import {
  useLocalAgent,
  useLocalAgentChannel,
} from "../../../utils/localAgent/LocalAgentContext"
import {
  normalizePermissions,
  type Permissions,
} from "../../../utils/tools/permissions"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"
import { permissionLevelOf } from "../../../modules/ConsoleEventTracker/mcpToolEvents"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../../../components/ConnectCodingAgent/connectCommand"
import type { AgentChanges } from "./useAgentChanges"
import { deriveTone } from "./tone"
import { chatAgentNames, chatAgentStatusOf } from "./agentStatus"
import { AgentUpgradeNotice } from "./AgentUpgradeNotice"
import { CopyableCommand } from "./CopyableCommand"
import { PermissionsSection } from "./PermissionsSection"
import { chatAgentOf } from "../../../utils/localAgent/chatAgents"
import {
  AgentChangesNotice,
  Body,
  Field,
  FieldLabel,
  Footer,
  Header,
  HeaderText,
  IconBadge,
  Lede,
  RightActions,
  Root,
  StatusRow,
  StatusText,
  Title,
} from "./popoverParts"
import { PathText } from "../../../components/PathText"

const permissionsEqual = (a: Permissions, b: Permissions): boolean =>
  a.grantSchemaAccess === b.grantSchemaAccess &&
  a.read === b.read &&
  a.write === b.write

type Props = {
  open: boolean
  onClose: () => void
  agentChanges: AgentChanges
  agentLabel: string
}

export const ChatAgentPopover = forwardRef<HTMLDivElement, Props>(
  ({ open, onClose, agentChanges, agentLabel, ...rest }, ref) => {
    const {
      status,
      versionMismatch,
      url,
      token,
      disconnect,
      permissions,
      setPermissions,
      pairedAgent,
    } = useMCPBridge()
    const agent = useLocalAgent()
    const channel = useLocalAgentChannel()
    const [draftPermissions, setDraftPermissions] = useState(permissions)

    const bridgeTone = deriveTone(!!(url && token), status, versionMismatch)
    const agentStatus = chatAgentStatusOf({
      agentLabel,
      agent,
      bridgeTone,
      versionMismatch,
    })
    const workspace = agent?.info.cwd ?? pairedAgent?.cwd ?? null
    const names = chatAgentNames(agentLabel)
    // A custom agent (--agent-command) has no preset: no command runs it.
    const preset = chatAgentOf({ id: agent?.info.id, label: agentLabel })
    const isConnected = status === "connected"
    const isDisconnected =
      agentStatus.tone === "error" && versionMismatch !== "major"
    const permissionsDirty = !permissionsEqual(draftPermissions, permissions)
    // The AI Assistant way has the chat bubble everywhere; the tone colors it.
    const HeaderIcon = ChatsCircleIcon

    useEffect(() => {
      if (open) setDraftPermissions(permissions)
    }, [open])

    const savePermissions = () => {
      void trackEvent(ConsoleEvent.MCP_PERMISSIONS_CHANGE, {
        level: permissionLevelOf(normalizePermissions(draftPermissions)),
      })
      setPermissions(draftPermissions)
      onClose()
    }

    const disconnectAgent = () => {
      void trackEvent(ConsoleEvent.MCP_DISCONNECT_CLICK)
      disconnect()
      onClose()
    }

    return (
      <Root ref={ref} {...rest} data-hook="agent-popover">
        <Header>
          <IconBadge $tone={agentStatus.tone}>
            <HeaderIcon size={20} weight="duotone" />
          </IconBadge>
          <HeaderText>
            <Title>{agentStatus.label}</Title>
            <Lede data-hook="agent-popover-description">
              {versionMismatch === "minor"
                ? chatAgentStatusOf({
                    agentLabel,
                    agent,
                    bridgeTone,
                    versionMismatch: null,
                  }).description
                : agentStatus.description}
            </Lede>
          </HeaderText>
        </Header>

        <Body>
          {workspace && (
            <Field as="div">
              <FieldLabel>Workspace</FieldLabel>
              <PathText path={workspace} dataHook="agent-popover-workspace" />
            </Field>
          )}
          <PermissionsSection
            value={draftPermissions}
            onChange={setDraftPermissions}
          />
        </Body>

        {versionMismatch && (
          <StatusRow
            $tone={versionMismatch === "major" ? "danger" : "warning"}
            data-hook="agent-popover-version-mismatch"
            role="alert"
          >
            <AgentUpgradeNotice
              severity={versionMismatch}
              agentLabel={agentLabel}
              agentId={agent?.info.id ?? null}
            />
          </StatusRow>
        )}

        {isDisconnected && (
          <StatusRow $tone="info" data-hook="agent-popover-reconnect">
            <ChatsCircleIcon size={16} weight="duotone" />
            <StatusText>
              {preset ? (
                <>
                  <span>Start {names.inline} again</span>
                  <CopyableCommand
                    command={connectCommandOf(
                      consoleUrlOf(window.location),
                      "npx",
                      preset.id,
                    )}
                  />
                </>
              ) : (
                <span>
                  To connect {names.inline} again, run the connect command you
                  started it with in your terminal.
                </span>
              )}
            </StatusText>
          </StatusRow>
        )}

        <AgentChangesNotice agentChanges={agentChanges} onClose={onClose} />

        <Footer>
          {isConnected && (
            <Button
              variant="danger"
              onClick={disconnectAgent}
              dataHook="agent-popover-disconnect"
            >
              Disconnect
            </Button>
          )}
          <RightActions>
            {agent?.state === "error" && channel && (
              <Button
                variant="secondary"
                onClick={() => channel.restart()}
                dataHook="agent-popover-restart"
              >
                Start again
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onClose}
              dataHook="agent-popover-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={savePermissions}
              disabled={!permissionsDirty}
              dataHook="agent-popover-save"
            >
              Save
            </Button>
          </RightActions>
        </Footer>
      </Root>
    )
  },
)

ChatAgentPopover.displayName = "ChatAgentPopover"
