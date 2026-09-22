import React from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"

export type NoticeTone = "warning" | "danger"

const Root = styled.div<{ $tone: NoticeTone }>`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem 1.2rem;
  border-radius: 0.4rem;
  background: ${({ $tone, theme }) =>
    $tone === "danger"
      ? theme.color.statusDangerSurface
      : theme.color.statusWarningSurface};
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  line-height: 1.45;

  & > svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: ${({ $tone, theme }) =>
      $tone === "danger"
        ? theme.color.statusDanger
        : theme.color.statusWarning};
  }

  code {
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: inherit;
    color: inherit;
    background: none;
    border-radius: 0;
    padding: 0;
  }
`

type Props = {
  tone: NoticeTone
  children: React.ReactNode
  dataHook?: string
}

export const Notice = ({ tone, children, dataHook }: Props) => (
  <Root
    $tone={tone}
    role={tone === "danger" ? "alert" : "status"}
    data-hook={dataHook}
  >
    <WarningIcon size={16} />
    <span>{children}</span>
  </Root>
)
