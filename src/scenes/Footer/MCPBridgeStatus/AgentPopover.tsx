import React, { forwardRef, useEffect, useState } from "react"
import styled from "styled-components"
import {
  PlugsConnectedIcon,
  PlugsIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react"
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
import { agentStatusOf } from "./agentStatus"
import { AgentUpgradeNotice } from "./AgentUpgradeNotice"
import { CopyableCommand } from "./CopyableCommand"
import { PermissionsSection } from "./PermissionsSection"
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

const Workspace = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  word-break: break-all;
`

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

export const AgentPopover = forwardRef<HTMLDivElement, Props>(
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
    const agentStatus = agentStatusOf({
      agentLabel,
      agent,
      bridgeTone,
      versionMismatch,
    })
    const workspace = agent?.info.cwd ?? pairedAgent?.cwd ?? null
    const isConnected = status === "connected"
    const isDisconnected =
      agentStatus.tone === "error" && versionMismatch !== "major"
    const permissionsDirty = !permissionsEqual(draftPermissions, permissions)
    const HeaderIcon =
      agentStatus.tone === "connected" || agentStatus.tone === "warning"
        ? PlugsConnectedIcon
        : PlugsIcon

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
            <Title>{agentLabel}</Title>
            <Lede data-hook="agent-popover-description">
              {agentStatus.description}
            </Lede>
          </HeaderText>
        </Header>

        <Body>
          {workspace && (
            <Field as="div">
              <FieldLabel>Workspace</FieldLabel>
              <Workspace data-hook="agent-popover-workspace">
                {workspace}
              </Workspace>
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
            />
          </StatusRow>
        )}

        {isDisconnected && (
          <StatusRow $tone="info" data-hook="agent-popover-reconnect">
            <TerminalWindowIcon size={16} weight="duotone" />
            <StatusText>
              <span>
                To connect {agentLabel} again, run this in your terminal:
              </span>
              <CopyableCommand
                command={connectCommandOf(consoleUrlOf(window.location), "npx")}
              />
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

AgentPopover.displayName = "AgentPopover"
