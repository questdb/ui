import React from "react"
import styled from "styled-components"
import { XSquareIcon } from "@phosphor-icons/react"
import { Text } from "../Text"

type Props = {
  title: string
  description?: string
  actions?: React.ReactNode
  "data-hook": string
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
  color: ${({ theme }) => theme.color.statusDanger};
`

const IconWrapper = styled.div`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.statusDangerStrong};
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

export const ErrorBanner = ({
  title,
  description,
  actions,
  "data-hook": dataHook,
}: Props) => (
  <BannerContainer data-hook={`${dataHook}-banner`}>
    <ContentSection>
      <TitleRow>
        <IconWrapper>
          <XSquareIcon size={20} weight="fill" />
        </IconWrapper>
        <RedText size="lg" weight={600} data-hook={`${dataHook}-title`}>
          {title}
        </RedText>
      </TitleRow>
      {description && <RedText size="sm">{description}</RedText>}
    </ContentSection>
    {actions && <ActionsSection>{actions}</ActionsSection>}
  </BannerContainer>
)
