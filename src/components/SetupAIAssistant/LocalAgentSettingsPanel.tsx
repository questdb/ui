import React from "react"
import styled from "styled-components"
import { TextButton } from "../TextButton"
import type { LocalAgentSnapshot } from "../../utils/localAgent/localAgentChannel"
import { PathText } from "../PathText"

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.8rem;
  width: 100%;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

const Title = styled.h3`
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Facts = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 2.4rem;
  row-gap: 0.8rem;
  margin: 0;
  font-size: 1.3rem;
`

const FactName = styled.dt`
  color: ${({ theme }) => theme.color.contentSecondary};
`

const FactValue = styled.dd`
  display: flex;
  align-items: baseline;
  gap: 0.8rem;
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => theme.color.contentPrimary};
  overflow-wrap: anywhere;
`

const stateLabel = (agent: LocalAgentSnapshot): string => {
  switch (agent.state) {
    case "ready":
      return "Connected"
    case "starting":
      return "Starting"
    case "error":
      return agent.error ?? "Unavailable"
  }
}

type LocalAgentSettingsPanelProps = {
  agent: LocalAgentSnapshot
  onRestart: () => void
}

export const LocalAgentSettingsPanel = ({
  agent,
  onRestart,
}: LocalAgentSettingsPanelProps) => (
  <Panel data-hook="ai-settings-local-agent">
    <Section>
      <Title>{agent.info.label}</Title>
      <Facts>
        <FactName>Status</FactName>
        <FactValue>
          {stateLabel(agent)}
          {agent.state === "error" && (
            <TextButton onClick={onRestart}>Start again</TextButton>
          )}
        </FactValue>
        <FactName>Workspace</FactName>
        <FactValue>
          <PathText path={agent.info.cwd} />
        </FactValue>
      </Facts>
    </Section>
  </Panel>
)
