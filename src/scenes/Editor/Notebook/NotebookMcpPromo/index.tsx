import React from "react"
import styled from "styled-components"
import { CaretDownIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react"
import { McpSetupCommand } from "../../../../components/McpSetupCommand"
import {
  Badge,
  TitleRow,
} from "../../../../components/NotebookOnboardingModal/shared"
import { useLocalStorage } from "../../../../providers/LocalStorageProvider"
import {
  isMcpPromoCollapsed,
  shouldShowMcpPromo,
} from "../../../../utils/notebookOnboarding"
import { color } from "../../../../utils"
import { IconButton as SharedIconButton } from "../../../../components"

const Container = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.2rem;
  border: 1.5px dashed ${color("contentAccent")};
  border-radius: 0.4rem;
`

const PromoIconButton = styled(SharedIconButton)`
  padding: 0.4rem;
`

const Content = styled.div`
  display: flex;
  flex: 1;
  margin-top: 0.25rem;
  min-width: 0;
  flex-direction: column;
  gap: 2rem;
`

const Title = styled.h2`
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.4;
  color: ${color("contentPrimary")};
`

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

const Description = styled.p`
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.5;
  color: ${color("contentSecondary")};
`

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`

const CommandBox = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 1.2rem;
  width: fit-content;
  max-width: 100%;
  padding: 0.5rem 0.6rem 0.5rem 1.7rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.4rem;
  box-shadow: 0 1px 1px ${({ theme }) => theme.color.shadowSubtle};
`

const FootNote = styled.p`
  margin: 0;
  font-size: 1.28rem;
  line-height: 1.5;
  color: ${color("contentMuted")};
`

export const NotebookMcpPromo = () => {
  const { notebookOnboarding, updateNotebookOnboarding } = useLocalStorage()

  const isVisible = shouldShowMcpPromo(notebookOnboarding)
  const isCollapsed = isMcpPromoCollapsed(notebookOnboarding)

  if (!isVisible) {
    return null
  }

  const title = (
    <TitleRow>
      <Title>Work with your coding agent via MCP</Title>
      <Badge>New</Badge>
    </TitleRow>
  )

  const close = () => updateNotebookOnboarding({ showMcpPromo: false })

  if (isCollapsed) {
    return (
      <Container>
        <PromoIconButton
          label="Expand"
          variant="ghost"
          title="Expand"
          onClick={() => updateNotebookOnboarding({ collapseMcpPromo: false })}
        >
          <CaretRightIcon size={20} weight="fill" />
        </PromoIconButton>
        <Content>{title}</Content>
        <PromoIconButton
          label="Dismiss"
          variant="ghost"
          title="Dismiss"
          onClick={close}
        >
          <XIcon size={20} />
        </PromoIconButton>
      </Container>
    )
  }

  return (
    <Container>
      <PromoIconButton
        label="Collapse"
        variant="ghost"
        title="Collapse"
        onClick={() => updateNotebookOnboarding({ collapseMcpPromo: true })}
      >
        <CaretDownIcon size={20} weight="fill" />
      </PromoIconButton>
      <Content>
        <Header>
          {title}
          <Description>
            A shared notebook your AI agent can drive over MCP. You keep control
            of the data. Hand analysis back and forth with your agent – queries,
            charts, and dashboards in one surface.
          </Description>
        </Header>
        <Actions>
          <CommandBox>
            <McpSetupCommand iconSize={18} source="promo" />
          </CommandBox>
          <FootNote>
            Install the MCP using your terminal and use it in any coding agent
            seamlessly
          </FootNote>
        </Actions>
      </Content>
      <PromoIconButton
        label="Dismiss"
        variant="ghost"
        title="Dismiss"
        onClick={close}
      >
        <XIcon size={20} />
      </PromoIconButton>
    </Container>
  )
}
