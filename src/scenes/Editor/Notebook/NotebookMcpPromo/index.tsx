import React from "react"
import styled from "styled-components"
import {
  CaretDownIcon,
  CaretRightIcon,
  ChatsCircleIcon,
  TerminalWindowIcon,
  XIcon,
} from "@phosphor-icons/react"
import {
  McpSetupCommand,
  TerminalCommand,
} from "../../../../components/McpSetupCommand"
import {
  connectCommandOf,
  consoleUrlOf,
} from "../../../../components/ConnectCodingAgent/connectCommand"
import {
  FROM_TERMINAL,
  IN_AI_ASSISTANT,
  AGENT_VALUE,
} from "../../../../components/ConnectCodingAgent/copy"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import {
  Badge,
  Separator,
  TitleRow,
} from "../../../../components/ConnectCodingAgent/parts"
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
  background: ${({ theme }) =>
    theme.mode === "light" ? theme.color.surfaceValue : "transparent"};
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
  gap: 1.6rem;
`

const Option = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`

// The promo is wide; the "or" between the two ways stays the width of a
// command box.
const OrRow = styled.div`
  max-width: 60rem;
`

const OptionTitle = styled.span`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.4rem;
  font-weight: 600;
  color: ${color("contentPrimary")};

  svg {
    flex-shrink: 0;
    color: ${color("contentSecondary")};
  }
`

const Hint = styled.p`
  margin: 0;
  font-size: 1.28rem;
  line-height: 1.5;
  color: ${color("contentMuted")};
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

export const NotebookMcpPromo = () => {
  const { notebookOnboarding, updateNotebookOnboarding } = useLocalStorage()

  const isVisible = shouldShowMcpPromo(notebookOnboarding)
  const isCollapsed = isMcpPromoCollapsed(notebookOnboarding)

  if (!isVisible) {
    return null
  }

  const title = (
    <TitleRow>
      <Title>Work on notebooks with your agent</Title>
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
          <Description>{AGENT_VALUE}</Description>
        </Header>
        <Actions>
          <Option data-hook="notebook-promo-ai-assistant-option">
            <OptionTitle>
              <ChatsCircleIcon size={18} weight="duotone" />
              {IN_AI_ASSISTANT.title}
            </OptionTitle>
            <CommandBox>
              <TerminalCommand
                command={connectCommandOf(consoleUrlOf(window.location), "npx")}
                iconSize={18}
                onCopy={() =>
                  void trackEvent(ConsoleEvent.LOCAL_AGENT_COMMAND_COPY, {
                    source: "promo",
                  })
                }
              />
            </CommandBox>
          </Option>
          <OrRow>
            <Separator label="or" />
          </OrRow>
          <Option data-hook="notebook-promo-terminal-option">
            <OptionTitle>
              <TerminalWindowIcon size={18} weight="duotone" />
              {FROM_TERMINAL.title}
            </OptionTitle>
            <CommandBox>
              <McpSetupCommand iconSize={18} source="promo" />
            </CommandBox>
            <Hint>{FROM_TERMINAL.then}</Hint>
          </Option>
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
