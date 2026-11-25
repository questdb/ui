import React from "react"
import styled from "styled-components"
import { CopyButton } from "../../../components"
import { CommandText } from "../../../components/CommandText"

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.6rem;
`

const Command = styled.code`
  flex: 1;
  min-width: 0;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  background: ${({ theme }) => theme.color.surfaceInset};
  border: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.4rem;
  padding: 0.6rem 0.8rem;
  line-height: 1.5;
  /* Some hosts, like popovers, set nowrap; a command wraps between its parts. */
  white-space: normal;
`

const CopyAction = styled(CopyButton)`
  flex-shrink: 0;
`

export const CopyableCommand = ({
  command,
  onCopy,
}: {
  command: string
  onCopy?: () => void
}) => (
  <Row>
    <Command>
      <CommandText command={command} />
    </Command>
    <CopyAction text={command} iconOnly size="sm" onCopy={onCopy} />
  </Row>
)
