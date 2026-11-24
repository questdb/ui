import React from "react"
import styled from "styled-components"
import type { DefaultTheme } from "styled-components"
import { ArrowRightIcon, InfoIcon } from "@phosphor-icons/react"
import { TextButton } from "../../../components"
import { Input } from "../../../components/Input"
import { floatingSurfaceStyles } from "../../../components/overlayStyles"
import type { AgentChanges } from "./useAgentChanges"
import { Tone, accentColor } from "./tone"

// Centres a 16px notice icon on the title's line box instead of the row top.
const ICON_TITLE_OFFSET = "0.2rem"

export const Root = styled.div`
  ${floatingSurfaceStyles}
  width: min(38rem, calc(100vw - 2rem));
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 0;
`

export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.6rem 1.6rem 1.2rem;
`

export const IconBadge = styled.div<{ $tone: Tone }>`
  width: 3.6rem;
  height: 3.6rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme, $tone }) => theme.color[accentColor($tone)]};
  color: ${({ theme, $tone }) => theme.color[accentColor($tone)]};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

export const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`

export const Title = styled.div`
  font-weight: 600;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.color.contentPrimary};
`

export const Lede = styled.p`
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.contentSecondary};
  word-break: break-word;
`

export const Body = styled.div`
  padding: 0 1.6rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

export const FieldLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  text-transform: uppercase;
  font-weight: 600;
`

export const FullWidthInput = styled(Input)`
  width: 100%;
  font-family: ${({ theme }) => theme.fontMonospace};
`

export const StatusDetail = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  word-break: break-word;
`

export type NoticeTone = "info" | "danger" | "warning"

const rowSurface = (theme: DefaultTheme, tone: NoticeTone): string => {
  if (tone === "warning") return theme.color.statusWarningSurface
  if (tone === "danger") return theme.color.statusDangerSurface
  return theme.color.surfaceInset
}

const rowAccent = (theme: DefaultTheme, tone: NoticeTone): string => {
  if (tone === "warning") return theme.color.statusWarning
  if (tone === "danger") return theme.color.statusDanger
  return theme.color.contentAccentStrong
}

const rowText = (theme: DefaultTheme, tone: NoticeTone): string =>
  tone === "info" ? theme.color.contentSecondary : theme.color.contentPrimary

// Full-bleed notice band, shared by every status message in the popover. It
// spans the popover edge to edge, so it lives outside `Body` and its padding.
// The icon holds the title's line box.
export const StatusRow = styled.div<{ $tone: NoticeTone }>`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  width: 100%;
  padding: 1.6rem;
  background: ${({ theme, $tone }) => rowSurface(theme, $tone)};
  color: ${({ theme, $tone }) => rowText(theme, $tone)};

  & > svg {
    flex-shrink: 0;
    margin-top: ${ICON_TITLE_OFFSET};
    color: ${({ theme, $tone }) => rowAccent(theme, $tone)};
  }

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }
`

// A cyan band for news the user may act on, like new agent changes.
export const InfoRow = styled(StatusRow)`
  background: ${({ theme }) => theme.color.statusInfoSurfaceStrong};
  color: ${({ theme }) => theme.color.contentPrimary};

  strong {
    line-height: 1.1;
  }

  & > svg {
    color: ${({ theme }) => theme.color.statusInfo};
  }
`

export const RowAction = styled(TextButton)`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  margin-left: auto;
  line-height: 1.3;
  align-self: center;
`

export const RowMessage = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
`

export const StatusText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  line-height: 1.4;
`

export const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 1.2rem 1.6rem;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

export const RightActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: auto;
`

// Edits the agent made in a notebook the user has not looked at yet.
export const AgentChangesNotice = ({
  agentChanges,
  onClose,
}: {
  agentChanges: AgentChanges
  onClose: () => void
}) =>
  agentChanges.hasUnseen ? (
    <InfoRow $tone="info" data-hook="mcp-pair-agent-changes">
      <InfoIcon size={16} weight="duotone" />
      <RowMessage>
        New changes from the agent in <strong>{agentChanges.label}</strong>.
      </RowMessage>
      <RowAction
        type="button"
        onClick={() => {
          void agentChanges.view()
          onClose()
        }}
        aria-label={`View agent changes in ${agentChanges.label}`}
        data-hook="mcp-pair-agent-changes-view"
      >
        View
        <ArrowRightIcon size={13} />
      </RowAction>
    </InfoRow>
  ) : null
