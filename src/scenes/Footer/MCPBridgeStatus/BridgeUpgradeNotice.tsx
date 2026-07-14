import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"
import {
  BRIDGE_UPGRADE_COMMAND,
  BRIDGE_VERSION_MISMATCH_COPY,
  type BridgeVersionMismatch,
} from "../../../utils/mcp/protocolVersion"
import { CopyableCommand } from "./CopyableCommand"

const Text = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  line-height: 1.4;
`

const Detail = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.gray2};
  word-break: break-word;
`

export const BridgeUpgradeNotice = ({
  severity,
}: {
  severity: BridgeVersionMismatch
}) => {
  const copy = BRIDGE_VERSION_MISMATCH_COPY[severity]
  return (
    <>
      <WarningIcon size={16} weight="duotone" />
      <Text>
        <strong>{copy.title}</strong>
        <Detail>{copy.message}</Detail>
        <CopyableCommand command={BRIDGE_UPGRADE_COMMAND} />
      </Text>
    </>
  )
}
