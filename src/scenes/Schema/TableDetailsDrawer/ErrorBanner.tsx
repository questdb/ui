import React from "react"
import styled from "styled-components"
import { XSquareIcon, ArrowSquareOutIcon } from "@phosphor-icons/react"
import { Text, Button } from "../../../components"
import { SchemaAIButton } from "./SchemaAIButton"

type Props = {
  title: string
  description?: string
  onAskAI: () => void
  docsUrl?: string
  showResumeButton?: boolean
  onResume?: () => void
}

const BannerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  overflow: hidden;
  border-radius: 0.6rem;
  border: 0.1rem solid ${({ theme }) => theme.color.redSecondary};
  border-left-width: 0.3rem;
`

const ContentSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem 1.2rem;
  width: 100%;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`

const RedText = styled(Text)`
  color: #fa4d56;
`

const IconWrapper = styled.div`
  flex-shrink: 0;
  color: rgb(220, 40, 40);
  display: flex;
  align-items: center;
  justify-content: center;
`

const ActionsSection = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 1.5rem 1.2rem;
  width: 100%;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border-top: 1px solid ${({ theme }) => theme.color.background};
`

const ResumeButton = styled(Button).attrs({
  skin: "gradient",
})`
  border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  &:hover:not([disabled]) {
    border: 1px solid ${({ theme }) => theme.color.pinkDarker};
  }
`

const DocsLink = styled.a`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.cyan};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 600;
  padding: 0;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`

export const ErrorBanner = ({
  title,
  description,
  onAskAI,
  docsUrl,
  showResumeButton,
  onResume,
}: Props) => {
  return (
    <BannerContainer data-hook="table-details-error-banner">
      <ContentSection>
        <TitleRow>
          <IconWrapper>
            <XSquareIcon size={20} weight="fill" />
          </IconWrapper>
          <RedText size="lg" weight={600} data-hook="table-details-error-title">
            {title}
          </RedText>
        </TitleRow>
        {description && <RedText size="sm">{description}</RedText>}
      </ContentSection>
      <ActionsSection>
        {showResumeButton && onResume && (
          <ResumeButton
            skin="gradient"
            onClick={onResume}
            data-hook="table-details-resume-wal-button"
          >
            Resume WAL
          </ResumeButton>
        )}
        <SchemaAIButton
          onClick={onAskAI}
          data-hook="table-details-error-ask-ai"
        >
          Ask AI
        </SchemaAIButton>
        {docsUrl && (
          <DocsLink
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-hook="table-details-error-docs-link"
          >
            View explanation in docs
            <ArrowSquareOutIcon size={14} />
          </DocsLink>
        )}
      </ActionsSection>
    </BannerContainer>
  )
}
