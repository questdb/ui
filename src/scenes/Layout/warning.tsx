import React, { useEffect, useState } from "react"
import styled from "styled-components"
import { useSettings } from "../../providers"
import { Close, ErrorWarning, ExternalLink } from "../../components/icons"
import { errorWorkarounds } from "../../utils/errorWorkarounds"
import { IconButton } from "../../components"
import { ErrorTag } from "utils"

const WarningsRoot = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${({ theme }) => theme.color.surfaceBase};
`

const WarningRoot = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  width: 100%;
  min-height: 4.8rem;
  padding: 0.7rem 1rem 0.7rem 1.4rem;
  background: ${({ theme }) => theme.color.statusWarningSurface};
  color: ${({ theme }) => theme.color.contentPrimary};

  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.borderDefault};
  }
`

const WarningIcon = styled(ErrorWarning)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.statusWarning};
`

const Content = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem 0.8rem;
  min-width: 0;
  line-height: 1.45;
`

const WarningText = styled.span`
  min-width: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: ${({ theme }) => theme.fontSize.md};
  font-weight: 500;
`

const WorkaroundLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: ${({ theme }) => theme.color.statusInfo};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.borderStrong};
    outline-offset: 2px;
    border-radius: 0.2rem;
  }

  svg {
    flex-shrink: 0;
  }
`

export const Warnings = () => {
  const { warnings } = useSettings()
  const [open, setOpen] = useState<ErrorTag[]>([])

  useEffect(() => {
    if (warnings && warnings.length > 0) {
      setOpen(warnings.map((warning) => warning.tag))
    }
  }, [warnings])

  if (open.length === 0) return null

  return (
    <WarningsRoot data-hook="warnings">
      {warnings
        .filter((warning) => open.includes(warning.tag))
        .map((warning) => (
          <WarningRoot
            key={`${warning.tag}-${warning.warning}`}
            data-hook="warning"
          >
            <WarningIcon size={20} weight="fill" aria-hidden />
            <Content>
              <WarningText data-hook="warning-text">
                {warning.warning}
              </WarningText>
              {errorWorkarounds[warning.tag] && (
                <WorkaroundLink
                  href={errorWorkarounds[warning.tag].link}
                  rel="noreferrer noopener"
                  target="_blank"
                  data-hook="warning-workaround-link"
                >
                  {errorWorkarounds[warning.tag].title}
                  <ExternalLink size={14} />
                </WorkaroundLink>
              )}
            </Content>
            <IconButton
              label="Dismiss warning"
              variant="ghost"
              size="sm"
              dataHook="warning-close-button"
              onClick={() =>
                setOpen(open.filter((errorTag) => errorTag !== warning.tag))
              }
            >
              <Close size={16} />
            </IconButton>
          </WarningRoot>
        ))}
    </WarningsRoot>
  )
}
