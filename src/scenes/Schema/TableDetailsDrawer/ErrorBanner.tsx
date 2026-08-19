import React from "react"
import styled from "styled-components"
import { XSquareIcon } from "@phosphor-icons/react"
import { Text, Button } from "../../../components"
import { DocumentationLink } from "./DocumentationLink"
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
  border: 0.1rem solid ${({ theme }) => theme.color.statusDangerMuted};
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
  color: ${({ theme }) => theme.color.statusDangerStrong};
`

const IconWrapper = styled.div`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.statusDangerMuted};
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
  background: ${({ theme }) => theme.color.surfaceInset};
  border-top: 1px solid ${({ theme }) => theme.color.borderDefault};
`

const ResumeButton = styled(Button).attrs({ variant: "gradient" })``

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
            variant="gradient"
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
          <DocumentationLink
            href={docsUrl}
            data-hook="table-details-error-docs-link"
          >
            View explanation in docs
          </DocumentationLink>
        )}
      </ActionsSection>
    </BannerContainer>
  )
}
