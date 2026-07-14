import React from "react"
import styled from "styled-components"
import { CopyButton } from "../../../components"

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
  color: ${({ theme }) => theme.color.foreground};
  background: ${({ theme }) => theme.color.backgroundDarker};
  border: 1px solid ${({ theme }) => theme.color.selection};
  border-radius: 0.4rem;
  padding: 0.6rem 0.8rem;
  word-break: break-all;
  user-select: all;
`

export const CopyableCommand = ({ command }: { command: string }) => (
  <Row>
    <Command>{command}</Command>
    <CopyButton text={command} iconOnly size="sm" />
  </Row>
)
