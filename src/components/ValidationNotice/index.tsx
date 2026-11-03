import React, { ReactNode } from "react"
import styled from "styled-components"
import { WarningIcon } from "@phosphor-icons/react"

const Notice = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 2.4rem;
  background: ${({ theme }) => theme.color.statusDangerSurface};
  border-top: 0.1rem solid ${({ theme }) => theme.color.interactionNeutral};
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.3rem;
  line-height: 1.3;

  > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.statusDanger};
  }
`

type ValidationNoticeProps = {
  children: ReactNode
  dataHook: string
}

export const ValidationNotice = ({
  children,
  dataHook,
}: ValidationNoticeProps) => (
  <Notice role="alert" data-hook={dataHook}>
    <WarningIcon size={16} weight="fill" aria-hidden />
    <span>{children}</span>
  </Notice>
)
