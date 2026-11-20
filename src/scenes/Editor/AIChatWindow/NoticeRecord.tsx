import React from "react"
import styled, { useTheme } from "styled-components"
import { InfoIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react"
import type { NoticeRecord as Notice } from "../../../utils/localAgent/noticeTranscript"

const Root = styled.div`
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  column-gap: 0.8rem;
  row-gap: 0.2rem;
  margin: 1rem 0;
`

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  height: 2rem;
`

const Title = styled.span`
  font-size: 1.4rem;
  line-height: 2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow-wrap: anywhere;
`

const Description = styled.span`
  grid-column: 2;
  font-size: 1.3rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.contentSecondary};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`

// Something the agent told the user during its reply, or why the reply
// ended early: a warning, an error, or a note.
export const NoticeRecord = ({ notice }: { notice: Notice }) => {
  const theme = useTheme()
  const icon =
    notice.severity === "error" ? (
      <WarningCircleIcon size={16} color={theme.color.statusDanger} />
    ) : notice.severity === "warning" ? (
      <WarningIcon size={16} color={theme.color.statusWarning} />
    ) : (
      <InfoIcon size={16} color={theme.color.contentSecondary} />
    )
  return (
    <Root
      role={notice.severity === "info" ? "note" : "alert"}
      data-hook="chat-notice"
      data-severity={notice.severity}
    >
      <Icon aria-hidden="true">{icon}</Icon>
      <Title>{notice.title}</Title>
      {notice.description && <Description>{notice.description}</Description>}
    </Root>
  )
}
