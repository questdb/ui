import React from "react"
import styled, { keyframes } from "styled-components"
import {
  ArrowUpRightIcon,
  DownloadSimpleIcon,
  RocketLaunchIcon,
  XIcon,
} from "@phosphor-icons/react"

import { Button, IconButton, type ButtonProps } from "../../../components"
import { FOOTER_HEIGHT } from "../../../consts"

type Props = Readonly<{
  onClick: () => void
}>

const bannerAttention = (
  borderColor: string,
  glowColor: string,
  mediumShadow: string,
  overlayShadow: string,
) => keyframes`
  0%, 100% {
    box-shadow:
      0 0 0 1px ${borderColor},
      0 0.8rem 1.8rem -0.5rem ${mediumShadow},
      0 2rem 4.8rem -1.2rem ${overlayShadow};
  }

  45% {
    box-shadow:
      0 0 0 1px ${borderColor},
      0 0 2.4rem ${glowColor},
      0 0.8rem 1.8rem -0.5rem ${mediumShadow},
      0 2rem 4.8rem -1.2rem ${overlayShadow};
  }
`

const Wrapper = styled.div`
  position: fixed;
  z-index: 30;
  box-sizing: border-box;
  display: flex;
  bottom: calc(${FOOTER_HEIGHT} + 1.2rem);
  left: 50%;
  transform: translateX(-50%);
  width: min(75rem, calc(100vw - 3.2rem));
  padding: 0.9rem 1rem 0.9rem 1.2rem;
  gap: 1.2rem;
  align-items: center;
  background: ${({ theme }) => theme.color.surfaceOverlay};
  border: 1px solid ${({ theme }) => theme.color.actionPrimary};
  border-radius: 0.8rem;
  box-shadow:
    0 0 0 1px ${({ theme }) => theme.color.borderAccent},
    0 0.8rem 1.8rem -0.5rem ${({ theme }) => theme.color.shadowMedium},
    0 2rem 4.8rem -1.2rem ${({ theme }) => theme.color.shadowOverlay};
  color: ${({ theme }) => theme.color.contentPrimary};
  will-change: transform, opacity;
  overflow: hidden;
  animation: ${({ theme }) =>
      bannerAttention(
        theme.color.borderAccentStrong,
        theme.color.borderAccent,
        theme.color.shadowMedium,
        theme.color.shadowOverlay,
      )}
    2.2s ease-in-out 500ms 1;

  @media (max-width: 700px) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    width: calc(100vw - 2rem);
    bottom: calc(${FOOTER_HEIGHT} + 0.8rem);
    gap: 0.8rem;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const BrandMark = styled.div`
  display: flex;
  width: 3.8rem;
  min-width: 3.8rem;
  height: 3.8rem;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.color.actionPrimary};
  border: 1px solid ${({ theme }) => theme.color.actionPrimaryHover};
  border-radius: 0.6rem;
  color: ${({ theme }) => theme.color.contentInverse};

  svg {
    display: block;
  }
`

const Message = styled.div`
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
`

const Title = styled.p`
  margin: 0;
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Description = styled.p`
  margin: 0;
  overflow: hidden;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 700px) {
    display: none;
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;

  @media (max-width: 700px) {
    grid-column: 1 / -1;
    grid-row: 2;

    & > * {
      flex: 1;
    }
  }
`

const LinkButton = (props: ButtonProps) => <Button {...props} as="a" />

const DownloadLink = styled(LinkButton).attrs({
  variant: "primary",
  size: "md",
})`
  text-decoration: none;
`

const EnterpriseLink = styled(LinkButton).attrs({
  variant: "tertiary",
  size: "md",
})`
  text-decoration: none;
`

const CloseButton = styled(IconButton)`
  color: ${({ theme }) => theme.color.contentSecondary};

  @media (max-width: 700px) {
    grid-column: 3;
    grid-row: 1;
  }
`

const CtaBanner = ({ onClick }: Props) => (
  <Wrapper>
    <BrandMark aria-hidden="true">
      <RocketLaunchIcon size={20} weight="duotone" />
    </BrandMark>
    <Message>
      <Title>Ready to build with QuestDB?</Title>
      <Description>
        Start locally, or explore Enterprise for production workloads.
      </Description>
    </Message>
    <Actions>
      <DownloadLink
        href="https://questdb.com/download"
        target="_blank"
        rel="noopener noreferrer"
        prefixIcon={<DownloadSimpleIcon size={17} weight="bold" />}
      >
        Download
      </DownloadLink>
      <EnterpriseLink
        href="https://questdb.com/enterprise"
        target="_blank"
        rel="noopener noreferrer"
        trailingIcon={<ArrowUpRightIcon size={16} weight="bold" />}
      >
        Explore Enterprise
      </EnterpriseLink>
    </Actions>
    <CloseButton
      label="Dismiss banner"
      variant="ghost"
      size="sm"
      onClick={onClick}
    >
      <XIcon size={18} />
    </CloseButton>
  </Wrapper>
)

export default CtaBanner
