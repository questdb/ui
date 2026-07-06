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

const Container = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1.2rem;
  border: 1.5px dashed ${color("pinkPrimary")};
  border-radius: 0.4rem;
`

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  background: transparent;
  border: none;
  border-radius: 0.4rem;
  color: ${color("offWhite")};
  cursor: pointer;

  &:hover {
    background: ${color("selection")};
    color: ${color("foreground")};
  }
`

const CaretButton = styled(IconButton)`
  color: ${color("pinkBadge")};

  &:hover {
    background: ${color("selection")};
    color: ${color("pinkBadge")};
  }
`

const Content = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2rem;
`

const Title = styled.h2`
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.4;
  color: ${color("foreground")};
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
  color: ${color("gray2")};
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
  background: #1a1b23;
  border: 1px solid rgba(252, 252, 252, 0.15);
  border-radius: 0.4rem;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
`

const FootNote = styled.p`
  margin: 0;
  font-size: 1.28rem;
  line-height: 1.5;
  color: ${color("mutedLabel")};
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
        <CaretButton
          title="Expand"
          onClick={() => updateNotebookOnboarding({ collapseMcpPromo: false })}
        >
          <CaretRightIcon size={20} weight="fill" />
        </CaretButton>
        <Content>{title}</Content>
        <IconButton title="Dismiss" onClick={close}>
          <XIcon size={20} />
        </IconButton>
      </Container>
    )
  }

  return (
    <Container>
      <CaretButton
        title="Collapse"
        onClick={() => updateNotebookOnboarding({ collapseMcpPromo: true })}
      >
        <CaretDownIcon size={20} weight="fill" />
      </CaretButton>
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
            <McpSetupCommand iconSize={18} />
          </CommandBox>
          <FootNote>
            Install the MCP using your terminal and use it in any coding agent
            seamlessly
          </FootNote>
        </Actions>
      </Content>
      <IconButton title="Dismiss" onClick={close}>
        <XIcon size={20} />
      </IconButton>
    </Container>
  )
}
